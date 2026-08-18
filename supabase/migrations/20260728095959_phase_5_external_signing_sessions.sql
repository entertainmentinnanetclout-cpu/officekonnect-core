create or replace function private.rotate_signing_invitation(
  p_participant_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,extensions,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_participant public.signing_participants%rowtype;
  v_request public.signing_requests%rowtype;
  v_expires timestamptz;
  v_raw_token text;
  v_hash text;
  v_old_token_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into v_participant from public.signing_participants where id=p_participant_id for update;
  if not found then raise exception using errcode='P0002',message='Signing participant not found'; end if;
  select * into v_request from public.signing_requests where id=v_participant.request_id for update;
  if v_request.sender_id<>v_user_id and not private.has_workspace_role(v_request.workspace_id,'admin'::public.workspace_role) then
    raise exception using errcode='42501',message='Only the sender or workspace administrator may rotate an invitation';
  end if;
  if v_request.status not in ('sent','in_progress') or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not active';
  end if;
  if nullif(trim(v_participant.email),'') is null then
    raise exception using errcode='22023',message='Participant requires an email address for secure-link access';
  end if;
  if v_participant.status in ('signed','declined') then
    raise exception using errcode='22023',message='Completed participants cannot receive a new invitation';
  end if;

  v_expires:=least(coalesce(p_expires_at,v_request.expires_at,now()+interval '7 days'),coalesce(v_request.expires_at,now()+interval '30 days'));
  if v_expires<=now()+interval '15 minutes' then raise exception using errcode='22023',message='Invitation expiry must be at least 15 minutes from now'; end if;

  select id into v_old_token_id from public.signing_tokens
  where participant_id=v_participant.id and revoked_at is null
  order by created_at desc limit 1;
  update public.signing_tokens set revoked_at=coalesce(revoked_at,now()) where participant_id=v_participant.id and revoked_at is null;
  update private.signing_sessions set revoked_at=coalesce(revoked_at,now()) where participant_id=v_participant.id and revoked_at is null;
  update public.signing_participants
  set token_version=token_version+1,access_revoked_at=null,invited_at=now(),last_reminded_at=now(),last_notified_at=now()
  where id=v_participant.id returning * into v_participant;

  v_raw_token:=encode(gen_random_bytes(32),'hex');
  v_hash:=encode(digest(v_raw_token,'sha256'),'hex');
  insert into public.signing_tokens(
    token_hash,request_id,participant_id,expires_at,purpose,token_version,created_by,rotated_from_id
  ) values(
    v_hash,v_request.id,v_participant.id,v_expires,
    case when v_participant.role='cc'::public.signing_participant_role then 'view' else 'sign' end,
    v_participant.token_version,v_user_id,v_old_token_id
  );

  insert into public.signing_events(request_id,actor_id,event_type,metadata,event_source)
  values(v_request.id,v_user_id,'invitation.rotated',jsonb_build_object('participantId',v_participant.id,'expiresAt',v_expires),'authenticated_rpc');

  return jsonb_build_object(
    'participantId',v_participant.id,'email',v_participant.email,'fullName',v_participant.full_name,
    'role',v_participant.role,'token',v_raw_token,'expiresAt',v_expires
  );
end;
$$;

create or replace function public.rotate_signing_invitation(p_participant_id uuid,p_expires_at timestamptz default null)
returns jsonb
language sql security invoker set search_path=public,private,pg_temp
as $$ select private.rotate_signing_invitation(p_participant_id,p_expires_at); $$;

create or replace function private.exchange_signing_token(
  p_token_hash text,
  p_session_hash text,
  p_session_expires_at timestamptz,
  p_ip_hash text,
  p_user_agent_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_token public.signing_tokens%rowtype;
  v_participant public.signing_participants%rowtype;
  v_request public.signing_requests%rowtype;
  v_session private.signing_sessions%rowtype;
  v_expiry timestamptz;
begin
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid invitation token'; end if;
  if p_session_hash is null or p_session_hash!~'^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid signing session'; end if;

  select * into v_token from public.signing_tokens where token_hash=p_token_hash for update;
  if not found or v_token.revoked_at is not null or v_token.used_at is not null or v_token.expires_at<=now() then
    raise exception using errcode='42501',message='Invitation token is invalid, expired or already used';
  end if;
  select * into v_participant from public.signing_participants where id=v_token.participant_id for update;
  select * into v_request from public.signing_requests where id=v_token.request_id for update;
  if v_participant.request_id<>v_request.id or v_token.token_version<>v_participant.token_version then
    raise exception using errcode='42501',message='Invitation token version is no longer valid';
  end if;
  if v_request.status not in ('sent','in_progress') or v_request.locked_at is null or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not active';
  end if;
  if v_request.expires_at is not null and v_request.expires_at<=now() then raise exception using errcode='22023',message='Signing request has expired'; end if;
  if v_participant.access_revoked_at is not null or v_participant.status in ('signed','declined') then
    raise exception using errcode='42501',message='Participant access is no longer active';
  end if;
  if v_token.purpose='sign' and v_request.signing_order='sequential' and v_participant.order_index<>v_request.current_order_index then
    raise exception using errcode='22023',message='This participant is not currently eligible to sign';
  end if;

  v_expiry:=least(p_session_expires_at,now()+interval '30 minutes',v_token.expires_at,coalesce(v_request.expires_at,v_token.expires_at));
  if v_expiry<=now()+interval '1 minute' then raise exception using errcode='22023',message='Signing session expiry is invalid'; end if;

  insert into private.signing_sessions(token_id,request_id,participant_id,session_hash,expires_at,ip_hash,user_agent_hash)
  values(v_token.id,v_request.id,v_participant.id,p_session_hash,v_expiry,p_ip_hash,p_user_agent_hash)
  returning * into v_session;

  update public.signing_tokens
  set used_at=now(),first_used_at=coalesce(first_used_at,now()),last_used_at=now(),use_count=use_count+1
  where id=v_token.id;
  update public.signing_participants
  set status=case when status='pending' then 'viewed'::public.signing_participant_status else status end,
      viewed_at=coalesce(viewed_at,now()),last_access_at=now()
  where id=v_participant.id returning * into v_participant;
  if v_request.status='sent' then
    update public.signing_requests set status='in_progress'::public.signing_request_status,revision=revision+1
    where id=v_request.id returning * into v_request;
  end if;

  insert into public.signing_events(request_id,event_type,metadata,ip,user_agent,event_source)
  values(v_request.id,'participant.session_started',jsonb_build_object('participantId',v_participant.id,'sessionId',v_session.id),p_ip_hash,p_user_agent_hash,'external_gateway');

  return jsonb_build_object(
    'sessionId',v_session.id,'sessionExpiresAt',v_expiry,'scope',v_token.purpose,
    'requestId',v_request.id,'participantId',v_participant.id
  );
end;
$$;

create or replace function private.get_signing_session_payload(p_session_hash text)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_session private.signing_sessions%rowtype;
  v_request public.signing_requests%rowtype;
  v_participant public.signing_participants%rowtype;
  v_version public.document_versions%rowtype;
  v_fields jsonb;
begin
  select * into v_session from private.signing_sessions where session_hash=p_session_hash for update;
  if not found or v_session.revoked_at is not null or v_session.expires_at<=now() then
    raise exception using errcode='42501',message='Signing session is invalid or expired';
  end if;
  select * into v_request from public.signing_requests where id=v_session.request_id;
  select * into v_participant from public.signing_participants where id=v_session.participant_id;
  select * into v_version from public.document_versions where id=v_request.source_document_version_id;
  if v_request.status not in ('sent','in_progress') or v_request.voided_at is not null then raise exception using errcode='22023',message='Signing request is not active'; end if;
  if v_participant.access_revoked_at is not null then raise exception using errcode='42501',message='Participant access has been revoked'; end if;

  update private.signing_sessions set last_seen_at=now() where id=v_session.id;
  update public.signing_participants set last_access_at=now() where id=v_participant.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sf.id,'fieldKey',sf.field_key,'label',sf.label,'page',sf.page,
    'x',sf.x,'y',sf.y,'w',sf.w,'h',sf.h,'rotation',sf.rotation,
    'type',sf.type,'required',sf.required,'value',sf.value,
    'completed',sf.signed_at is not null
  ) order by sf.page,sf.id),'[]'::jsonb)
  into v_fields
  from public.signing_fields sf where sf.request_id=v_request.id and sf.participant_id=v_participant.id;

  return jsonb_build_object(
    'request',jsonb_build_object(
      'id',v_request.id,'title',v_request.title,'message',v_request.message,'status',v_request.status,
      'expiresAt',v_request.expires_at,'signingOrder',v_request.signing_order,
      'currentOrderIndex',v_request.current_order_index,'sourceDocumentVersionId',v_request.source_document_version_id
    ),
    'participant',jsonb_build_object(
      'id',v_participant.id,'email',v_participant.email,'fullName',v_participant.full_name,
      'role',v_participant.role,'status',v_participant.status,'orderIndex',v_participant.order_index
    ),
    'source',jsonb_build_object('fileUrl',v_version.file_url,'storagePath',v_version.storage_path),
    'fields',v_fields,'sessionExpiresAt',v_session.expires_at
  );
end;
$$;

create or replace function public.exchange_signing_token(
  p_token_hash text,p_session_hash text,p_session_expires_at timestamptz,p_ip_hash text,p_user_agent_hash text
)
returns jsonb language sql security definer set search_path=public,private,pg_temp
as $$ select private.exchange_signing_token(p_token_hash,p_session_hash,p_session_expires_at,p_ip_hash,p_user_agent_hash); $$;

create or replace function public.get_signing_session_payload(p_session_hash text)
returns jsonb language sql security definer set search_path=public,private,pg_temp
as $$ select private.get_signing_session_payload(p_session_hash); $$;

create or replace function public.complete_external_signing_session(
  p_session_hash text,p_field_values jsonb,p_consent_text_version text,p_ip_hash text,p_user_agent_hash text
)
returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_session private.signing_sessions%rowtype;
begin
  select * into v_session from private.signing_sessions where session_hash=p_session_hash;
  if not found then raise exception using errcode='42501',message='Signing session is invalid'; end if;
  return private.complete_signing_participant_core(
    v_session.participant_id,p_field_values,null,v_session.id,p_consent_text_version,p_ip_hash,p_user_agent_hash,'external_gateway'
  );
end;
$$;

create or replace function public.decline_external_signing_session(
  p_session_hash text,p_reason text
)
returns public.signing_requests
language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_session private.signing_sessions%rowtype;
begin
  select * into v_session from private.signing_sessions where session_hash=p_session_hash;
  if not found then raise exception using errcode='42501',message='Signing session is invalid'; end if;
  return private.decline_signing_participant_core(v_session.participant_id,p_reason,null,v_session.id,'external_gateway');
end;
$$;

revoke all on function public.rotate_signing_invitation(uuid,timestamptz) from public,anon;
grant execute on function public.rotate_signing_invitation(uuid,timestamptz) to authenticated;
grant execute on function private.rotate_signing_invitation(uuid,timestamptz) to authenticated;

revoke all on function public.exchange_signing_token(text,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.get_signing_session_payload(text) from public,anon,authenticated;
revoke all on function public.complete_external_signing_session(text,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.decline_external_signing_session(text,text) from public,anon,authenticated;
grant execute on function public.exchange_signing_token(text,text,timestamptz,text,text) to service_role;
grant execute on function public.get_signing_session_payload(text) to service_role;
grant execute on function public.complete_external_signing_session(text,jsonb,text,text,text) to service_role;
grant execute on function public.decline_external_signing_session(text,text) to service_role;
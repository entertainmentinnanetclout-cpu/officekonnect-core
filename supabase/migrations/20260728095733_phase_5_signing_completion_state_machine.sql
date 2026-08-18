create or replace function private.complete_signing_participant_core(
  p_participant_id uuid,
  p_field_values jsonb,
  p_actor_id uuid,
  p_session_id uuid,
  p_consent_text_version text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_event_source text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,extensions,pg_temp
as $$
declare
  v_participant public.signing_participants%rowtype;
  v_request public.signing_requests%rowtype;
  v_field public.signing_fields%rowtype;
  v_item jsonb;
  v_field_id uuid;
  v_value text;
  v_signature_id uuid;
  v_signature_path text;
  v_hashes record;
  v_completion_hash text;
  v_next_order integer;
  v_remaining integer;
  v_job_id uuid;
  v_ready boolean:=false;
begin
  if jsonb_typeof(coalesce(p_field_values,'[]'::jsonb))<>'array' then
    raise exception using errcode='22023',message='Field values must be a JSON array';
  end if;
  if nullif(trim(p_consent_text_version),'') is null then
    raise exception using errcode='22023',message='Signing consent is required';
  end if;

  select * into v_participant from public.signing_participants where id=p_participant_id for update;
  if not found then raise exception using errcode='P0002',message='Signing participant not found'; end if;
  select * into v_request from public.signing_requests where id=v_participant.request_id for update;

  if v_request.status not in ('sent'::public.signing_request_status,'in_progress'::public.signing_request_status)
     or v_request.locked_at is null or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not active';
  end if;
  if v_request.expires_at is not null and v_request.expires_at<=now() then
    raise exception using errcode='22023',message='Signing request has expired';
  end if;
  if v_participant.role='cc'::public.signing_participant_role then
    raise exception using errcode='22023',message='CC recipients do not complete signing actions';
  end if;
  if v_participant.status not in ('pending'::public.signing_participant_status,'viewed'::public.signing_participant_status) then
    raise exception using errcode='22023',message='Participant has already completed this request';
  end if;
  if v_participant.access_revoked_at is not null then
    raise exception using errcode='42501',message='Participant access has been revoked';
  end if;

  if p_actor_id is not null then
    if v_participant.user_id is null or v_participant.user_id<>p_actor_id then
      raise exception using errcode='42501',message='This signing task is not assigned to the authenticated user';
    end if;
  elsif p_session_id is not null then
    if not exists(
      select 1 from private.signing_sessions ss
      where ss.id=p_session_id and ss.participant_id=v_participant.id and ss.request_id=v_request.id
        and ss.revoked_at is null and ss.expires_at>now()
    ) then
      raise exception using errcode='42501',message='External signing session is invalid or expired';
    end if;
  else
    raise exception using errcode='42501',message='A verified signing identity is required';
  end if;

  if v_request.signing_order='sequential' and v_participant.order_index<>v_request.current_order_index then
    raise exception using errcode='22023',message='This participant is not currently eligible to sign';
  end if;

  select * into v_hashes from private.signing_configuration_hashes(v_request.id);
  if v_hashes.participants_hash is distinct from v_request.participants_hash
     or v_hashes.fields_hash is distinct from v_request.fields_hash then
    raise exception using errcode='55000',message='Signing configuration integrity check failed';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_field_values,'[]'::jsonb))
  loop
    begin
      v_field_id:=(v_item->>'fieldId')::uuid;
    exception when others then
      raise exception using errcode='22023',message='Every field value requires a valid fieldId';
    end;

    select * into v_field from public.signing_fields
    where id=v_field_id and request_id=v_request.id and participant_id=v_participant.id
    for update;
    if not found then raise exception using errcode='42501',message='Signing field is not assigned to this participant'; end if;

    v_value:=nullif(v_item->>'value','');
    v_signature_path:=nullif(v_item->>'signatureStoragePath','');
    begin
      v_signature_id:=nullif(v_item->>'signatureId','')::uuid;
    exception when others then
      raise exception using errcode='22023',message='Invalid saved signature identifier';
    end;

    if v_field.type in ('signature'::public.signing_field_type,'initial'::public.signing_field_type) then
      if v_signature_id is null and v_signature_path is null then
        raise exception using errcode='22023',message='Signature and initial fields require a signature value';
      end if;
      if v_signature_id is not null then
        if p_actor_id is null or not exists(
          select 1 from public.user_signatures us
          where us.id=v_signature_id and us.created_by=p_actor_id and us.workspace_id=v_request.workspace_id
        ) then
          raise exception using errcode='42501',message='Saved signature is not owned by the signer';
        end if;
      end if;
      if v_signature_path is not null and p_session_id is null then
        raise exception using errcode='42501',message='External signature paths require a verified external session';
      end if;
      if v_signature_path is not null and position(
        v_request.workspace_id::text||'/requests/'||v_request.id::text||'/'||v_participant.id::text||'/' in v_signature_path
      )<>1 then
        raise exception using errcode='22023',message='External signature path is outside the permitted request folder';
      end if;
    elsif v_field.required and v_value is null then
      raise exception using errcode='22023',message='A required signing field is empty';
    end if;

    update public.signing_fields
    set value=v_value,
        signed_signature_id=v_signature_id,
        signature_storage_path=v_signature_path,
        signed_at=now(),
        value_hash=encode(digest(coalesce(v_value,'')||'|'||coalesce(v_signature_id::text,'')||'|'||coalesce(v_signature_path,''),'sha256'),'hex'),
        completion_metadata=completion_metadata||jsonb_build_object(
          'eventSource',p_event_source,
          'consentTextVersion',p_consent_text_version,
          'completedAt',now()
        )
    where id=v_field.id;
  end loop;

  if exists(
    select 1 from public.signing_fields sf
    where sf.request_id=v_request.id and sf.participant_id=v_participant.id and sf.required
      and (
        (sf.type in ('signature','initial') and sf.signed_signature_id is null and sf.signature_storage_path is null)
        or (sf.type in ('text','date') and nullif(trim(sf.value),'') is null)
      )
  ) then
    raise exception using errcode='22023',message='All required signing fields must be completed';
  end if;

  select encode(digest(coalesce(jsonb_agg(jsonb_build_object(
    'fieldId',sf.id,'valueHash',sf.value_hash,'signedAt',sf.signed_at
  ) order by sf.id),'[]'::jsonb)::text,'sha256'),'hex')
  into v_completion_hash
  from public.signing_fields sf
  where sf.request_id=v_request.id and sf.participant_id=v_participant.id;

  update public.signing_participants
  set status='signed'::public.signing_participant_status,
      signed_at=now(),completed_at=now(),consent_at=now(),
      consent_text_version=trim(p_consent_text_version),
      last_access_at=now(),completion_hash=v_completion_hash,
      identity_metadata=identity_metadata||jsonb_build_object(
        'eventSource',p_event_source,
        'ipHash',p_ip_hash,
        'userAgentHash',p_user_agent_hash
      )
  where id=v_participant.id
  returning * into v_participant;

  update private.signing_sessions set last_seen_at=now()
  where id=p_session_id and p_session_id is not null;

  select count(*) into v_remaining
  from public.signing_participants
  where request_id=v_request.id and role<>'cc'::public.signing_participant_role
    and status not in ('signed'::public.signing_participant_status);

  if v_remaining=0 then
    v_ready:=true;
    update public.signing_requests
    set status='in_progress'::public.signing_request_status,
        finalization_status='queued',revision=revision+1
    where id=v_request.id returning * into v_request;

    select id into v_job_id from public.jobs
    where entity_type='signing_request' and entity_id=v_request.id
      and kind='signing_finalize'::public.job_kind and status in ('queued','running')
    order by created_at desc limit 1;
    if v_job_id is null then
      insert into public.jobs(workspace_id,created_by,kind,status,priority,input,entity_type,entity_id)
      values(v_request.workspace_id,v_request.sender_id,'signing_finalize'::public.job_kind,'queued'::public.job_status,3,
        jsonb_build_object('requestId',v_request.id,'sourceDocumentVersionId',v_request.source_document_version_id),
        'signing_request',v_request.id)
      returning id into v_job_id;
    end if;

    insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
    values(v_request.workspace_id,v_request.sender_id,'system'::public.notification_kind,
      'Document ready to finalize',v_request.title,'signing_request',v_request.id,
      jsonb_build_object('subtype','signing_ready_to_finalize','requestId',v_request.id,'jobId',v_job_id));
  else
    update public.signing_requests
    set status='in_progress'::public.signing_request_status,revision=revision+1
    where id=v_request.id returning * into v_request;

    if v_request.signing_order='sequential' then
      select min(order_index) into v_next_order
      from public.signing_participants
      where request_id=v_request.id and role<>'cc'::public.signing_participant_role
        and status in ('pending'::public.signing_participant_status,'viewed'::public.signing_participant_status);
      update public.signing_requests set current_order_index=coalesce(v_next_order,current_order_index)
      where id=v_request.id returning * into v_request;

      insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
      select v_request.workspace_id,sp.user_id,'system'::public.notification_kind,
        'Your signature is required',v_request.title,'signing_request',v_request.id,
        jsonb_build_object('subtype','signing_turn_active','requestId',v_request.id,'participantId',sp.id)
      from public.signing_participants sp
      where sp.request_id=v_request.id and sp.order_index=v_request.current_order_index
        and sp.user_id is not null and sp.status in ('pending','viewed');
    end if;
  end if;

  insert into public.signing_events(request_id,actor_id,event_type,metadata,ip,user_agent,event_source)
  values(v_request.id,p_actor_id,'participant.completed',jsonb_build_object(
    'participantId',v_participant.id,'completionHash',v_completion_hash,
    'finalizationQueued',v_ready,'jobId',v_job_id
  ),p_ip_hash,p_user_agent_hash,p_event_source);

  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  values(v_request.workspace_id,v_request.sender_id,'system'::public.notification_kind,
    'Participant completed signing',coalesce(v_participant.full_name,v_participant.email,'Participant'),
    'signing_request',v_request.id,
    jsonb_build_object('subtype','signing_participant_completed','requestId',v_request.id,'participantId',v_participant.id));

  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_request.workspace_id,p_actor_id,'signing.participant_completed','signing_request',v_request.id,
    jsonb_build_object('participantId',v_participant.id,'completionHash',v_completion_hash,'eventSource',p_event_source));

  return jsonb_build_object('request',to_jsonb(v_request),'participant',to_jsonb(v_participant),
    'finalizationQueued',v_ready,'jobId',v_job_id);
end;
$$;

create or replace function private.complete_authenticated_signing_participant(
  p_participant_id uuid,
  p_field_values jsonb,
  p_consent_text_version text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  return private.complete_signing_participant_core(
    p_participant_id,p_field_values,v_user_id,null,p_consent_text_version,null,null,'authenticated_rpc'
  );
end;
$$;

create or replace function public.complete_signing_participant(
  p_participant_id uuid,
  p_field_values jsonb,
  p_consent_text_version text
)
returns jsonb
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.complete_authenticated_signing_participant(p_participant_id,p_field_values,p_consent_text_version); $$;

revoke all on function public.complete_signing_participant(uuid,jsonb,text) from public,anon;
grant execute on function public.complete_signing_participant(uuid,jsonb,text) to authenticated;
grant execute on function private.complete_authenticated_signing_participant(uuid,jsonb,text) to authenticated;
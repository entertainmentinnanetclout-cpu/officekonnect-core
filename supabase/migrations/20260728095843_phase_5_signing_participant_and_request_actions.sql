create or replace function private.mark_signing_participant_viewed(p_participant_id uuid)
returns public.signing_participants
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_participant public.signing_participants%rowtype;
  v_request public.signing_requests%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into v_participant from public.signing_participants where id=p_participant_id for update;
  if not found or v_participant.user_id is distinct from v_user_id then
    raise exception using errcode='42501',message='Signing participant not found for this user';
  end if;
  select * into v_request from public.signing_requests where id=v_participant.request_id for update;
  if v_request.status not in ('sent','in_progress') or v_request.locked_at is null or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not active';
  end if;
  if v_request.expires_at is not null and v_request.expires_at<=now() then
    raise exception using errcode='22023',message='Signing request has expired';
  end if;
  if v_participant.status='pending'::public.signing_participant_status then
    update public.signing_participants
    set status='viewed'::public.signing_participant_status,viewed_at=coalesce(viewed_at,now()),last_access_at=now()
    where id=v_participant.id returning * into v_participant;
  else
    update public.signing_participants set last_access_at=now() where id=v_participant.id returning * into v_participant;
  end if;
  if v_request.status='sent'::public.signing_request_status then
    update public.signing_requests set status='in_progress'::public.signing_request_status,revision=revision+1
    where id=v_request.id;
  end if;
  insert into public.signing_events(request_id,actor_id,event_type,metadata,event_source)
  values(v_request.id,v_user_id,'participant.viewed',jsonb_build_object('participantId',v_participant.id),'authenticated_rpc');
  return v_participant;
end;
$$;

create or replace function public.mark_signing_participant_viewed(p_participant_id uuid)
returns public.signing_participants
language sql security invoker set search_path=public,private,pg_temp
as $$ select private.mark_signing_participant_viewed(p_participant_id); $$;

create or replace function private.decline_signing_participant_core(
  p_participant_id uuid,p_reason text,p_actor_id uuid,p_session_id uuid,p_event_source text
)
returns public.signing_requests
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_participant public.signing_participants%rowtype;
  v_request public.signing_requests%rowtype;
begin
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='Decline reason is required'; end if;
  select * into v_participant from public.signing_participants where id=p_participant_id for update;
  if not found then raise exception using errcode='P0002',message='Signing participant not found'; end if;
  select * into v_request from public.signing_requests where id=v_participant.request_id for update;
  if v_request.status not in ('sent','in_progress') or v_request.locked_at is null or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not active';
  end if;
  if p_actor_id is not null then
    if v_participant.user_id is distinct from p_actor_id then raise exception using errcode='42501',message='Signing task is not assigned to this user'; end if;
  elsif p_session_id is not null then
    if not exists(select 1 from private.signing_sessions ss where ss.id=p_session_id and ss.participant_id=v_participant.id and ss.request_id=v_request.id and ss.revoked_at is null and ss.expires_at>now()) then
      raise exception using errcode='42501',message='External signing session is invalid or expired';
    end if;
  else
    raise exception using errcode='42501',message='A verified signing identity is required';
  end if;
  if v_request.signing_order='sequential' and v_participant.order_index<>v_request.current_order_index then
    raise exception using errcode='22023',message='This participant is not currently eligible to decline';
  end if;
  if v_participant.status not in ('pending','viewed') then raise exception using errcode='22023',message='Participant task is already complete'; end if;

  update public.signing_participants
  set status='declined'::public.signing_participant_status,decline_reason=trim(p_reason),
      declined_at=now(),completed_at=now(),last_access_at=now()
  where id=v_participant.id;
  update public.signing_requests
  set status='declined'::public.signing_request_status,completed_at=now(),revision=revision+1,
      finalization_status='not_started'
  where id=v_request.id returning * into v_request;
  update public.signing_tokens set revoked_at=coalesce(revoked_at,now()) where request_id=v_request.id;
  update private.signing_sessions set revoked_at=coalesce(revoked_at,now()) where request_id=v_request.id;
  update public.signing_participants set access_revoked_at=coalesce(access_revoked_at,now())
  where request_id=v_request.id and id<>v_participant.id;

  insert into public.signing_events(request_id,actor_id,event_type,metadata,event_source)
  values(v_request.id,p_actor_id,'participant.declined',jsonb_build_object('participantId',v_participant.id,'reason',trim(p_reason)),p_event_source);
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  values(v_request.workspace_id,v_request.sender_id,'system'::public.notification_kind,'Signature request declined',trim(p_reason),'signing_request',v_request.id,
    jsonb_build_object('subtype','signing_declined','requestId',v_request.id,'participantId',v_participant.id));
  return v_request;
end;
$$;

create or replace function private.decline_authenticated_signing_participant(p_participant_id uuid,p_reason text)
returns public.signing_requests
language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  return private.decline_signing_participant_core(p_participant_id,p_reason,v_user_id,null,'authenticated_rpc');
end;
$$;

create or replace function public.decline_signing_participant(p_participant_id uuid,p_reason text)
returns public.signing_requests
language sql security invoker set search_path=public,private,pg_temp
as $$ select private.decline_authenticated_signing_participant(p_participant_id,p_reason); $$;

create or replace function private.cancel_signing_request(p_request_id uuid,p_reason text)
returns public.signing_requests
language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_request public.signing_requests%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='Cancellation reason is required'; end if;
  select * into v_request from public.signing_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Signing request not found'; end if;
  if v_request.sender_id<>v_user_id and not private.has_workspace_role(v_request.workspace_id,'admin'::public.workspace_role) then
    raise exception using errcode='42501',message='Only the sender or workspace administrator may cancel this request';
  end if;
  if v_request.status not in ('sent','in_progress') then raise exception using errcode='22023',message='Signing request is not active'; end if;

  update public.signing_requests
  set status='cancelled'::public.signing_request_status,completed_at=now(),voided_at=now(),voided_by=v_user_id,
      void_reason=trim(p_reason),revision=revision+1,finalization_status='not_started'
  where id=v_request.id returning * into v_request;
  update public.signing_tokens set revoked_at=coalesce(revoked_at,now()) where request_id=v_request.id;
  update private.signing_sessions set revoked_at=coalesce(revoked_at,now()) where request_id=v_request.id;
  update public.signing_participants set access_revoked_at=coalesce(access_revoked_at,now()) where request_id=v_request.id;
  update public.jobs set status='canceled'::public.job_status,finished_at=now()
  where entity_type='signing_request' and entity_id=v_request.id and kind='signing_finalize'::public.job_kind and status in ('queued','running');

  insert into public.signing_events(request_id,actor_id,event_type,metadata,event_source)
  values(v_request.id,v_user_id,'request.cancelled',jsonb_build_object('reason',trim(p_reason)),'authenticated_rpc');
  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_request.workspace_id,v_user_id,'signing.request_cancelled','signing_request',v_request.id,jsonb_build_object('reason',trim(p_reason)));
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  select v_request.workspace_id,sp.user_id,'system'::public.notification_kind,'Signature request cancelled',trim(p_reason),'signing_request',v_request.id,
    jsonb_build_object('subtype','signing_cancelled','requestId',v_request.id,'participantId',sp.id)
  from public.signing_participants sp where sp.request_id=v_request.id and sp.user_id is not null;
  return v_request;
end;
$$;

create or replace function public.cancel_signing_request(p_request_id uuid,p_reason text)
returns public.signing_requests
language sql security invoker set search_path=public,private,pg_temp
as $$ select private.cancel_signing_request(p_request_id,p_reason); $$;

revoke all on function public.mark_signing_participant_viewed(uuid) from public,anon;
revoke all on function public.decline_signing_participant(uuid,text) from public,anon;
revoke all on function public.cancel_signing_request(uuid,text) from public,anon;
grant execute on function public.mark_signing_participant_viewed(uuid) to authenticated;
grant execute on function public.decline_signing_participant(uuid,text) to authenticated;
grant execute on function public.cancel_signing_request(uuid,text) to authenticated;
grant execute on function private.mark_signing_participant_viewed(uuid) to authenticated;
grant execute on function private.decline_authenticated_signing_participant(uuid,text) to authenticated;
grant execute on function private.cancel_signing_request(uuid,text) to authenticated;
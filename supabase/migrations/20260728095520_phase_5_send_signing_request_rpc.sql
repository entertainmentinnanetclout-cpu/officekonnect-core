create or replace function private.send_signing_request(
  p_request_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,extensions,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_request public.signing_requests%rowtype;
  v_document public.documents%rowtype;
  v_source_version_id uuid;
  v_hashes record;
  v_expires_at timestamptz:=coalesce(p_expires_at,now()+interval '7 days');
  v_current_order integer;
  v_participant public.signing_participants%rowtype;
  v_raw_token text;
  v_token_hash text;
  v_token_id uuid;
  v_invitations jsonb:='[]'::jsonb;
  v_participant_count integer;
  v_action_count integer;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;

  select * into v_request from public.signing_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Signing request not found'; end if;
  if v_request.sender_id<>v_user_id and not private.has_workspace_role(v_request.workspace_id,'admin'::public.workspace_role) then
    raise exception using errcode='42501',message='Only the sender or workspace administrator may send this request';
  end if;
  if not private.has_workspace_role(v_request.workspace_id,'member'::public.workspace_role) then
    raise exception using errcode='42501',message='Workspace membership is required';
  end if;
  if v_request.status<>'draft'::public.signing_request_status or v_request.locked_at is not null then
    raise exception using errcode='22023',message='Only an unlocked draft may be sent';
  end if;
  if v_expires_at<=now()+interval '15 minutes' or v_expires_at>now()+interval '30 days' then
    raise exception using errcode='22023',message='Signing expiry must be between 15 minutes and 30 days from now';
  end if;

  select * into v_document from public.documents where id=v_request.document_id for update;
  if not found or v_document.workspace_id<>v_request.workspace_id then
    raise exception using errcode='22023',message='Signing request document is invalid';
  end if;
  if v_document.document_kind<>'file' or not (
    lower(coalesce(v_document.file_type,'')) in ('application/pdf','pdf')
    or lower(coalesce(v_document.storage_path,'')) like '%.pdf'
    or lower(coalesce(v_document.current_file_url,'')) like '%.pdf%'
  ) then
    raise exception using errcode='22023',message='E-signature requests require a PDF file. Export native documents or spreadsheets to PDF first';
  end if;

  select count(*),count(*) filter(where role in ('signer','approver'))
  into v_participant_count,v_action_count
  from public.signing_participants where request_id=v_request.id;
  if v_participant_count=0 or v_action_count=0 then
    raise exception using errcode='22023',message='At least one signer or approver is required';
  end if;
  if exists(
    select 1 from public.signing_participants
    where request_id=v_request.id and user_id is null and nullif(trim(email),'') is null
  ) then
    raise exception using errcode='22023',message='Every participant must have an account or email address';
  end if;
  if exists(
    select 1 from public.signing_participants sp
    where sp.request_id=v_request.id and sp.role='signer'::public.signing_participant_role
      and not exists(
        select 1 from public.signing_fields sf
        where sf.request_id=v_request.id and sf.participant_id=sp.id
          and sf.required=true and sf.type in ('signature','initial')
      )
  ) then
    raise exception using errcode='22023',message='Every signer requires at least one required signature or initial field';
  end if;
  if exists(
    select 1 from public.signing_fields sf
    join public.signing_participants sp on sp.id=sf.participant_id and sp.request_id=sf.request_id
    where sf.request_id=v_request.id and sp.role='cc'::public.signing_participant_role
  ) then
    raise exception using errcode='22023',message='CC recipients cannot own signing fields';
  end if;

  v_source_version_id:=private.create_workflow_document_snapshot(
    v_document.id,v_user_id,'Signing source snapshot','Immutable PDF snapshot created for e-signature'
  );

  select * into v_hashes from private.signing_configuration_hashes(v_request.id);
  select min(order_index) into v_current_order
  from public.signing_participants
  where request_id=v_request.id and role<>'cc'::public.signing_participant_role;

  update public.signing_requests
  set source_document_version_id=v_source_version_id,
      status='sent'::public.signing_request_status,
      sent_at=now(),expires_at=v_expires_at,locked_at=now(),
      participants_hash=v_hashes.participants_hash,
      fields_hash=v_hashes.fields_hash,
      current_order_index=coalesce(v_current_order,0),
      revision=revision+1,
      finalization_status='not_started',
      finalization_error=null
  where id=v_request.id
  returning * into v_request;

  for v_participant in
    select * from public.signing_participants
    where request_id=v_request.id and role<>'cc'::public.signing_participant_role
    order by order_index,id
  loop
    update public.signing_participants
    set invited_at=now(),last_reminded_at=null,access_revoked_at=null,
        identity_metadata=identity_metadata || jsonb_build_object(
          'verificationMethod',case when v_participant.user_id is null then 'secure_email_link' else 'authenticated_account' end
        )
    where id=v_participant.id;

    if v_participant.user_id is null then
      v_raw_token:=encode(gen_random_bytes(32),'hex');
      v_token_hash:=encode(digest(v_raw_token,'sha256'),'hex');
      insert into public.signing_tokens(
        token_hash,request_id,participant_id,expires_at,purpose,token_version,created_by
      ) values(
        v_token_hash,v_request.id,v_participant.id,v_expires_at,
        case when v_participant.role='cc'::public.signing_participant_role then 'view' else 'sign' end,
        v_participant.token_version,v_user_id
      ) returning id into v_token_id;
      v_invitations:=v_invitations || jsonb_build_array(jsonb_build_object(
        'participantId',v_participant.id,
        'email',v_participant.email,
        'fullName',v_participant.full_name,
        'role',v_participant.role,
        'token',v_raw_token,
        'expiresAt',v_expires_at
      ));
    else
      insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
      values(
        v_request.workspace_id,v_participant.user_id,'system'::public.notification_kind,
        'Signature requested',v_request.title,'signing_request',v_request.id,
        jsonb_build_object('subtype','signing_assigned','requestId',v_request.id,'participantId',v_participant.id,'documentId',v_request.document_id)
      );
    end if;
  end loop;

  insert into public.signing_events(request_id,actor_id,event_type,metadata,event_source)
  values(v_request.id,v_user_id,'request.sent',jsonb_build_object(
    'sourceDocumentVersionId',v_source_version_id,
    'expiresAt',v_expires_at,
    'participantsHash',v_hashes.participants_hash,
    'fieldsHash',v_hashes.fields_hash,
    'orderMode',v_request.signing_order
  ),'rpc');

  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_request.workspace_id,v_user_id,'signing.request_sent','signing_request',v_request.id,jsonb_build_object(
    'documentId',v_request.document_id,'sourceDocumentVersionId',v_source_version_id,'expiresAt',v_expires_at
  ));

  return jsonb_build_object('request',to_jsonb(v_request),'invitations',v_invitations);
end;
$$;

create or replace function public.send_signing_request(
  p_request_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path=public,private,pg_temp
as $$ select private.send_signing_request(p_request_id,p_expires_at); $$;

revoke all on function public.send_signing_request(uuid,timestamptz) from public,anon;
grant execute on function public.send_signing_request(uuid,timestamptz) to authenticated;
grant execute on function private.send_signing_request(uuid,timestamptz) to authenticated;
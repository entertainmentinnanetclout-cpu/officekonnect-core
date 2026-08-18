revoke execute on function public.search_officekonnect_directory(text, integer) from anon;
revoke execute on function public.search_officekonnect_directory(text, integer) from public;
grant execute on function public.search_officekonnect_directory(text, integer) to authenticated;

create or replace function private.protect_completed_signing_field()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.signed_at is not null then
    raise exception using errcode = '55000', message = 'Completed signing fields are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists signing_fields_completed_immutable on public.signing_fields;
create trigger signing_fields_completed_immutable
before update or delete on public.signing_fields
for each row
execute function private.protect_completed_signing_field();

create or replace function private.protect_completed_signing_participant()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.status = 'signed'::public.signing_participant_status then
    raise exception using errcode = '55000', message = 'Completed signing participants are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists signing_participants_completed_immutable on public.signing_participants;
create trigger signing_participants_completed_immutable
before update or delete on public.signing_participants
for each row
execute function private.protect_completed_signing_participant();

create or replace function private.complete_draft_sender_participant(
  p_participant_id uuid,
  p_field_values jsonb,
  p_consent_text_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.signing_participants%rowtype;
  v_request public.signing_requests%rowtype;
  v_field public.signing_fields%rowtype;
  v_item jsonb;
  v_field_id uuid;
  v_value text;
  v_signature_id uuid;
  v_completion_hash text;
  v_source_version_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if jsonb_typeof(coalesce(p_field_values, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Field values must be a JSON array';
  end if;
  if nullif(trim(p_consent_text_version), '') is null then
    raise exception using errcode = '22023', message = 'Signing consent is required';
  end if;

  select * into v_participant
  from public.signing_participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Signing participant not found';
  end if;

  select * into v_request
  from public.signing_requests
  where id = v_participant.request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Signing request not found';
  end if;

  if v_request.status <> 'draft'::public.signing_request_status or v_request.locked_at is not null then
    raise exception using errcode = '22023', message = 'Only an unlocked draft can be signed before sending';
  end if;
  if v_request.sender_id <> v_user_id then
    raise exception using errcode = '42501', message = 'Only the request sender can sign before sending';
  end if;
  if v_participant.user_id <> v_user_id or v_participant.role <> 'signer'::public.signing_participant_role then
    raise exception using errcode = '42501', message = 'Add your own OfficeKonnect account as a signer before signing';
  end if;
  if v_participant.status not in ('pending'::public.signing_participant_status, 'viewed'::public.signing_participant_status) then
    raise exception using errcode = '22023', message = 'This sender signing task has already been completed';
  end if;

  if not exists (
    select 1 from public.signing_fields sf
    where sf.request_id = v_request.id
      and sf.participant_id = v_participant.id
      and sf.required = true
      and sf.type in ('signature'::public.signing_field_type, 'initial'::public.signing_field_type)
  ) then
    raise exception using errcode = '22023', message = 'Your signer requires at least one required signature or initial field';
  end if;

  if v_request.source_document_version_id is null then
    v_source_version_id := private.create_workflow_document_snapshot(
      v_request.document_id,
      v_user_id,
      'Pre-send signing source snapshot',
      'Immutable source snapshot created when the sender signed before sending'
    );
    update public.signing_requests
    set source_document_version_id = v_source_version_id,
        revision = revision + 1
    where id = v_request.id
    returning * into v_request;
  else
    v_source_version_id := v_request.source_document_version_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_field_values, '[]'::jsonb))
  loop
    begin
      v_field_id := (v_item ->> 'fieldId')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Every field value requires a valid fieldId';
    end;

    select * into v_field
    from public.signing_fields
    where id = v_field_id
      and request_id = v_request.id
      and participant_id = v_participant.id
    for update;
    if not found then
      raise exception using errcode = '42501', message = 'Signing field is not assigned to you';
    end if;

    v_value := nullif(v_item ->> 'value', '');
    begin
      v_signature_id := nullif(v_item ->> 'signatureId', '')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Invalid saved signature identifier';
    end;

    if v_field.type in ('signature'::public.signing_field_type, 'initial'::public.signing_field_type) then
      if v_field.required and v_signature_id is null then
        raise exception using errcode = '22023', message = 'Signature and initial fields require a saved signature';
      end if;
      if v_signature_id is not null and not exists (
        select 1 from public.user_signatures us
        where us.id = v_signature_id
          and us.created_by = v_user_id
          and us.workspace_id = v_request.workspace_id
      ) then
        raise exception using errcode = '42501', message = 'Saved signature is not owned by the sender';
      end if;
    elsif v_field.required and v_value is null then
      raise exception using errcode = '22023', message = 'A required signing field is empty';
    end if;

    update public.signing_fields
    set value = v_value,
        signed_signature_id = v_signature_id,
        signature_storage_path = null,
        signed_at = now(),
        value_hash = encode(
          digest(coalesce(v_value, '') || '|' || coalesce(v_signature_id::text, ''), 'sha256'),
          'hex'
        ),
        completion_metadata = completion_metadata || jsonb_build_object(
          'eventSource', 'authenticated_sender_presign',
          'consentTextVersion', trim(p_consent_text_version),
          'completedAt', now(),
          'sourceDocumentVersionId', v_source_version_id
        )
    where id = v_field.id;
  end loop;

  if exists (
    select 1 from public.signing_fields sf
    where sf.request_id = v_request.id
      and sf.participant_id = v_participant.id
      and sf.required
      and (
        (sf.type in ('signature', 'initial') and sf.signed_signature_id is null)
        or (sf.type in ('text', 'date') and nullif(trim(sf.value), '') is null)
      )
  ) then
    raise exception using errcode = '22023', message = 'All required sender signing fields must be completed';
  end if;

  select encode(
    digest(
      coalesce(jsonb_agg(jsonb_build_object(
        'fieldId', sf.id,
        'valueHash', sf.value_hash,
        'signedAt', sf.signed_at
      ) order by sf.id), '[]'::jsonb)::text,
      'sha256'
    ),
    'hex'
  ) into v_completion_hash
  from public.signing_fields sf
  where sf.request_id = v_request.id
    and sf.participant_id = v_participant.id;

  update public.signing_participants
  set status = 'signed'::public.signing_participant_status,
      signed_at = now(),
      completed_at = now(),
      consent_at = now(),
      consent_text_version = trim(p_consent_text_version),
      last_access_at = now(),
      completion_hash = v_completion_hash,
      identity_metadata = identity_metadata || jsonb_build_object(
        'eventSource', 'authenticated_sender_presign',
        'sourceDocumentVersionId', v_source_version_id
      )
  where id = v_participant.id
  returning * into v_participant;

  insert into public.signing_events(request_id, actor_id, event_type, metadata, event_source)
  values(
    v_request.id,
    v_user_id,
    'sender.pre_signed',
    jsonb_build_object(
      'participantId', v_participant.id,
      'completionHash', v_completion_hash,
      'sourceDocumentVersionId', v_source_version_id
    ),
    'authenticated_sender_presign'
  );

  insert into public.activity_logs(workspace_id, user_id, action, entity_type, entity_id, metadata)
  values(
    v_request.workspace_id,
    v_user_id,
    'signing.sender_pre_signed',
    'signing_request',
    v_request.id,
    jsonb_build_object(
      'participantId', v_participant.id,
      'sourceDocumentVersionId', v_source_version_id,
      'completionHash', v_completion_hash
    )
  );

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'participant', to_jsonb(v_participant),
    'sourceDocumentVersionId', v_source_version_id
  );
end;
$$;

create or replace function public.complete_draft_sender_participant(
  p_participant_id uuid,
  p_field_values jsonb,
  p_consent_text_version text
)
returns jsonb
language sql
set search_path = public, private, pg_temp
as $$
  select private.complete_draft_sender_participant(
    p_participant_id,
    p_field_values,
    p_consent_text_version
  );
$$;

revoke all on function public.complete_draft_sender_participant(uuid, jsonb, text) from public;
revoke all on function public.complete_draft_sender_participant(uuid, jsonb, text) from anon;
grant execute on function public.complete_draft_sender_participant(uuid, jsonb, text) to authenticated;

create or replace function private.send_registered_signing_request(
  p_request_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.signing_requests%rowtype;
  v_document public.documents%rowtype;
  v_source_version_id uuid;
  v_hashes record;
  v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '7 days');
  v_current_order integer;
  v_participant public.signing_participants%rowtype;
  v_participant_count integer;
  v_action_count integer;
  v_pending_action_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_request from public.signing_requests where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Signing request not found';
  end if;
  if v_request.sender_id <> v_user_id
     and not private.has_workspace_role(v_request.workspace_id, 'admin'::public.workspace_role) then
    raise exception using errcode = '42501', message = 'Only the sender or workspace administrator may send this request';
  end if;
  if not private.has_workspace_role(v_request.workspace_id, 'member'::public.workspace_role) then
    raise exception using errcode = '42501', message = 'Workspace membership is required';
  end if;
  if v_request.status <> 'draft'::public.signing_request_status or v_request.locked_at is not null then
    raise exception using errcode = '22023', message = 'Only an unlocked draft may be sent';
  end if;
  if v_expires_at <= now() + interval '15 minutes' or v_expires_at > now() + interval '30 days' then
    raise exception using errcode = '22023', message = 'Signing expiry must be between 15 minutes and 30 days from now';
  end if;

  select * into v_document from public.documents where id = v_request.document_id for update;
  if not found or v_document.workspace_id <> v_request.workspace_id then
    raise exception using errcode = '22023', message = 'Signing request document is invalid';
  end if;
  if v_document.document_kind <> 'file' or not (
    lower(coalesce(v_document.file_type, '')) in ('application/pdf', 'pdf')
    or lower(coalesce(v_document.storage_path, '')) like '%.pdf'
    or lower(coalesce(v_document.current_file_url, '')) like '%.pdf%'
  ) then
    raise exception using errcode = '22023', message = 'E-signature requests require a PDF file. Save the document as PDF first';
  end if;

  select
    count(*),
    count(*) filter (where role in ('signer', 'approver')),
    count(*) filter (
      where role in ('signer', 'approver')
        and status in ('pending', 'viewed')
    )
  into v_participant_count, v_action_count, v_pending_action_count
  from public.signing_participants
  where request_id = v_request.id;

  if v_participant_count = 0 or v_action_count = 0 then
    raise exception using errcode = '22023', message = 'At least one signer or approver is required';
  end if;
  if v_pending_action_count = 0 then
    raise exception using errcode = '22023', message = 'At least one recipient must still need a signing or approval action before sending';
  end if;
  if exists (
    select 1 from public.signing_participants
    where request_id = v_request.id and user_id is null
  ) then
    raise exception using errcode = '22023', message = 'Every participant must have an active OfficeKonnect account';
  end if;
  if exists (
    select 1
    from public.signing_participants sp
    left join public.profiles p on p.id = sp.user_id and p.is_active = true
    left join auth.users u on u.id = sp.user_id
    where sp.request_id = v_request.id
      and (p.id is null or u.id is null or coalesce(u.is_anonymous, false) or u.email is null)
  ) then
    raise exception using errcode = '22023', message = 'Every participant must resolve to an active registered OfficeKonnect profile';
  end if;
  if exists (
    select 1 from public.signing_participants sp
    where sp.request_id = v_request.id
      and sp.role = 'signer'::public.signing_participant_role
      and not exists (
        select 1 from public.signing_fields sf
        where sf.request_id = v_request.id
          and sf.participant_id = sp.id
          and sf.required = true
          and sf.type in ('signature', 'initial')
      )
  ) then
    raise exception using errcode = '22023', message = 'Every signer requires at least one required signature or initial field';
  end if;
  if exists (
    select 1 from public.signing_fields sf
    join public.signing_participants sp
      on sp.id = sf.participant_id and sp.request_id = sf.request_id
    where sf.request_id = v_request.id and sp.role = 'cc'::public.signing_participant_role
  ) then
    raise exception using errcode = '22023', message = 'CC recipients cannot own signing fields';
  end if;

  if v_request.source_document_version_id is null then
    v_source_version_id := private.create_workflow_document_snapshot(
      v_document.id,
      v_user_id,
      'Signing source snapshot',
      'Immutable PDF snapshot created for e-signature'
    );
  else
    v_source_version_id := v_request.source_document_version_id;
  end if;

  select * into v_hashes from private.signing_configuration_hashes(v_request.id);
  select min(order_index) into v_current_order
  from public.signing_participants
  where request_id = v_request.id
    and role <> 'cc'::public.signing_participant_role
    and status in ('pending'::public.signing_participant_status, 'viewed'::public.signing_participant_status);

  update public.signing_requests
  set source_document_version_id = v_source_version_id,
      status = 'sent'::public.signing_request_status,
      sent_at = now(),
      expires_at = v_expires_at,
      locked_at = now(),
      participants_hash = v_hashes.participants_hash,
      fields_hash = v_hashes.fields_hash,
      current_order_index = coalesce(v_current_order, 0),
      revision = revision + 1,
      finalization_status = 'not_started',
      finalization_error = null
  where id = v_request.id
  returning * into v_request;

  for v_participant in
    select * from public.signing_participants
    where request_id = v_request.id
      and status in ('pending'::public.signing_participant_status, 'viewed'::public.signing_participant_status)
    order by order_index, id
  loop
    update public.signing_participants
    set invited_at = now(),
        last_reminded_at = null,
        access_revoked_at = null,
        identity_metadata = identity_metadata || jsonb_build_object(
          'verificationMethod', 'authenticated_account'
        )
    where id = v_participant.id;

    insert into public.notifications(workspace_id, user_id, kind, title, body, entity_type, entity_id, data)
    values(
      v_request.workspace_id,
      v_participant.user_id,
      'system'::public.notification_kind,
      case when v_participant.role = 'cc'::public.signing_participant_role
        then 'Document shared for signing'
        else 'Signature requested'
      end,
      v_request.title,
      'signing_request',
      v_request.id,
      jsonb_build_object(
        'subtype', case when v_participant.role = 'cc'::public.signing_participant_role
          then 'signing_cc'
          else 'signing_assigned'
        end,
        'requestId', v_request.id,
        'participantId', v_participant.id,
        'documentId', v_request.document_id
      )
    );
  end loop;

  insert into public.signing_events(request_id, actor_id, event_type, metadata, event_source)
  values(
    v_request.id,
    v_user_id,
    'request.sent',
    jsonb_build_object(
      'sourceDocumentVersionId', v_source_version_id,
      'expiresAt', v_expires_at,
      'participantsHash', v_hashes.participants_hash,
      'fieldsHash', v_hashes.fields_hash,
      'orderMode', v_request.signing_order,
      'registeredAccountsOnly', true
    ),
    'rpc'
  );

  insert into public.activity_logs(workspace_id, user_id, action, entity_type, entity_id, metadata)
  values(
    v_request.workspace_id,
    v_user_id,
    'signing.request_sent',
    'signing_request',
    v_request.id,
    jsonb_build_object(
      'documentId', v_request.document_id,
      'sourceDocumentVersionId', v_source_version_id,
      'expiresAt', v_expires_at,
      'registeredAccountsOnly', true
    )
  );

  return jsonb_build_object('request', to_jsonb(v_request), 'invitations', '[]'::jsonb);
end;
$$;

create or replace function public.send_signing_request(
  p_request_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language sql
set search_path = public, private, pg_temp
as $$
  select private.send_registered_signing_request(p_request_id, p_expires_at);
$$;

revoke all on function public.send_signing_request(uuid, timestamptz) from public;
revoke all on function public.send_signing_request(uuid, timestamptz) from anon;
grant execute on function public.send_signing_request(uuid, timestamptz) to authenticated;

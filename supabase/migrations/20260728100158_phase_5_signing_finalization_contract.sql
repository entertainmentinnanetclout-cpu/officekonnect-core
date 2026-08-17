create or replace function public.claim_signing_finalization(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_request public.signing_requests%rowtype;
  v_version public.document_versions%rowtype;
  v_fields jsonb;
  v_participants jsonb;
  v_events jsonb;
begin
  select * into v_request from public.signing_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Signing request not found'; end if;
  if v_request.status<>'in_progress'::public.signing_request_status
     or v_request.finalization_status not in ('queued','failed')
     or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not ready for finalization';
  end if;
  if exists(
    select 1 from public.signing_participants
    where request_id=v_request.id and role<>'cc'::public.signing_participant_role
      and status<>'signed'::public.signing_participant_status
  ) then
    raise exception using errcode='22023',message='All required participants must complete signing before finalization';
  end if;
  select * into v_version from public.document_versions where id=v_request.source_document_version_id;
  if not found then raise exception using errcode='P0002',message='Immutable signing source version not found'; end if;

  update public.signing_requests
  set finalization_status='running',finalization_error=null,revision=revision+1
  where id=v_request.id returning * into v_request;
  update public.jobs set status='running'::public.job_status,started_at=coalesce(started_at,now()),attempts=attempts+1,error=null
  where entity_type='signing_request' and entity_id=v_request.id and kind='signing_finalize'::public.job_kind and status in ('queued','failed');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sf.id,'participantId',sf.participant_id,'page',sf.page,'x',sf.x,'y',sf.y,'w',sf.w,'h',sf.h,
    'rotation',sf.rotation,'type',sf.type,'value',sf.value,'required',sf.required,
    'signatureStoragePath',coalesce(sf.signature_storage_path,us.storage_path,us.signature_image_url),
    'valueHash',sf.value_hash,'signedAt',sf.signed_at
  ) order by sf.page,sf.id),'[]'::jsonb)
  into v_fields
  from public.signing_fields sf
  left join public.user_signatures us on us.id=sf.signed_signature_id
  where sf.request_id=v_request.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sp.id,'email',sp.email,'fullName',sp.full_name,'role',sp.role,'status',sp.status,
    'orderIndex',sp.order_index,'viewedAt',sp.viewed_at,'signedAt',sp.signed_at,
    'declinedAt',sp.declined_at,'completionHash',sp.completion_hash,
    'consentAt',sp.consent_at,'consentTextVersion',sp.consent_text_version
  ) order by sp.order_index,sp.id),'[]'::jsonb)
  into v_participants
  from public.signing_participants sp where sp.request_id=v_request.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',se.id,'actorId',se.actor_id,'eventType',se.event_type,'metadata',se.metadata,
    'createdAt',se.created_at,'previousEventHash',se.previous_event_hash,'eventHash',se.event_hash,'eventSource',se.event_source
  ) order by se.created_at,se.id),'[]'::jsonb)
  into v_events from public.signing_events se where se.request_id=v_request.id;

  insert into public.signing_events(request_id,event_type,metadata,event_source)
  values(v_request.id,'finalization.started',jsonb_build_object('sourceDocumentVersionId',v_request.source_document_version_id),'edge_finalizer');

  return jsonb_build_object(
    'request',jsonb_build_object(
      'id',v_request.id,'workspaceId',v_request.workspace_id,'documentId',v_request.document_id,
      'senderId',v_request.sender_id,'title',v_request.title,'message',v_request.message,
      'sourceDocumentVersionId',v_request.source_document_version_id,
      'participantsHash',v_request.participants_hash,'fieldsHash',v_request.fields_hash,
      'sourceSha256',v_request.source_sha256,'revision',v_request.revision
    ),
    'source',jsonb_build_object('fileUrl',v_version.file_url,'storagePath',v_version.storage_path,'versionNumber',v_version.version_number),
    'participants',v_participants,'fields',v_fields,'events',v_events
  );
end;
$$;

create or replace function public.complete_signing_finalization(
  p_request_id uuid,
  p_source_sha256 text,
  p_final_export_path text,
  p_final_export_sha256 text,
  p_certificate_path text,
  p_certificate_sha256 text,
  p_manifest jsonb
)
returns public.signing_requests
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_request public.signing_requests%rowtype;
  v_next_version integer;
  v_final_version_id uuid;
begin
  if p_source_sha256!~'^[0-9a-f]{64}$' or p_final_export_sha256!~'^[0-9a-f]{64}$' or p_certificate_sha256!~'^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='Finalization hashes must be lowercase SHA-256 values';
  end if;
  if nullif(trim(p_final_export_path),'') is null or nullif(trim(p_certificate_path),'') is null then
    raise exception using errcode='22023',message='Final document and certificate paths are required';
  end if;

  select * into v_request from public.signing_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Signing request not found'; end if;
  if v_request.status<>'in_progress'::public.signing_request_status or v_request.finalization_status<>'running' or v_request.voided_at is not null then
    raise exception using errcode='22023',message='Signing request is not being finalized';
  end if;

  select coalesce(max(version_number),0)+1 into v_next_version
  from public.document_versions where document_id=v_request.document_id;
  insert into public.document_versions(
    document_id,version_number,file_url,storage_path,created_by,title,change_summary
  ) values(
    v_request.document_id,v_next_version,p_final_export_path,p_final_export_path,v_request.sender_id,
    'Completed signed document','Final immutable PDF produced by the e-signature workflow'
  ) returning id into v_final_version_id;

  insert into public.signing_certificates(request_id,workspace_id,certificate_path,certificate_sha256,manifest)
  values(v_request.id,v_request.workspace_id,p_certificate_path,p_certificate_sha256,coalesce(p_manifest,'{}'::jsonb))
  on conflict(request_id) do update set
    certificate_path=excluded.certificate_path,certificate_sha256=excluded.certificate_sha256,
    manifest=excluded.manifest,created_at=now();

  update public.signing_requests
  set status='completed'::public.signing_request_status,completed_at=now(),finalized_at=now(),
      source_sha256=p_source_sha256,final_export_path=p_final_export_path,final_export_sha256=p_final_export_sha256,
      final_document_version_id=v_final_version_id,audit_certificate_path=p_certificate_path,
      audit_certificate_sha256=p_certificate_sha256,finalization_status='completed',finalization_error=null,
      revision=revision+1
  where id=v_request.id returning * into v_request;

  update public.jobs set status='succeeded'::public.job_status,finished_at=now(),
    output=jsonb_build_object('finalExportPath',p_final_export_path,'finalSha256',p_final_export_sha256,
      'certificatePath',p_certificate_path,'certificateSha256',p_certificate_sha256,'finalDocumentVersionId',v_final_version_id),
    error=null
  where entity_type='signing_request' and entity_id=v_request.id and kind='signing_finalize'::public.job_kind and status='running';
  update public.signing_tokens set revoked_at=coalesce(revoked_at,now()) where request_id=v_request.id;
  update private.signing_sessions set revoked_at=coalesce(revoked_at,now()) where request_id=v_request.id;
  update public.signing_participants set access_revoked_at=coalesce(access_revoked_at,now()) where request_id=v_request.id;

  insert into public.signing_events(request_id,event_type,metadata,event_source)
  values(v_request.id,'request.completed',jsonb_build_object(
    'sourceSha256',p_source_sha256,'finalSha256',p_final_export_sha256,
    'certificateSha256',p_certificate_sha256,'finalDocumentVersionId',v_final_version_id
  ),'edge_finalizer');
  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_request.workspace_id,v_request.sender_id,'signing.request_completed','signing_request',v_request.id,
    jsonb_build_object('finalDocumentVersionId',v_final_version_id,'finalExportPath',p_final_export_path));
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  select v_request.workspace_id,recipient_id,'system'::public.notification_kind,'Signing completed',v_request.title,
    'signing_request',v_request.id,jsonb_build_object(
      'subtype','signing_completed','requestId',v_request.id,'finalDocumentVersionId',v_final_version_id,
      'certificatePath',p_certificate_path
    )
  from (
    select v_request.sender_id as recipient_id
    union
    select sp.user_id from public.signing_participants sp where sp.request_id=v_request.id and sp.user_id is not null
  ) recipients where recipient_id is not null;
  return v_request;
end;
$$;

create or replace function public.fail_signing_finalization(p_request_id uuid,p_error jsonb)
returns public.signing_requests
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_request public.signing_requests%rowtype;
begin
  select * into v_request from public.signing_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Signing request not found'; end if;
  if v_request.status<>'in_progress'::public.signing_request_status or v_request.finalization_status<>'running' then
    raise exception using errcode='22023',message='Signing request is not being finalized';
  end if;
  update public.signing_requests set finalization_status='failed',finalization_error=coalesce(p_error,'{}'::jsonb),revision=revision+1
  where id=v_request.id returning * into v_request;
  update public.jobs set status='failed'::public.job_status,finished_at=now(),error=coalesce(p_error,'{}'::jsonb)
  where entity_type='signing_request' and entity_id=v_request.id and kind='signing_finalize'::public.job_kind and status='running';
  insert into public.signing_events(request_id,event_type,metadata,event_source)
  values(v_request.id,'finalization.failed',coalesce(p_error,'{}'::jsonb),'edge_finalizer');
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  values(v_request.workspace_id,v_request.sender_id,'system'::public.notification_kind,'Signing finalization failed',v_request.title,
    'signing_request',v_request.id,jsonb_build_object('subtype','signing_finalization_failed','requestId',v_request.id));
  return v_request;
end;
$$;

revoke all on function public.claim_signing_finalization(uuid) from public,anon,authenticated;
revoke all on function public.complete_signing_finalization(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.fail_signing_finalization(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_signing_finalization(uuid) to service_role;
grant execute on function public.complete_signing_finalization(uuid,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.fail_signing_finalization(uuid,jsonb) to service_role;
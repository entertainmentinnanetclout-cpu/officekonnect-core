alter table public.signing_participants
  add constraint signing_participants_id_request_unique unique (id,request_id);

alter table public.signing_fields
  add constraint signing_fields_participant_request_fkey
  foreign key (participant_id,request_id)
  references public.signing_participants(id,request_id)
  on delete cascade;

alter table public.signing_tokens
  add constraint signing_tokens_participant_request_fkey
  foreign key (participant_id,request_id)
  references public.signing_participants(id,request_id)
  on delete cascade;

alter table private.signing_sessions
  add constraint signing_sessions_participant_request_fkey
  foreign key (participant_id,request_id)
  references public.signing_participants(id,request_id)
  on delete cascade;

alter table public.signing_requests
  add constraint signing_requests_expiry_check
    check (expires_at is null or sent_at is null or expires_at > sent_at),
  add constraint signing_requests_participants_hash_check
    check (participants_hash is null or participants_hash ~ '^[0-9a-f]{64}$'),
  add constraint signing_requests_fields_hash_check
    check (fields_hash is null or fields_hash ~ '^[0-9a-f]{64}$'),
  add constraint signing_requests_source_hash_check
    check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint signing_requests_final_hash_check
    check (final_export_sha256 is null or final_export_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint signing_requests_certificate_hash_check
    check (audit_certificate_sha256 is null or audit_certificate_sha256 ~ '^[0-9a-f]{64}$');

alter table public.signing_fields
  add constraint signing_fields_value_hash_check
    check (value_hash is null or value_hash ~ '^[0-9a-f]{64}$');

alter table private.signing_sessions
  add constraint signing_sessions_hash_check
    check (session_hash ~ '^[0-9a-f]{64}$'),
  add constraint signing_sessions_expiry_check
    check (expires_at > created_at);

create index if not exists signing_fields_participant_request_idx
  on public.signing_fields(participant_id,request_id);
create index if not exists signing_tokens_participant_request_idx
  on public.signing_tokens(participant_id,request_id);
create index if not exists signing_sessions_participant_request_idx
  on private.signing_sessions(participant_id,request_id);
create index if not exists signing_requests_active_expiry_idx
  on public.signing_requests(expires_at)
  where status in ('sent','in_progress');
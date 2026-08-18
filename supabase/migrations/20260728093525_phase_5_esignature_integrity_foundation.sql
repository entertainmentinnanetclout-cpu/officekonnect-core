-- Phase 5: additive e-signature integrity foundation.

alter table public.signing_requests
  add column if not exists source_document_version_id uuid references public.document_versions(id) on delete restrict,
  add column if not exists signing_order text not null default 'parallel',
  add column if not exists current_order_index integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists revision integer not null default 1,
  add column if not exists participants_hash text,
  add column if not exists fields_hash text,
  add column if not exists source_sha256 text,
  add column if not exists final_export_sha256 text,
  add column if not exists final_document_version_id uuid references public.document_versions(id) on delete restrict,
  add column if not exists audit_certificate_path text,
  add column if not exists audit_certificate_sha256 text,
  add column if not exists finalization_status text not null default 'not_started',
  add column if not exists finalization_error jsonb,
  add column if not exists finalized_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text;

alter table public.signing_requests
  add constraint signing_requests_signing_order_check check (signing_order in ('parallel','sequential')),
  add constraint signing_requests_current_order_check check (current_order_index >= 0),
  add constraint signing_requests_revision_check check (revision > 0),
  add constraint signing_requests_finalization_status_check check (finalization_status in ('not_started','queued','running','completed','failed'));

alter table public.signing_participants
  add column if not exists invited_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists last_reminded_at timestamptz,
  add column if not exists access_revoked_at timestamptz,
  add column if not exists token_version integer not null default 1,
  add column if not exists completion_hash text,
  add column if not exists identity_metadata jsonb not null default '{}'::jsonb;

alter table public.signing_participants
  add constraint signing_participants_identity_check
    check (user_id is not null or nullif(trim(email),'') is not null),
  add constraint signing_participants_token_version_check check (token_version > 0);

alter table public.signing_fields
  add column if not exists field_key text,
  add column if not exists label text,
  add column if not exists validation jsonb not null default '{}'::jsonb,
  add column if not exists signature_storage_path text,
  add column if not exists value_hash text,
  add column if not exists completion_metadata jsonb not null default '{}'::jsonb;

update public.signing_fields set field_key=id::text where field_key is null;
alter table public.signing_fields alter column field_key set not null;
alter table public.signing_fields
  add constraint signing_fields_coordinates_check check (
    page > 0 and x >= 0 and y >= 0 and w > 0 and h > 0
    and x <= 1 and y <= 1 and w <= 1 and h <= 1
    and x + w <= 1.000001 and y + h <= 1.000001
  );

alter table public.signing_tokens
  add column if not exists purpose text not null default 'sign',
  add column if not exists token_version integer not null default 1,
  add column if not exists first_used_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists use_count integer not null default 0,
  add column if not exists revoked_at timestamptz,
  add column if not exists rotated_from_id uuid references public.signing_tokens(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.signing_tokens
  add constraint signing_tokens_purpose_check check (purpose in ('sign','view')),
  add constraint signing_tokens_version_check check (token_version > 0),
  add constraint signing_tokens_use_count_check check (use_count >= 0);

create unique index signing_participants_request_email_uidx
  on public.signing_participants(request_id,lower(trim(email)))
  where email is not null;
create unique index signing_fields_request_field_key_uidx
  on public.signing_fields(request_id,field_key);
create index signing_requests_source_version_idx on public.signing_requests(source_document_version_id) where source_document_version_id is not null;
create index signing_requests_final_version_idx on public.signing_requests(final_document_version_id) where final_document_version_id is not null;
create index signing_requests_voided_by_idx on public.signing_requests(voided_by) where voided_by is not null;
create index signing_tokens_active_participant_idx on public.signing_tokens(participant_id,expires_at desc) where revoked_at is null;
create index signing_tokens_rotated_from_idx on public.signing_tokens(rotated_from_id) where rotated_from_id is not null;
create index signing_tokens_created_by_idx on public.signing_tokens(created_by) where created_by is not null;

create table private.signing_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.signing_requests(id) on delete cascade,
  participant_id uuid not null references public.signing_participants(id) on delete cascade,
  token_id uuid not null references public.signing_tokens(id) on delete cascade,
  session_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);
create index signing_sessions_participant_active_idx on private.signing_sessions(participant_id,expires_at desc) where revoked_at is null;
create index signing_sessions_request_idx on private.signing_sessions(request_id);
create index signing_sessions_token_idx on private.signing_sessions(token_id);

create table public.signing_certificates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.signing_requests(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  certificate_path text not null,
  certificate_sha256 text not null,
  manifest jsonb not null,
  created_at timestamptz not null default now()
);
create index signing_certificates_workspace_idx on public.signing_certificates(workspace_id,created_at desc);
alter table public.signing_certificates enable row level security;
revoke all on public.signing_certificates from anon;
revoke insert,update,delete on public.signing_certificates from authenticated;
grant select on public.signing_certificates to authenticated;
grant all on public.signing_certificates to service_role;
create policy "Signing participants read certificates"
  on public.signing_certificates for select to authenticated
  using (private.is_signing_request_sender(request_id) or private.is_signing_participant(request_id));

create or replace function private.signing_configuration_hashes(p_request_id uuid)
returns table(participants_hash text,fields_hash text)
language sql stable security definer
set search_path=public,private,extensions,pg_temp
as $$
  select
    encode(digest(coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',sp.id,'userId',sp.user_id,'email',lower(trim(sp.email)),
        'name',sp.full_name,'order',sp.order_index,'role',sp.role
      ) order by sp.order_index,sp.id)
      from public.signing_participants sp where sp.request_id=p_request_id
    ),'[]'::jsonb)::text,'sha256'),'hex'),
    encode(digest(coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',sf.id,'participantId',sf.participant_id,'key',sf.field_key,
        'page',sf.page,'x',sf.x,'y',sf.y,'w',sf.w,'h',sf.h,
        'rotation',sf.rotation,'type',sf.type,'required',sf.required,
        'validation',sf.validation
      ) order by sf.page,sf.id)
      from public.signing_fields sf where sf.request_id=p_request_id
    ),'[]'::jsonb)::text,'sha256'),'hex');
$$;

create or replace function private.guard_locked_signing_structure()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp
as $$
declare v_request_id uuid; v_locked_at timestamptz;
begin
  v_request_id:=case when tg_op='DELETE' then old.request_id else new.request_id end;
  select locked_at into v_locked_at from public.signing_requests where id=v_request_id;
  if v_locked_at is not null and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using errcode='55000',message='Sent signing requests are structurally locked';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_locked_signing_participants before insert or update or delete on public.signing_participants for each row execute function private.guard_locked_signing_structure();
create trigger guard_locked_signing_fields before insert or update or delete on public.signing_fields for each row execute function private.guard_locked_signing_structure();

create or replace function private.guard_locked_signing_request()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp
as $$
begin
  if old.locked_at is not null and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using errcode='55000',message='Sent signing requests must be changed through controlled signing operations';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_locked_signing_request before update or delete on public.signing_requests for each row execute function private.guard_locked_signing_request();

alter table public.signing_events
  add column if not exists previous_event_hash text,
  add column if not exists event_hash text,
  add column if not exists event_source text not null default 'client';

create or replace function private.chain_signing_event()
returns trigger language plpgsql security definer
set search_path=public,private,extensions,pg_temp
as $$
begin
  select se.event_hash into new.previous_event_hash
  from public.signing_events se where se.request_id=new.request_id
  order by se.created_at desc,se.id desc limit 1;
  new.event_hash:=encode(digest(jsonb_build_object(
    'id',new.id,'requestId',new.request_id,'actorId',new.actor_id,
    'type',new.event_type,'metadata',new.metadata,'ip',new.ip,
    'userAgent',new.user_agent,'createdAt',new.created_at,
    'previous',new.previous_event_hash,'source',new.event_source
  )::text,'sha256'),'hex');
  return new;
end;
$$;
create trigger chain_signing_event before insert on public.signing_events for each row execute function private.chain_signing_event();

comment on table private.signing_sessions is 'Short-lived hashed external signing sessions; not exposed through PostgREST.';
comment on table public.signing_certificates is 'Audit certificate metadata for completed signing requests.';
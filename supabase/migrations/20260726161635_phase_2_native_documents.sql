alter table public.documents
  add column if not exists document_kind text not null default 'file',
  add column if not exists content jsonb not null default '{"schemaVersion":1,"blocks":[]}'::jsonb,
  add column if not exists editor_version integer not null default 1,
  add column if not exists word_count integer not null default 0,
  add column if not exists last_saved_by uuid references auth.users(id) on delete set null,
  add column if not exists letterhead_id uuid references public.letterheads(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_document_kind_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_document_kind_check
      check (document_kind in ('file', 'native'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_content_object_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_content_object_check
      check (jsonb_typeof(content) = 'object');
  end if;
end $$;

create table if not exists public.document_templates (
  id uuid not null default gen_random_uuid() primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'general',
  content jsonb not null default '{"schemaVersion":1,"blocks":[]}'::jsonb,
  letterhead_id uuid references public.letterheads(id) on delete set null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_content_object_check
    check (jsonb_typeof(content) = 'object')
);

grant select, insert, update, delete on public.document_templates to authenticated;
grant all on public.document_templates to service_role;
alter table public.document_templates enable row level security;

create index if not exists idx_document_templates_workspace_updated
  on public.document_templates(workspace_id, updated_at desc);
create index if not exists idx_document_templates_created_by
  on public.document_templates(created_by);
create index if not exists idx_document_templates_letterhead_id
  on public.document_templates(letterhead_id);

drop policy if exists "Workspace members read document templates" on public.document_templates;
create policy "Workspace members read document templates"
  on public.document_templates for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Members create document templates" on public.document_templates;
create policy "Members create document templates"
  on public.document_templates for insert to authenticated
  with check (
    private.has_workspace_role(workspace_id, 'member')
    and created_by = (select auth.uid())
  );

drop policy if exists "Owners update document templates" on public.document_templates;
create policy "Owners update document templates"
  on public.document_templates for update to authenticated
  using (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  )
  with check (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  );

drop policy if exists "Owners delete document templates" on public.document_templates;
create policy "Owners delete document templates"
  on public.document_templates for delete to authenticated
  using (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  );

drop trigger if exists trg_document_templates_updated on public.document_templates;
create trigger trg_document_templates_updated
  before update on public.document_templates
  for each row execute function public.update_updated_at_column();

alter table public.documents
  add column if not exists template_id uuid references public.document_templates(id) on delete set null;

create index if not exists idx_documents_template_id on public.documents(template_id);
create index if not exists idx_documents_letterhead_id on public.documents(letterhead_id);
create index if not exists idx_documents_last_saved_by on public.documents(last_saved_by);
create index if not exists idx_documents_workspace_kind_updated
  on public.documents(workspace_id, document_kind, updated_at desc);

drop policy if exists "Members update own documents" on public.documents;
create policy "Members update own documents"
  on public.documents for update to authenticated
  using (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  )
  with check (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  );

alter table public.document_versions
  alter column file_url drop not null,
  add column if not exists title text,
  add column if not exists content jsonb,
  add column if not exists change_summary text,
  add column if not exists word_count integer,
  add column if not exists letterhead_id uuid references public.letterheads(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'document_versions_payload_check'
      and conrelid = 'public.document_versions'::regclass
  ) then
    alter table public.document_versions
      add constraint document_versions_payload_check
      check (file_url is not null or content is not null);
  end if;
end $$;

create index if not exists idx_document_versions_document_created
  on public.document_versions(document_id, created_at desc);
create index if not exists idx_document_versions_letterhead_id
  on public.document_versions(letterhead_id);

drop policy if exists "Members write versions" on public.document_versions;
create policy "Editors create document versions"
  on public.document_versions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.documents d
      where d.id = document_id
        and private.has_workspace_role(d.workspace_id, 'member')
        and (
          d.created_by = (select auth.uid())
          or private.has_workspace_role(d.workspace_id, 'admin')
        )
    )
  );

drop policy if exists "Members update letterheads" on public.letterheads;
create policy "Members update letterheads"
  on public.letterheads for update to authenticated
  using (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  )
  with check (
    private.has_workspace_role(workspace_id, 'member')
    and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'))
  );

comment on column public.documents.document_kind is
  'file preserves uploaded binary documents; native stores editable structured content in content.';
comment on column public.documents.content is
  'Versioned CCSF native document JSON. Binary files remain in Supabase Storage.';
comment on table public.document_templates is
  'Workspace-scoped reusable native document templates protected by RLS.';
comment on table public.document_versions is
  'Immutable snapshots for uploaded files or native document content.';
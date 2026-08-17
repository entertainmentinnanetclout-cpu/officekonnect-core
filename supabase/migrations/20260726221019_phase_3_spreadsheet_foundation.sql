-- Phase 2 backend finalization + Phase 3 spreadsheet foundation

-- 1. Extend the existing polymorphic documents model instead of creating
--    high-churn cell tables. Native workbooks remain structured JSONB.
alter table public.documents
  drop constraint if exists documents_document_kind_check;

alter table public.documents
  add constraint documents_document_kind_check
  check (document_kind in ('file', 'native', 'spreadsheet'));

alter table public.documents
  add column if not exists sheet_count integer not null default 0,
  add column if not exists cell_count bigint not null default 0,
  add column if not exists calculation_version integer not null default 1,
  add column if not exists last_calculated_at timestamptz;

alter table public.document_versions
  add column if not exists sheet_count integer,
  add column if not exists cell_count bigint,
  add column if not exists calculation_version integer;

alter table public.document_templates
  add column if not exists template_kind text not null default 'document';

-- 2. Add idempotent validation constraints.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_sheet_count_nonnegative_check'
  ) then
    alter table public.documents
      add constraint documents_sheet_count_nonnegative_check
      check (sheet_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_cell_count_nonnegative_check'
  ) then
    alter table public.documents
      add constraint documents_cell_count_nonnegative_check
      check (cell_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_calculation_version_positive_check'
  ) then
    alter table public.documents
      add constraint documents_calculation_version_positive_check
      check (calculation_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_spreadsheet_content_check'
  ) then
    alter table public.documents
      add constraint documents_spreadsheet_content_check
      check (
        document_kind <> 'spreadsheet'
        or (
          jsonb_typeof(content) = 'object'
          and content ? 'sheets'
          and jsonb_typeof(content -> 'sheets') = 'array'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_versions'::regclass
      and conname = 'document_versions_sheet_count_nonnegative_check'
  ) then
    alter table public.document_versions
      add constraint document_versions_sheet_count_nonnegative_check
      check (sheet_count is null or sheet_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_versions'::regclass
      and conname = 'document_versions_cell_count_nonnegative_check'
  ) then
    alter table public.document_versions
      add constraint document_versions_cell_count_nonnegative_check
      check (cell_count is null or cell_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_versions'::regclass
      and conname = 'document_versions_calculation_version_positive_check'
  ) then
    alter table public.document_versions
      add constraint document_versions_calculation_version_positive_check
      check (calculation_version is null or calculation_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_templates'::regclass
      and conname = 'document_templates_template_kind_check'
  ) then
    alter table public.document_templates
      add constraint document_templates_template_kind_check
      check (template_kind in ('document', 'spreadsheet'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_templates'::regclass
      and conname = 'document_templates_spreadsheet_content_check'
  ) then
    alter table public.document_templates
      add constraint document_templates_spreadsheet_content_check
      check (
        template_kind <> 'spreadsheet'
        or (
          jsonb_typeof(content) = 'object'
          and content ? 'sheets'
          and jsonb_typeof(content -> 'sheets') = 'array'
        )
      );
  end if;
end
$$;

-- 3. Targeted indexes for workbook library and template listing.
create index if not exists idx_documents_spreadsheet_workspace_updated
  on public.documents (workspace_id, updated_at desc)
  where document_kind = 'spreadsheet'
    and document_status not in ('archived'::public.document_status, 'deleted'::public.document_status);

create index if not exists idx_document_templates_spreadsheet_workspace_updated
  on public.document_templates (workspace_id, updated_at desc)
  where template_kind = 'spreadsheet' and is_archived = false;

-- 4. Finalize Phase 2 template governance: workspace templates are managed
--    by admins/owners, while all workspace members may read them.
drop policy if exists "Members create document templates" on public.document_templates;
drop policy if exists "Owners update document templates" on public.document_templates;
drop policy if exists "Owners delete document templates" on public.document_templates;

create policy "Admins create document templates"
on public.document_templates
for insert
to authenticated
with check (
  private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  and created_by = (select auth.uid())
);

create policy "Admins update document templates"
on public.document_templates
for update
to authenticated
using (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
with check (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role));

create policy "Admins delete document templates"
on public.document_templates
for delete
to authenticated
using (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role));

-- 5. Tighten and optimize document create/delete checks without changing
--    the creator/admin boundary.
drop policy if exists "Members insert documents" on public.documents;
drop policy if exists "Members delete own documents" on public.documents;

create policy "Members insert documents"
on public.documents
for insert
to authenticated
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and created_by = (select auth.uid())
);

create policy "Members delete own documents"
on public.documents
for delete
to authenticated
using (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (
    created_by = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
);

comment on column public.documents.sheet_count is
  'Cached number of worksheets for native spreadsheet documents; authoritative workbook state remains in content JSONB.';
comment on column public.documents.cell_count is
  'Cached number of populated cells for native spreadsheet documents; authoritative workbook state remains in content JSONB.';
comment on column public.documents.calculation_version is
  'Client calculation-engine schema/version used for deterministic spreadsheet recalculation.';
comment on column public.documents.last_calculated_at is
  'Timestamp of the latest successful deterministic workbook recalculation.';
comment on column public.document_templates.template_kind is
  'Template family: document or spreadsheet.';
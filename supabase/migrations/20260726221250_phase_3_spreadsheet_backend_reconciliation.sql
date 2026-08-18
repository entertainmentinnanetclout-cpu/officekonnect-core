-- Reconcile the two additive Phase 3 migrations into one canonical contract.

-- Canonical template families are document and spreadsheet.
update public.document_templates
set template_kind = 'document'
where template_kind = 'native';

alter table public.document_templates
  alter column template_kind set default 'document';

alter table public.document_templates
  drop constraint if exists document_templates_template_kind_check;

alter table public.document_templates
  add constraint document_templates_template_kind_check
  check (template_kind in ('document', 'spreadsheet'));

-- Canonical spreadsheet JSON must identify itself as a workbook and expose a sheets array.
alter table public.documents
  drop constraint if exists documents_spreadsheet_content_check;

alter table public.documents
  add constraint documents_spreadsheet_content_check
  check (
    document_kind <> 'spreadsheet'
    or (
      jsonb_typeof(content) = 'object'
      and content ->> 'kind' = 'workbook'
      and jsonb_typeof(content -> 'sheets') = 'array'
    )
  );

alter table public.document_templates
  drop constraint if exists document_templates_spreadsheet_content_check;

alter table public.document_templates
  add constraint document_templates_spreadsheet_content_check
  check (
    template_kind <> 'spreadsheet'
    or (
      jsonb_typeof(content) = 'object'
      and content ->> 'kind' = 'workbook'
      and jsonb_typeof(content -> 'sheets') = 'array'
    )
  );

-- Preserve the creator/admin rule while also requiring current workspace membership.
drop policy if exists "Members delete own documents" on public.documents;
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

comment on column public.documents.formula_count is
  'Cached count of formula cells for native spreadsheet documents; authoritative workbook state remains in content JSONB.';
comment on column public.document_versions.formula_count is
  'Formula-cell count captured with a structured spreadsheet milestone version.';
comment on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) is 'Atomically saves native document or workbook JSON using optimistic concurrency; optionally creates a milestone version. Spreadsheet JSON must use kind=workbook with a sheets array.';
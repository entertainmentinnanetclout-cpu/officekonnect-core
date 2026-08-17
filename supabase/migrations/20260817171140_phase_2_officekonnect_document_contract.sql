comment on column public.documents.document_kind is
  'file preserves uploaded binary documents; native stores editable OfficeKonnect structured content; spreadsheet stores the canonical workbook contract.';

comment on column public.documents.content is
  'Versioned OfficeKonnect structured document JSON. Binary files remain in Supabase Storage.';

comment on table public.document_templates is
  'Workspace-scoped reusable OfficeKonnect structured document and spreadsheet templates protected by RLS.';

comment on table public.document_versions is
  'Immutable OfficeKonnect snapshots for uploaded files, native documents, and spreadsheets.';

drop index if exists public.idx_documents_spreadsheet_workspace_updated;
drop index if exists public.idx_document_templates_spreadsheet_workspace_updated;

comment on index public.idx_documents_workspace_kind_updated is
  'Shared workspace/document-kind/update ordering index for native documents, spreadsheets and uploaded files.';
comment on index public.idx_document_templates_workspace_kind_updated is
  'Shared active-template index for document and spreadsheet template families.';
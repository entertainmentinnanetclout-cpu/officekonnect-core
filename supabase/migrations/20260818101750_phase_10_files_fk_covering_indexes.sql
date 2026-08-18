create index if not exists document_favorites_document_workspace_idx
  on public.document_favorites(document_id, workspace_id);

create index if not exists document_folder_items_document_workspace_idx
  on public.document_folder_items(document_id, workspace_id);

create index if not exists document_folder_items_folder_workspace_idx
  on public.document_folder_items(folder_id, workspace_id);

create index if not exists document_shares_document_workspace_idx
  on public.document_shares(document_id, workspace_id);

create index if not exists workspace_folders_parent_workspace_cover_idx
  on public.workspace_folders(parent_id, workspace_id)
  where parent_id is not null;

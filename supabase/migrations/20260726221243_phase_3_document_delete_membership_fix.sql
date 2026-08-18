drop policy if exists "Members delete own documents" on public.documents;

create policy "Members delete own documents"
on public.documents
for delete
to authenticated
using (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
);

comment on policy "Members delete own documents" on public.documents is
  'Only current workspace members may delete; creators may delete their own documents and admins/owners may delete workspace documents.';
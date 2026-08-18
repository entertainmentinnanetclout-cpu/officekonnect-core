revoke execute on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) from anon;

revoke execute on function public.restore_structured_document_version(
  uuid, uuid, integer
) from anon;

grant execute on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) to authenticated, service_role;

grant execute on function public.restore_structured_document_version(
  uuid, uuid, integer
) to authenticated, service_role;

comment on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) is 'Authenticated-only SECURITY DEFINER RPC. Performs explicit auth, workspace membership, creator/admin authorization and optimistic-concurrency checks before saving.';

comment on function public.restore_structured_document_version(
  uuid, uuid, integer
) is 'Authenticated-only SECURITY DEFINER RPC. Performs explicit auth, workspace membership, creator/admin authorization and optimistic-concurrency checks before protective restoration.';
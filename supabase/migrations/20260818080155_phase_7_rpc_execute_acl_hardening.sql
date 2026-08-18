revoke execute on function public.search_workspace_objects(uuid,text,integer) from anon;
revoke execute on function public.list_workspace_member_directory(uuid) from anon;
grant execute on function public.search_workspace_objects(uuid,text,integer) to authenticated;
grant execute on function public.list_workspace_member_directory(uuid) to authenticated;

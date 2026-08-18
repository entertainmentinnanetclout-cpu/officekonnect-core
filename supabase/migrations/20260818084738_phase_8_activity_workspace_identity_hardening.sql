create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp as $$
declare
  v_workspace_id uuid;
  v_entity_id uuid;
begin
  v_entity_id := coalesce((new).id, (old).id);

  if tg_table_name = 'workspaces' then
    v_workspace_id := v_entity_id;
  else
    begin
      v_workspace_id := (new).workspace_id;
    exception when others then
      v_workspace_id := null;
    end;
    if v_workspace_id is null then
      begin
        v_workspace_id := (old).workspace_id;
      exception when others then
        v_workspace_id := null;
      end;
    end if;
  end if;

  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_workspace_id,(select auth.uid()),tg_op,tg_table_name,v_entity_id,jsonb_build_object('op',tg_op));

  return coalesce(new,old);
end $$;
revoke all on function public.log_activity() from public,anon,authenticated;

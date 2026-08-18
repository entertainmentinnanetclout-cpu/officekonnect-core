create or replace function private.prevent_workspace_folder_cycle()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  v_cursor uuid;
  v_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception using errcode = '23514', message = 'A folder cannot contain itself';
  end if;

  v_cursor := new.parent_id;
  loop
    if v_cursor is null then
      exit;
    end if;
    if v_cursor = new.id then
      raise exception using errcode = '23514', message = 'A folder cannot be moved inside one of its descendants';
    end if;
    select parent_id into v_parent
    from public.workspace_folders
    where id = v_cursor and workspace_id = new.workspace_id;
    if not found then
      raise exception using errcode = '23503', message = 'Parent folder does not exist in this workspace';
    end if;
    v_cursor := v_parent;
  end loop;
  return new;
end;
$$;

create trigger workspace_folders_prevent_cycle
before insert or update of parent_id, workspace_id on public.workspace_folders
for each row execute function private.prevent_workspace_folder_cycle();

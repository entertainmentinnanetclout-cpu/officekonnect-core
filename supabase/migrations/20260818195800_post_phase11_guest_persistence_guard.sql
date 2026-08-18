create or replace function private.assert_registered_user_for_persistence()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_anonymous boolean;
begin
  if v_user_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select coalesce(u.is_anonymous, false)
    into v_is_anonymous
  from auth.users u
  where u.id = v_user_id;

  if coalesce(v_is_anonymous, true) then
    raise exception using
      errcode = '42501',
      message = 'Guest sessions are temporary. Sign in to save your work.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'documents','document_versions','document_templates','document_fields',
    'document_folder_items','document_shares','document_signatures','document_favorites',
    'document_metadata','user_signatures','signing_requests','signing_participants',
    'signing_fields','letterheads','workspace_folders','tasks','calendar_events',
    'workflow_templates','workflow_template_steps','workflow_runs','workflow_steps',
    'workflow_step_assignees','workflow_comments','contacts','contact_groups',
    'contact_group_members','email_templates','email_campaigns','campaign_recipients',
    'voice_notes','transcription_jobs','user_integrations','jobs'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists registered_user_persistence_guard on public.%I', v_table);
      execute format(
        'create trigger registered_user_persistence_guard before insert or update on public.%I for each row execute function private.assert_registered_user_for_persistence()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create or replace function private.assert_registered_user_for_storage()
returns trigger
language plpgsql
security definer
set search_path = storage, auth, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_anonymous boolean;
begin
  if v_user_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if new.bucket_id not in (
    'documents','document-versions','exports','letterheads','signatures','voice-notes','avatars'
  ) then
    return new;
  end if;

  select coalesce(u.is_anonymous, false)
    into v_is_anonymous
  from auth.users u
  where u.id = v_user_id;

  if coalesce(v_is_anonymous, true) then
    raise exception using
      errcode = '42501',
      message = 'Guest sessions are temporary. Sign in before saving files.';
  end if;

  return new;
end;
$$;

drop trigger if exists registered_user_storage_guard on storage.objects;
create trigger registered_user_storage_guard
before insert or update on storage.objects
for each row
execute function private.assert_registered_user_for_storage();

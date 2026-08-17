-- Phase 3: spreadsheet workspace foundation
-- Additive and backward-compatible with uploaded files and Phase 2 native documents.

alter table public.documents
  add column if not exists sheet_count integer not null default 0,
  add column if not exists cell_count integer not null default 0,
  add column if not exists formula_count integer not null default 0,
  add column if not exists calculation_version integer not null default 1,
  add column if not exists last_calculated_at timestamptz;

alter table public.document_versions
  add column if not exists sheet_count integer,
  add column if not exists cell_count integer,
  add column if not exists formula_count integer,
  add column if not exists calculation_version integer;

alter table public.document_templates
  add column if not exists template_kind text not null default 'native';

alter table public.documents
  drop constraint if exists documents_document_kind_check;

alter table public.documents
  add constraint documents_document_kind_check
  check (document_kind in ('file', 'native', 'spreadsheet'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_structured_counts_check'
  ) then
    alter table public.documents
      add constraint documents_structured_counts_check
      check (
        sheet_count >= 0
        and cell_count >= 0
        and formula_count >= 0
        and calculation_version >= 1
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_spreadsheet_content_check'
  ) then
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
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_versions'::regclass
      and conname = 'document_versions_structured_counts_check'
  ) then
    alter table public.document_versions
      add constraint document_versions_structured_counts_check
      check (
        (sheet_count is null or sheet_count >= 0)
        and (cell_count is null or cell_count >= 0)
        and (formula_count is null or formula_count >= 0)
        and (calculation_version is null or calculation_version >= 1)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_templates'::regclass
      and conname = 'document_templates_template_kind_check'
  ) then
    alter table public.document_templates
      add constraint document_templates_template_kind_check
      check (template_kind in ('native', 'spreadsheet'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_templates'::regclass
      and conname = 'document_templates_spreadsheet_content_check'
  ) then
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
  end if;
end $$;

create index if not exists idx_document_templates_workspace_kind_updated
  on public.document_templates (workspace_id, template_kind, updated_at desc)
  where is_archived = false;

-- Use init-plan-safe auth lookup for the document policies used by both native
-- documents and spreadsheets.
drop policy if exists "Members insert documents" on public.documents;
create policy "Members insert documents"
on public.documents
for insert
to authenticated
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and created_by = (select auth.uid())
);

drop policy if exists "Members delete own documents" on public.documents;
create policy "Members delete own documents"
on public.documents
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
);

create or replace function public.save_structured_document(
  p_document_id uuid,
  p_expected_editor_version integer,
  p_content jsonb,
  p_word_count integer default 0,
  p_sheet_count integer default 0,
  p_cell_count integer default 0,
  p_formula_count integer default 0,
  p_create_version boolean default false,
  p_version_title text default null,
  p_change_summary text default null
)
returns public.documents
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_next_version integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if jsonb_typeof(p_content) <> 'object' then
    raise exception using errcode = '22023', message = 'Structured document content must be a JSON object';
  end if;

  if coalesce(p_word_count, 0) < 0
     or coalesce(p_sheet_count, 0) < 0
     or coalesce(p_cell_count, 0) < 0
     or coalesce(p_formula_count, 0) < 0 then
    raise exception using errcode = '22023', message = 'Document counts cannot be negative';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Document not found';
  end if;

  if not private.has_workspace_role(v_document.workspace_id, 'member'::public.workspace_role)
     or not (
       v_document.created_by = v_user_id
       or private.has_workspace_role(v_document.workspace_id, 'admin'::public.workspace_role)
     ) then
    raise exception using errcode = '42501', message = 'Insufficient document permissions';
  end if;

  if v_document.editor_version <> p_expected_editor_version then
    raise exception using
      errcode = '40001',
      message = 'Document changed in another session',
      detail = format('Expected editor version %s but found %s', p_expected_editor_version, v_document.editor_version);
  end if;

  if v_document.document_kind = 'file' then
    raise exception using errcode = '22023', message = 'Uploaded file documents cannot be saved through the structured editor';
  end if;

  if v_document.document_kind = 'spreadsheet'
     and not (
       p_content ->> 'kind' = 'workbook'
       and jsonb_typeof(p_content -> 'sheets') = 'array'
     ) then
    raise exception using errcode = '22023', message = 'Spreadsheet content must use the workbook schema';
  end if;

  update public.documents
  set content = p_content,
      word_count = coalesce(p_word_count, 0),
      sheet_count = case when document_kind = 'spreadsheet' then coalesce(p_sheet_count, 0) else 0 end,
      cell_count = case when document_kind = 'spreadsheet' then coalesce(p_cell_count, 0) else 0 end,
      formula_count = case when document_kind = 'spreadsheet' then coalesce(p_formula_count, 0) else 0 end,
      calculation_version = case when document_kind = 'spreadsheet' then calculation_version + 1 else calculation_version end,
      last_calculated_at = case when document_kind = 'spreadsheet' then now() else last_calculated_at end,
      last_saved_by = v_user_id,
      editor_version = editor_version + 1,
      updated_at = now()
  where id = p_document_id
  returning * into v_document;

  if p_create_version then
    select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.document_versions
    where document_id = p_document_id;

    insert into public.document_versions (
      document_id,
      version_number,
      created_by,
      title,
      content,
      change_summary,
      word_count,
      letterhead_id,
      sheet_count,
      cell_count,
      formula_count,
      calculation_version
    ) values (
      v_document.id,
      v_next_version,
      v_user_id,
      nullif(trim(p_version_title), ''),
      v_document.content,
      nullif(trim(p_change_summary), ''),
      v_document.word_count,
      v_document.letterhead_id,
      v_document.sheet_count,
      v_document.cell_count,
      v_document.formula_count,
      v_document.calculation_version
    );

    insert into public.activity_logs (
      workspace_id,
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_document.workspace_id,
      v_user_id,
      'document.version_created',
      case when v_document.document_kind = 'spreadsheet' then 'spreadsheet' else 'document' end,
      v_document.id,
      jsonb_build_object(
        'versionNumber', v_next_version,
        'title', nullif(trim(p_version_title), ''),
        'editorVersion', v_document.editor_version
      )
    );
  end if;

  return v_document;
end;
$$;

revoke all on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) from public;
grant execute on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) to authenticated;

create or replace function public.restore_structured_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_expected_editor_version integer
)
returns public.documents
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_backup_version integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Document not found';
  end if;

  if not private.has_workspace_role(v_document.workspace_id, 'member'::public.workspace_role)
     or not (
       v_document.created_by = v_user_id
       or private.has_workspace_role(v_document.workspace_id, 'admin'::public.workspace_role)
     ) then
    raise exception using errcode = '42501', message = 'Insufficient document permissions';
  end if;

  if v_document.document_kind = 'file' then
    raise exception using errcode = '22023', message = 'Uploaded file documents cannot use structured version restoration';
  end if;

  if v_document.editor_version <> p_expected_editor_version then
    raise exception using
      errcode = '40001',
      message = 'Document changed in another session',
      detail = format('Expected editor version %s but found %s', p_expected_editor_version, v_document.editor_version);
  end if;

  select * into v_version
  from public.document_versions
  where id = p_version_id
    and document_id = p_document_id;

  if not found or v_version.content is null then
    raise exception using errcode = 'P0002', message = 'Structured document version not found';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_backup_version
  from public.document_versions
  where document_id = p_document_id;

  insert into public.document_versions (
    document_id,
    version_number,
    created_by,
    title,
    content,
    change_summary,
    word_count,
    letterhead_id,
    sheet_count,
    cell_count,
    formula_count,
    calculation_version
  ) values (
    v_document.id,
    v_backup_version,
    v_user_id,
    'Pre-restore backup',
    v_document.content,
    format('Automatic backup before restoring version %s', v_version.version_number),
    v_document.word_count,
    v_document.letterhead_id,
    v_document.sheet_count,
    v_document.cell_count,
    v_document.formula_count,
    v_document.calculation_version
  );

  update public.documents
  set content = v_version.content,
      word_count = coalesce(v_version.word_count, 0),
      letterhead_id = v_version.letterhead_id,
      sheet_count = case when document_kind = 'spreadsheet' then coalesce(v_version.sheet_count, 0) else 0 end,
      cell_count = case when document_kind = 'spreadsheet' then coalesce(v_version.cell_count, 0) else 0 end,
      formula_count = case when document_kind = 'spreadsheet' then coalesce(v_version.formula_count, 0) else 0 end,
      calculation_version = case when document_kind = 'spreadsheet' then coalesce(v_version.calculation_version, calculation_version) + 1 else calculation_version end,
      last_calculated_at = case when document_kind = 'spreadsheet' then now() else last_calculated_at end,
      last_saved_by = v_user_id,
      editor_version = editor_version + 1,
      updated_at = now()
  where id = p_document_id
  returning * into v_document;

  insert into public.activity_logs (
    workspace_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_document.workspace_id,
    v_user_id,
    'document.version_restored',
    case when v_document.document_kind = 'spreadsheet' then 'spreadsheet' else 'document' end,
    v_document.id,
    jsonb_build_object(
      'restoredVersionId', p_version_id,
      'restoredVersionNumber', v_version.version_number,
      'backupVersionNumber', v_backup_version,
      'editorVersion', v_document.editor_version
    )
  );

  return v_document;
end;
$$;

revoke all on function public.restore_structured_document_version(uuid, uuid, integer) from public;
grant execute on function public.restore_structured_document_version(uuid, uuid, integer) to authenticated;

comment on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) is 'Atomically saves native document or spreadsheet JSON using optimistic concurrency; optionally creates a milestone version.';

comment on function public.restore_structured_document_version(uuid, uuid, integer)
is 'Restores a structured document version after creating a protective snapshot of the current state.';
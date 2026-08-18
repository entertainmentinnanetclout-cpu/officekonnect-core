-- Move privileged implementations out of the Data API exposed schema.
alter function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) set schema private;

alter function public.restore_structured_document_version(
  uuid, uuid, integer
) set schema private;

-- Preserve the client-facing RPC contract with SECURITY INVOKER wrappers.
create function public.save_structured_document(
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
language sql
security invoker
volatile
set search_path = public, private, pg_temp
as $$
  select private.save_structured_document(
    p_document_id,
    p_expected_editor_version,
    p_content,
    p_word_count,
    p_sheet_count,
    p_cell_count,
    p_formula_count,
    p_create_version,
    p_version_title,
    p_change_summary
  );
$$;

create function public.restore_structured_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_expected_editor_version integer
)
returns public.documents
language sql
security invoker
volatile
set search_path = public, private, pg_temp
as $$
  select private.restore_structured_document_version(
    p_document_id,
    p_version_id,
    p_expected_editor_version
  );
$$;

-- Private implementations are callable by authenticated users only through
-- database execution; the private schema is not exposed through the Data API.
revoke all on function private.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) from public, anon;
revoke all on function private.restore_structured_document_version(
  uuid, uuid, integer
) from public, anon;

grant execute on function private.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) to authenticated, service_role;
grant execute on function private.restore_structured_document_version(
  uuid, uuid, integer
) to authenticated, service_role;

revoke all on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) from public, anon;
revoke all on function public.restore_structured_document_version(
  uuid, uuid, integer
) from public, anon;

grant execute on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) to authenticated, service_role;
grant execute on function public.restore_structured_document_version(
  uuid, uuid, integer
) to authenticated, service_role;

comment on function private.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) is 'Unexposed SECURITY DEFINER implementation for atomic structured-document saves.';
comment on function private.restore_structured_document_version(
  uuid, uuid, integer
) is 'Unexposed SECURITY DEFINER implementation for protective structured-version restoration.';
comment on function public.save_structured_document(
  uuid, integer, jsonb, integer, integer, integer, integer, boolean, text, text
) is 'Authenticated SECURITY INVOKER API wrapper for the private atomic-save implementation.';
comment on function public.restore_structured_document_version(
  uuid, uuid, integer
) is 'Authenticated SECURITY INVOKER API wrapper for the private protective-restore implementation.';
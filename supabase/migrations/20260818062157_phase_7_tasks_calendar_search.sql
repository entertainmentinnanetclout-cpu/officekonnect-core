create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default 'todo',
  priority text not null default 'medium',
  assignee_id uuid null,
  created_by uuid not null,
  due_at timestamptz null,
  start_at timestamptz null,
  completed_at timestamptz null,
  entity_type text null,
  entity_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_check check (char_length(trim(title)) between 1 and 240),
  constraint tasks_status_check check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  constraint tasks_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint tasks_dates_check check (start_at is null or due_at is null or start_at <= due_at),
  constraint tasks_completion_check check ((status = 'done' and completed_at is not null) or status <> 'done')
);

create index tasks_workspace_status_due_idx on public.tasks(workspace_id, status, due_at);
create index tasks_assignee_workspace_idx on public.tasks(assignee_id, workspace_id, status, due_at);
create index tasks_entity_idx on public.tasks(workspace_id, entity_type, entity_id) where entity_id is not null;
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.update_updated_at_column();

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null,
  title text not null,
  description text null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text null,
  entity_type text null,
  entity_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_title_check check (char_length(trim(title)) between 1 and 240),
  constraint calendar_events_range_check check (ends_at >= starts_at)
);

create index calendar_events_workspace_range_idx on public.calendar_events(workspace_id, starts_at, ends_at);
create index calendar_events_entity_idx on public.calendar_events(workspace_id, entity_type, entity_id) where entity_id is not null;
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.update_updated_at_column();

alter table public.tasks enable row level security;
alter table public.calendar_events enable row level security;

create policy "Workspace members read tasks"
on public.tasks for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace members create tasks"
on public.tasks for insert to authenticated
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and created_by = (select auth.uid())
  and (
    assignee_id is null
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = tasks.workspace_id and wm.user_id = tasks.assignee_id
    )
  )
);

create policy "Task participants update tasks"
on public.tasks for update to authenticated
using (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or assignee_id = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
)
with check (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or assignee_id = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
  and (
    assignee_id is null
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = tasks.workspace_id and wm.user_id = tasks.assignee_id
    )
  )
);

create policy "Task creators or admins delete tasks"
on public.tasks for delete to authenticated
using (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
);

create policy "Workspace members read calendar events"
on public.calendar_events for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Workspace members create calendar events"
on public.calendar_events for insert to authenticated
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and created_by = (select auth.uid())
);

create policy "Event creators or admins update calendar events"
on public.calendar_events for update to authenticated
using (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
)
with check (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
);

create policy "Event creators or admins delete calendar events"
on public.calendar_events for delete to authenticated
using (
  private.is_workspace_member(workspace_id)
  and (
    created_by = (select auth.uid())
    or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role)
  )
);

create or replace function public.search_workspace_objects(
  p_workspace_id uuid,
  p_query text,
  p_limit integer default 30
)
returns table (
  object_type text,
  object_id uuid,
  title text,
  subtitle text,
  route text,
  occurred_at timestamptz,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with needle as (
    select lower(trim(coalesce(p_query, ''))) q,
           greatest(1, least(coalesce(p_limit, 30), 100)) lim
  ),
  results(object_type, object_id, title, subtitle, route, occurred_at, metadata) as (
    select
      'document'::text,
      d.id,
      d.title,
      coalesce(nullif(d.description, ''), case when d.document_kind = 'spreadsheet' then 'OfficeKonnect Sheet' else 'Document' end),
      case when d.document_kind = 'spreadsheet' then '/dashboard/sheets/' || d.id::text else '/dashboard/documents/' || d.id::text end,
      d.updated_at,
      jsonb_build_object('documentKind', d.document_kind, 'status', d.document_status, 'fileType', d.file_type)
    from public.documents d, needle n
    where d.workspace_id = p_workspace_id
      and d.document_status <> 'deleted'
      and (n.q = '' or lower(d.title) like '%' || n.q || '%' or lower(coalesce(d.description, '')) like '%' || n.q || '%')

    union all
    select
      'template', t.id, t.name, coalesce(t.description, 'Template'), '/dashboard/templates', t.updated_at,
      jsonb_build_object('category', t.category, 'templateKind', t.template_kind)
    from public.document_templates t, needle n
    where t.workspace_id = p_workspace_id
      and t.is_archived = false
      and (n.q = '' or lower(t.name) like '%' || n.q || '%' or lower(coalesce(t.description, '')) like '%' || n.q || '%')

    union all
    select
      'workflow', r.id, coalesce(nullif(r.title, ''), d.title, 'Workflow'), 'Workflow • ' || r.status::text,
      '/dashboard/workflows/' || r.id::text, r.updated_at,
      jsonb_build_object('status', r.status, 'revision', r.workflow_revision, 'documentId', r.document_id)
    from public.workflow_runs r
    join public.documents d on d.id = r.document_id, needle n
    where r.workspace_id = p_workspace_id
      and (n.q = '' or lower(coalesce(r.title, d.title, '')) like '%' || n.q || '%' or lower(r.status::text) like '%' || n.q || '%')

    union all
    select
      'signature', s.id, s.title, 'E-signature • ' || s.status::text,
      '/dashboard/signing/' || s.id::text, s.updated_at,
      jsonb_build_object('status', s.status, 'documentId', s.document_id, 'expiresAt', s.expires_at)
    from public.signing_requests s, needle n
    where s.workspace_id = p_workspace_id
      and (n.q = '' or lower(s.title) like '%' || n.q || '%' or lower(coalesce(s.message, '')) like '%' || n.q || '%')

    union all
    select
      'task', t.id, t.title, 'Task • ' || replace(t.status, '_', ' '),
      '/dashboard/tasks?task=' || t.id::text, t.updated_at,
      jsonb_build_object('status', t.status, 'priority', t.priority, 'dueAt', t.due_at, 'assigneeId', t.assignee_id)
    from public.tasks t, needle n
    where t.workspace_id = p_workspace_id
      and t.status <> 'cancelled'
      and (n.q = '' or lower(t.title) like '%' || n.q || '%' or lower(coalesce(t.description, '')) like '%' || n.q || '%')

    union all
    select
      'member', wm.user_id, coalesce(nullif(trim(p.full_name), ''), p.email), coalesce(p.email, 'Workspace member'),
      '/dashboard/team', wm.created_at, jsonb_build_object('role', wm.role, 'email', p.email)
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id, needle n
    where wm.workspace_id = p_workspace_id
      and (n.q = '' or lower(coalesce(p.full_name, '')) like '%' || n.q || '%' or lower(coalesce(p.email, '')) like '%' || n.q || '%')
  )
  select r.object_type, r.object_id, r.title, r.subtitle, r.route, r.occurred_at, r.metadata
  from results r, needle n
  where private.is_workspace_member(p_workspace_id)
  order by r.occurred_at desc nulls last, r.title
  limit (select lim from needle);
$$;

revoke all on function public.search_workspace_objects(uuid, text, integer) from public;
grant execute on function public.search_workspace_objects(uuid, text, integer) to authenticated;

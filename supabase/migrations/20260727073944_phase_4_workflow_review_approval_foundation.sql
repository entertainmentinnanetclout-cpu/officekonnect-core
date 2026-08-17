-- Phase 4: workflow, review, approval, work queue, immutable decisions.

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  entity_type text not null default 'document',
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_templates_name_check check (length(trim(name)) > 0),
  constraint workflow_templates_entity_type_check check (entity_type = 'document'),
  constraint workflow_templates_version_check check (version > 0)
);

create unique index if not exists workflow_templates_workspace_name_version_uidx
  on public.workflow_templates (workspace_id, lower(name), version);
create index if not exists workflow_templates_workspace_active_idx
  on public.workflow_templates (workspace_id, updated_at desc)
  where is_active = true;

create table if not exists public.workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  step_order integer not null,
  name text not null,
  description text,
  step_type text not null,
  assignment_mode text not null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_workspace_role public.workspace_role,
  required_decisions integer not null default 1,
  allow_changes boolean not null default true,
  allow_reject boolean not null default true,
  due_in_hours integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_template_steps_order_check check (step_order > 0),
  constraint workflow_template_steps_name_check check (length(trim(name)) > 0),
  constraint workflow_template_steps_type_check check (step_type in ('review','approval','acknowledgement')),
  constraint workflow_template_steps_assignment_mode_check check (assignment_mode in ('user','workspace_role','document_creator','workflow_starter')),
  constraint workflow_template_steps_required_check check (required_decisions > 0),
  constraint workflow_template_steps_due_check check (due_in_hours is null or due_in_hours > 0),
  constraint workflow_template_steps_assignment_shape_check check (
    (assignment_mode = 'user' and assigned_user_id is not null and assigned_workspace_role is null)
    or (assignment_mode = 'workspace_role' and assigned_user_id is null and assigned_workspace_role is not null)
    or (assignment_mode in ('document_creator','workflow_starter') and assigned_user_id is null and assigned_workspace_role is null)
  ),
  unique (template_id, step_order)
);
create index if not exists workflow_template_steps_template_idx
  on public.workflow_template_steps (template_id, step_order);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  template_id uuid references public.workflow_templates(id) on delete set null,
  template_version integer,
  title text not null,
  status text not null default 'in_progress',
  current_step_order integer not null default 1,
  workflow_revision integer not null default 1,
  document_editor_version_at_submission integer not null,
  started_by uuid not null references auth.users(id) on delete restrict,
  due_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_runs_title_check check (length(trim(title)) > 0),
  constraint workflow_runs_status_check check (status in ('in_progress','changes_requested','approved','rejected','cancelled')),
  constraint workflow_runs_step_order_check check (current_step_order > 0),
  constraint workflow_runs_revision_check check (workflow_revision > 0),
  constraint workflow_runs_editor_version_check check (document_editor_version_at_submission > 0)
);
create unique index if not exists workflow_runs_one_active_per_document_uidx
  on public.workflow_runs (document_id)
  where status in ('in_progress','changes_requested');
create index if not exists workflow_runs_workspace_status_idx
  on public.workflow_runs (workspace_id, status, updated_at desc);
create index if not exists workflow_runs_document_created_idx
  on public.workflow_runs (document_id, created_at desc);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_order integer not null,
  name text not null,
  description text,
  step_type text not null,
  status text not null default 'pending',
  required_decisions integer not null default 1,
  allow_changes boolean not null default true,
  allow_reject boolean not null default true,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_steps_order_check check (step_order > 0),
  constraint workflow_steps_name_check check (length(trim(name)) > 0),
  constraint workflow_steps_type_check check (step_type in ('review','approval','acknowledgement')),
  constraint workflow_steps_status_check check (status in ('pending','active','approved','changes_requested','rejected','skipped','cancelled')),
  constraint workflow_steps_required_check check (required_decisions > 0),
  unique (run_id, step_order)
);
create index if not exists workflow_steps_run_status_idx
  on public.workflow_steps (run_id, status, step_order);

create table if not exists public.workflow_step_assignees (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.workflow_steps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  participant_role text not null,
  status text not null default 'pending',
  decision_comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_step_assignees_role_check check (participant_role in ('reviewer','approver','acknowledger')),
  constraint workflow_step_assignees_status_check check (status in ('pending','approved','changes_requested','rejected','acknowledged','skipped','cancelled')),
  unique (step_id, user_id)
);
create index if not exists workflow_step_assignees_user_status_idx
  on public.workflow_step_assignees (user_id, status, created_at desc);
create index if not exists workflow_step_assignees_step_idx
  on public.workflow_step_assignees (step_id, status);

create table if not exists public.workflow_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_id uuid not null references public.workflow_steps(id) on delete cascade,
  assignment_id uuid not null references public.workflow_step_assignees(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  decision text not null,
  comment text,
  workflow_revision integer not null,
  created_at timestamptz not null default now(),
  constraint workflow_decisions_decision_check check (decision in ('approve','changes_requested','reject','acknowledge')),
  constraint workflow_decisions_revision_check check (workflow_revision > 0)
);
create index if not exists workflow_decisions_run_created_idx
  on public.workflow_decisions (run_id, created_at desc);
create index if not exists workflow_decisions_assignment_idx
  on public.workflow_decisions (assignment_id, created_at desc);

create table if not exists public.workflow_comments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_id uuid references public.workflow_steps(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  parent_id uuid references public.workflow_comments(id) on delete set null,
  is_resolved boolean not null default false,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_comments_body_check check (length(trim(body)) > 0),
  constraint workflow_comments_resolution_check check (
    (is_resolved = false and resolved_by is null and resolved_at is null)
    or (is_resolved = true and resolved_by is not null and resolved_at is not null)
  )
);
create index if not exists workflow_comments_run_created_idx
  on public.workflow_comments (run_id, created_at);
create index if not exists workflow_comments_step_created_idx
  on public.workflow_comments (step_id, created_at)
  where step_id is not null;

create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_id uuid references public.workflow_steps(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workflow_events_type_check check (length(trim(event_type)) > 0)
);
create index if not exists workflow_events_run_created_idx
  on public.workflow_events (run_id, created_at);

-- Updated-at triggers.
drop trigger if exists trg_workflow_templates_updated on public.workflow_templates;
create trigger trg_workflow_templates_updated
before update on public.workflow_templates
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_workflow_template_steps_updated on public.workflow_template_steps;
create trigger trg_workflow_template_steps_updated
before update on public.workflow_template_steps
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_workflow_runs_updated on public.workflow_runs;
create trigger trg_workflow_runs_updated
before update on public.workflow_runs
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_workflow_steps_updated on public.workflow_steps;
create trigger trg_workflow_steps_updated
before update on public.workflow_steps
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_workflow_step_assignees_updated on public.workflow_step_assignees;
create trigger trg_workflow_step_assignees_updated
before update on public.workflow_step_assignees
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_workflow_comments_updated on public.workflow_comments;
create trigger trg_workflow_comments_updated
before update on public.workflow_comments
for each row execute function public.update_updated_at_column();

-- Workflow participation helper; runs as table owner and is not exposed by PostgREST.
create or replace function private.is_workflow_participant(_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.workflow_runs wr
    join public.documents d on d.id = wr.document_id
    where wr.id = _run_id
      and private.is_workspace_member(wr.workspace_id)
      and (
        wr.started_by = (select auth.uid())
        or d.created_by = (select auth.uid())
        or private.has_workspace_role(wr.workspace_id, 'admin'::public.workspace_role)
        or exists (
          select 1
          from public.workflow_steps ws
          join public.workflow_step_assignees wa on wa.step_id = ws.id
          where ws.run_id = wr.id
            and wa.user_id = (select auth.uid())
        )
      )
  );
$$;

-- RLS.
alter table public.workflow_templates enable row level security;
alter table public.workflow_template_steps enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_step_assignees enable row level security;
alter table public.workflow_decisions enable row level security;
alter table public.workflow_comments enable row level security;
alter table public.workflow_events enable row level security;

create policy "Workspace members read workflow templates"
on public.workflow_templates for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy "Admins create workflow templates"
on public.workflow_templates for insert to authenticated
with check (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role) and created_by = (select auth.uid()));
create policy "Admins update workflow templates"
on public.workflow_templates for update to authenticated
using (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
with check (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role));
create policy "Admins delete workflow templates"
on public.workflow_templates for delete to authenticated
using (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role));

create policy "Workspace members read workflow template steps"
on public.workflow_template_steps for select to authenticated
using (exists (
  select 1 from public.workflow_templates wt
  where wt.id = template_id and private.is_workspace_member(wt.workspace_id)
));
create policy "Admins create workflow template steps"
on public.workflow_template_steps for insert to authenticated
with check (exists (
  select 1 from public.workflow_templates wt
  where wt.id = template_id and private.has_workspace_role(wt.workspace_id, 'admin'::public.workspace_role)
));
create policy "Admins update workflow template steps"
on public.workflow_template_steps for update to authenticated
using (exists (
  select 1 from public.workflow_templates wt
  where wt.id = template_id and private.has_workspace_role(wt.workspace_id, 'admin'::public.workspace_role)
))
with check (exists (
  select 1 from public.workflow_templates wt
  where wt.id = template_id and private.has_workspace_role(wt.workspace_id, 'admin'::public.workspace_role)
));
create policy "Admins delete workflow template steps"
on public.workflow_template_steps for delete to authenticated
using (exists (
  select 1 from public.workflow_templates wt
  where wt.id = template_id and private.has_workspace_role(wt.workspace_id, 'admin'::public.workspace_role)
));

create policy "Participants read workflow runs"
on public.workflow_runs for select to authenticated
using (private.is_workflow_participant(id));
create policy "Participants read workflow steps"
on public.workflow_steps for select to authenticated
using (private.is_workflow_participant(run_id));
create policy "Participants read workflow assignees"
on public.workflow_step_assignees for select to authenticated
using (exists (
  select 1 from public.workflow_steps ws
  where ws.id = step_id and private.is_workflow_participant(ws.run_id)
));
create policy "Participants read workflow decisions"
on public.workflow_decisions for select to authenticated
using (private.is_workflow_participant(run_id));
create policy "Participants read workflow comments"
on public.workflow_comments for select to authenticated
using (private.is_workflow_participant(run_id));
create policy "Participants create workflow comments"
on public.workflow_comments for insert to authenticated
with check (author_id = (select auth.uid()) and private.is_workflow_participant(run_id));
create policy "Authors and admins update workflow comments"
on public.workflow_comments for update to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.workflow_runs wr
    where wr.id = run_id and private.has_workspace_role(wr.workspace_id, 'admin'::public.workspace_role)
  )
)
with check (private.is_workflow_participant(run_id));
create policy "Participants read workflow events"
on public.workflow_events for select to authenticated
using (private.is_workflow_participant(run_id));

-- Direct mutation grants are intentionally limited.
revoke all on public.workflow_templates, public.workflow_template_steps,
  public.workflow_runs, public.workflow_steps, public.workflow_step_assignees,
  public.workflow_decisions, public.workflow_comments, public.workflow_events
from anon;

grant select, insert, update, delete on public.workflow_templates to authenticated;
grant select, insert, update, delete on public.workflow_template_steps to authenticated;
grant select on public.workflow_runs, public.workflow_steps, public.workflow_step_assignees,
  public.workflow_decisions, public.workflow_events to authenticated;
grant select, insert, update on public.workflow_comments to authenticated;

-- Start a workflow from an active template and snapshot the exact document revision.
create or replace function private.start_document_workflow(
  p_document_id uuid,
  p_template_id uuid,
  p_due_at timestamptz default null
)
returns public.workflow_runs
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_template public.workflow_templates%rowtype;
  v_run public.workflow_runs%rowtype;
  v_template_step public.workflow_template_steps%rowtype;
  v_step_id uuid;
  v_version_id uuid;
  v_next_version integer;
  v_assignee_count integer;
  v_step_count integer := 0;
  v_participant_role text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_document from public.documents where id = p_document_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Document not found';
  end if;

  if not private.has_workspace_role(v_document.workspace_id, 'member'::public.workspace_role)
     or not (
       v_document.created_by = v_user_id
       or private.has_workspace_role(v_document.workspace_id, 'admin'::public.workspace_role)
     ) then
    raise exception using errcode = '42501', message = 'Only the document creator or a workspace administrator may start a workflow';
  end if;

  select * into v_template
  from public.workflow_templates
  where id = p_template_id
    and workspace_id = v_document.workspace_id
    and is_active = true;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active workflow template not found in this workspace';
  end if;

  if exists (
    select 1 from public.workflow_runs
    where document_id = p_document_id and status in ('in_progress','changes_requested')
  ) then
    raise exception using errcode = '23505', message = 'This document already has an active workflow';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.document_versions
  where document_id = v_document.id;

  insert into public.document_versions (
    document_id, version_number, file_url, storage_path, created_by, title,
    content, change_summary, word_count, letterhead_id, sheet_count,
    cell_count, formula_count, calculation_version
  ) values (
    v_document.id,
    v_next_version,
    case when v_document.document_kind = 'file' then v_document.current_file_url else null end,
    case when v_document.document_kind = 'file' then v_document.storage_path else null end,
    v_user_id,
    'Workflow submission',
    case when v_document.document_kind in ('native','spreadsheet') then v_document.content else null end,
    'Automatic immutable snapshot created for workflow review',
    v_document.word_count,
    v_document.letterhead_id,
    v_document.sheet_count,
    v_document.cell_count,
    v_document.formula_count,
    v_document.calculation_version
  ) returning id into v_version_id;

  insert into public.workflow_runs (
    workspace_id, document_id, document_version_id, template_id, template_version,
    title, status, current_step_order, workflow_revision,
    document_editor_version_at_submission, started_by, due_at
  ) values (
    v_document.workspace_id, v_document.id, v_version_id, v_template.id, v_template.version,
    v_template.name, 'in_progress', 1, 1,
    v_document.editor_version, v_user_id, p_due_at
  ) returning * into v_run;

  for v_template_step in
    select * from public.workflow_template_steps
    where template_id = v_template.id
    order by step_order
  loop
    v_step_count := v_step_count + 1;
    v_participant_role := case v_template_step.step_type
      when 'review' then 'reviewer'
      when 'approval' then 'approver'
      else 'acknowledger'
    end;

    insert into public.workflow_steps (
      run_id, step_order, name, description, step_type, status,
      required_decisions, allow_changes, allow_reject, due_at, started_at
    ) values (
      v_run.id,
      v_template_step.step_order,
      v_template_step.name,
      v_template_step.description,
      v_template_step.step_type,
      case when v_template_step.step_order = 1 then 'active' else 'pending' end,
      v_template_step.required_decisions,
      v_template_step.allow_changes,
      v_template_step.allow_reject,
      case when v_template_step.due_in_hours is null then null else now() + make_interval(hours => v_template_step.due_in_hours) end,
      case when v_template_step.step_order = 1 then now() else null end
    ) returning id into v_step_id;

    if v_template_step.assignment_mode = 'user' then
      if not exists (
        select 1 from public.workspace_members
        where workspace_id = v_document.workspace_id and user_id = v_template_step.assigned_user_id
      ) then
        raise exception using errcode = '22023', message = 'A workflow assignee is no longer a workspace member';
      end if;
      insert into public.workflow_step_assignees (step_id, user_id, assigned_by, participant_role)
      values (v_step_id, v_template_step.assigned_user_id, v_user_id, v_participant_role);

    elsif v_template_step.assignment_mode = 'document_creator' then
      if not exists (
        select 1 from public.workspace_members
        where workspace_id = v_document.workspace_id and user_id = v_document.created_by
      ) then
        raise exception using errcode = '22023', message = 'The document creator is no longer a workspace member';
      end if;
      insert into public.workflow_step_assignees (step_id, user_id, assigned_by, participant_role)
      values (v_step_id, v_document.created_by, v_user_id, v_participant_role);

    elsif v_template_step.assignment_mode = 'workflow_starter' then
      insert into public.workflow_step_assignees (step_id, user_id, assigned_by, participant_role)
      values (v_step_id, v_user_id, v_user_id, v_participant_role);

    else
      insert into public.workflow_step_assignees (step_id, user_id, assigned_by, participant_role)
      select v_step_id, wm.user_id, v_user_id, v_participant_role
      from public.workspace_members wm
      where wm.workspace_id = v_document.workspace_id
        and (
          wm.role = v_template_step.assigned_workspace_role
          or (v_template_step.assigned_workspace_role = 'admin'::public.workspace_role and wm.role = 'owner'::public.workspace_role)
        );
    end if;

    select count(*) into v_assignee_count
    from public.workflow_step_assignees
    where step_id = v_step_id;

    if v_assignee_count = 0 or v_template_step.required_decisions > v_assignee_count then
      raise exception using errcode = '22023', message = format('Workflow step %s has insufficient assignees', v_template_step.name);
    end if;
  end loop;

  if v_step_count = 0 then
    raise exception using errcode = '22023', message = 'A workflow template must contain at least one step';
  end if;

  insert into public.workflow_events (run_id, actor_id, event_type, to_status, data)
  values (v_run.id, v_user_id, 'workflow.started', 'in_progress', jsonb_build_object('documentVersionId', v_version_id));

  insert into public.activity_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_document.workspace_id, v_user_id, 'workflow.started', 'workflow', v_run.id,
    jsonb_build_object('documentId', v_document.id, 'templateId', v_template.id, 'documentVersionId', v_version_id));

  insert into public.notifications (workspace_id, user_id, kind, title, body, entity_type, entity_id, data)
  select v_document.workspace_id, wa.user_id, 'system'::public.notification_kind,
         'Workflow task assigned',
         format('%s: %s', v_document.title, ws.name),
         'workflow', v_run.id,
         jsonb_build_object('subtype','workflow_assigned','runId',v_run.id,'stepId',ws.id,'assignmentId',wa.id,'documentId',v_document.id)
  from public.workflow_steps ws
  join public.workflow_step_assignees wa on wa.step_id = ws.id
  where ws.run_id = v_run.id and ws.status = 'active';

  return v_run;
end;
$$;

-- Submit a reviewer/approver/acknowledger decision and advance the state machine.
create or replace function private.submit_workflow_decision(
  p_assignment_id uuid,
  p_decision text,
  p_comment text default null
)
returns public.workflow_runs
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment public.workflow_step_assignees%rowtype;
  v_step public.workflow_steps%rowtype;
  v_run public.workflow_runs%rowtype;
  v_document public.documents%rowtype;
  v_positive_count integer;
  v_next_step public.workflow_steps%rowtype;
  v_assignment_status text;
  v_step_from text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_assignment
  from public.workflow_step_assignees
  where id = p_assignment_id
  for update;
  if not found or v_assignment.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'Workflow assignment not found for this user';
  end if;

  select * into v_step from public.workflow_steps where id = v_assignment.step_id for update;
  select * into v_run from public.workflow_runs where id = v_step.run_id for update;
  select * into v_document from public.documents where id = v_run.document_id;

  if not private.is_workspace_member(v_run.workspace_id) then
    raise exception using errcode = '42501', message = 'Workspace membership is required';
  end if;
  if v_run.status <> 'in_progress' or v_step.status <> 'active' or v_assignment.status <> 'pending' then
    raise exception using errcode = '22023', message = 'This workflow task is not awaiting a decision';
  end if;
  if p_decision not in ('approve','changes_requested','reject','acknowledge') then
    raise exception using errcode = '22023', message = 'Unsupported workflow decision';
  end if;
  if p_decision = 'changes_requested' and not v_step.allow_changes then
    raise exception using errcode = '22023', message = 'This step does not allow change requests';
  end if;
  if p_decision = 'reject' and not v_step.allow_reject then
    raise exception using errcode = '22023', message = 'This step does not allow rejection';
  end if;
  if v_step.step_type = 'acknowledgement' and p_decision <> 'acknowledge' then
    raise exception using errcode = '22023', message = 'Acknowledgement steps only accept acknowledge';
  end if;
  if v_step.step_type <> 'acknowledgement' and p_decision = 'acknowledge' then
    raise exception using errcode = '22023', message = 'Review and approval steps do not accept acknowledge';
  end if;

  v_assignment_status := case p_decision
    when 'approve' then 'approved'
    when 'acknowledge' then 'acknowledged'
    else p_decision
  end;
  v_step_from := v_step.status;

  update public.workflow_step_assignees
  set status = v_assignment_status,
      decision_comment = nullif(trim(p_comment), ''),
      decided_at = now()
  where id = v_assignment.id;

  insert into public.workflow_decisions (
    run_id, step_id, assignment_id, actor_id, decision, comment, workflow_revision
  ) values (
    v_run.id, v_step.id, v_assignment.id, v_user_id, p_decision,
    nullif(trim(p_comment), ''), v_run.workflow_revision
  );

  if nullif(trim(p_comment), '') is not null then
    insert into public.workflow_comments (run_id, step_id, author_id, body)
    values (v_run.id, v_step.id, v_user_id, trim(p_comment));
  end if;

  insert into public.workflow_events (run_id, step_id, actor_id, event_type, from_status, to_status, data)
  values (v_run.id, v_step.id, v_user_id, 'workflow.decision_submitted', 'pending', v_assignment_status,
    jsonb_build_object('assignmentId',v_assignment.id,'decision',p_decision,'workflowRevision',v_run.workflow_revision));

  if p_decision = 'reject' then
    update public.workflow_steps set status='rejected', completed_at=now() where id=v_step.id;
    update public.workflow_step_assignees set status='skipped' where step_id=v_step.id and status='pending';
    update public.workflow_runs
      set status='rejected', completed_at=now(), workflow_revision=workflow_revision+1
      where id=v_run.id returning * into v_run;

  elsif p_decision = 'changes_requested' then
    update public.workflow_steps set status='changes_requested', completed_at=now() where id=v_step.id;
    update public.workflow_runs
      set status='changes_requested', workflow_revision=workflow_revision+1
      where id=v_run.id returning * into v_run;

  else
    select count(*) into v_positive_count
    from public.workflow_step_assignees
    where step_id=v_step.id and status in ('approved','acknowledged');

    if v_positive_count >= v_step.required_decisions then
      update public.workflow_steps set status='approved', completed_at=now() where id=v_step.id;
      update public.workflow_step_assignees set status='skipped' where step_id=v_step.id and status='pending';

      select * into v_next_step
      from public.workflow_steps
      where run_id=v_run.id and step_order > v_step.step_order and status='pending'
      order by step_order limit 1
      for update;

      if found then
        update public.workflow_steps set status='active', started_at=now() where id=v_next_step.id returning * into v_next_step;
        update public.workflow_runs
          set current_step_order=v_next_step.step_order, workflow_revision=workflow_revision+1
          where id=v_run.id returning * into v_run;

        insert into public.notifications (workspace_id, user_id, kind, title, body, entity_type, entity_id, data)
        select v_run.workspace_id, wa.user_id, 'system'::public.notification_kind,
               'Workflow task assigned', format('%s: %s', v_document.title, v_next_step.name),
               'workflow', v_run.id,
               jsonb_build_object('subtype','workflow_assigned','runId',v_run.id,'stepId',v_next_step.id,'assignmentId',wa.id,'documentId',v_document.id)
        from public.workflow_step_assignees wa
        where wa.step_id=v_next_step.id and wa.status='pending';
      else
        update public.workflow_runs
          set status='approved', completed_at=now(), workflow_revision=workflow_revision+1
          where id=v_run.id returning * into v_run;
      end if;
    else
      update public.workflow_runs set workflow_revision=workflow_revision+1 where id=v_run.id returning * into v_run;
    end if;
  end if;

  if v_run.status in ('approved','rejected','changes_requested') then
    insert into public.notifications (workspace_id, user_id, kind, title, body, entity_type, entity_id, data)
    select distinct v_run.workspace_id, recipient_id, 'system'::public.notification_kind,
      case v_run.status
        when 'approved' then 'Workflow approved'
        when 'rejected' then 'Workflow rejected'
        else 'Changes requested'
      end,
      v_document.title,
      'workflow', v_run.id,
      jsonb_build_object('subtype','workflow_' || v_run.status,'runId',v_run.id,'documentId',v_document.id,'stepId',v_step.id)
    from (values (v_run.started_by), (v_document.created_by)) recipients(recipient_id)
    where recipient_id is not null;
  end if;

  insert into public.workflow_events (run_id, step_id, actor_id, event_type, from_status, to_status, data)
  values (v_run.id, v_step.id, v_user_id, 'workflow.state_changed', v_step_from, v_run.status,
    jsonb_build_object('workflowRevision',v_run.workflow_revision));

  insert into public.activity_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_run.workspace_id, v_user_id, 'workflow.decision_submitted', 'workflow', v_run.id,
    jsonb_build_object('stepId',v_step.id,'assignmentId',v_assignment.id,'decision',p_decision,'status',v_run.status));

  return v_run;
end;
$$;

-- Resubmit a corrected document after changes were requested, creating a new immutable snapshot.
create or replace function private.resubmit_document_workflow(
  p_run_id uuid,
  p_expected_document_editor_version integer,
  p_comment text default null
)
returns public.workflow_runs
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.workflow_runs%rowtype;
  v_document public.documents%rowtype;
  v_step public.workflow_steps%rowtype;
  v_next_version integer;
  v_version_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;

  select * into v_run from public.workflow_runs where id=p_run_id for update;
  if not found then raise exception using errcode='P0002', message='Workflow not found'; end if;
  select * into v_document from public.documents where id=v_run.document_id for update;

  if not private.has_workspace_role(v_run.workspace_id,'member'::public.workspace_role)
     or not (v_run.started_by=v_user_id or v_document.created_by=v_user_id or private.has_workspace_role(v_run.workspace_id,'admin'::public.workspace_role)) then
    raise exception using errcode='42501', message='Insufficient workflow resubmission permission';
  end if;
  if v_run.status <> 'changes_requested' then raise exception using errcode='22023', message='Workflow is not awaiting resubmission'; end if;
  if v_document.editor_version <> p_expected_document_editor_version then
    raise exception using errcode='40001', message='Document changed in another session';
  end if;

  select * into v_step from public.workflow_steps
  where run_id=v_run.id and step_order=v_run.current_step_order
  for update;
  if not found then raise exception using errcode='P0002', message='Current workflow step not found'; end if;

  select coalesce(max(version_number),0)+1 into v_next_version
  from public.document_versions where document_id=v_document.id;

  insert into public.document_versions (
    document_id, version_number, file_url, storage_path, created_by, title, content,
    change_summary, word_count, letterhead_id, sheet_count, cell_count, formula_count, calculation_version
  ) values (
    v_document.id, v_next_version,
    case when v_document.document_kind='file' then v_document.current_file_url else null end,
    case when v_document.document_kind='file' then v_document.storage_path else null end,
    v_user_id, 'Workflow resubmission',
    case when v_document.document_kind in ('native','spreadsheet') then v_document.content else null end,
    coalesce(nullif(trim(p_comment),''),'Corrected document resubmitted after changes were requested'),
    v_document.word_count, v_document.letterhead_id, v_document.sheet_count,
    v_document.cell_count, v_document.formula_count, v_document.calculation_version
  ) returning id into v_version_id;

  update public.workflow_steps
    set status='active', started_at=now(), completed_at=null
    where id=v_step.id;
  update public.workflow_step_assignees
    set status='pending', decision_comment=null, decided_at=null
    where step_id=v_step.id;
  update public.workflow_runs
    set status='in_progress', document_version_id=v_version_id,
        document_editor_version_at_submission=v_document.editor_version,
        workflow_revision=workflow_revision+1, completed_at=null
    where id=v_run.id returning * into v_run;

  if nullif(trim(p_comment),'') is not null then
    insert into public.workflow_comments (run_id,step_id,author_id,body)
    values (v_run.id,v_step.id,v_user_id,trim(p_comment));
  end if;

  insert into public.workflow_events (run_id,step_id,actor_id,event_type,from_status,to_status,data)
  values (v_run.id,v_step.id,v_user_id,'workflow.resubmitted','changes_requested','in_progress',
    jsonb_build_object('documentVersionId',v_version_id,'workflowRevision',v_run.workflow_revision));

  insert into public.notifications (workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  select v_run.workspace_id,wa.user_id,'system'::public.notification_kind,
         'Workflow resubmitted',v_document.title,'workflow',v_run.id,
         jsonb_build_object('subtype','workflow_resubmitted','runId',v_run.id,'stepId',v_step.id,'assignmentId',wa.id,'documentId',v_document.id)
  from public.workflow_step_assignees wa where wa.step_id=v_step.id;

  insert into public.activity_logs (workspace_id,user_id,action,entity_type,entity_id,metadata)
  values (v_run.workspace_id,v_user_id,'workflow.resubmitted','workflow',v_run.id,
    jsonb_build_object('documentId',v_document.id,'documentVersionId',v_version_id,'stepId',v_step.id));

  return v_run;
end;
$$;

create or replace function private.cancel_document_workflow(
  p_run_id uuid,
  p_reason text
)
returns public.workflow_runs
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.workflow_runs%rowtype;
  v_document public.documents%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023', message='Cancellation reason is required'; end if;

  select * into v_run from public.workflow_runs where id=p_run_id for update;
  if not found then raise exception using errcode='P0002', message='Workflow not found'; end if;
  select * into v_document from public.documents where id=v_run.document_id;

  if not private.has_workspace_role(v_run.workspace_id,'member'::public.workspace_role)
     or not (v_run.started_by=v_user_id or v_document.created_by=v_user_id or private.has_workspace_role(v_run.workspace_id,'admin'::public.workspace_role)) then
    raise exception using errcode='42501', message='Insufficient workflow cancellation permission';
  end if;
  if v_run.status not in ('in_progress','changes_requested') then raise exception using errcode='22023', message='Workflow is not active'; end if;

  update public.workflow_steps set status='cancelled', completed_at=now()
    where run_id=v_run.id and status in ('pending','active','changes_requested');
  update public.workflow_step_assignees set status='cancelled'
    where step_id in (select id from public.workflow_steps where run_id=v_run.id)
      and status='pending';
  update public.workflow_runs
    set status='cancelled', cancelled_at=now(), cancelled_by=v_user_id,
        cancellation_reason=trim(p_reason), completed_at=now(), workflow_revision=workflow_revision+1
    where id=v_run.id returning * into v_run;

  insert into public.workflow_events (run_id,actor_id,event_type,from_status,to_status,data)
  values (v_run.id,v_user_id,'workflow.cancelled',null,'cancelled',jsonb_build_object('reason',trim(p_reason)));
  insert into public.activity_logs (workspace_id,user_id,action,entity_type,entity_id,metadata)
  values (v_run.workspace_id,v_user_id,'workflow.cancelled','workflow',v_run.id,jsonb_build_object('reason',trim(p_reason)));

  return v_run;
end;
$$;

create or replace function private.reassign_workflow_assignment(
  p_assignment_id uuid,
  p_new_user_id uuid,
  p_reason text
)
returns public.workflow_step_assignees
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_assignment public.workflow_step_assignees%rowtype;
  v_step public.workflow_steps%rowtype;
  v_run public.workflow_runs%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023', message='Reassignment reason is required'; end if;

  select * into v_assignment from public.workflow_step_assignees where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002', message='Assignment not found'; end if;
  select * into v_step from public.workflow_steps where id=v_assignment.step_id;
  select * into v_run from public.workflow_runs where id=v_step.run_id;

  if not private.has_workspace_role(v_run.workspace_id,'admin'::public.workspace_role) then
    raise exception using errcode='42501', message='Only workspace administrators may reassign workflow tasks';
  end if;
  if v_run.status <> 'in_progress' or v_step.status <> 'active' or v_assignment.status <> 'pending' then
    raise exception using errcode='22023', message='Only pending assignments on the active step may be reassigned';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id=v_run.workspace_id and user_id=p_new_user_id) then
    raise exception using errcode='22023', message='New assignee must be a current workspace member';
  end if;
  if exists (select 1 from public.workflow_step_assignees where step_id=v_step.id and user_id=p_new_user_id and id<>v_assignment.id) then
    raise exception using errcode='23505', message='New assignee is already assigned to this step';
  end if;

  update public.workflow_step_assignees
    set user_id=p_new_user_id, assigned_by=v_user_id, decision_comment=null, decided_at=null
    where id=v_assignment.id returning * into v_assignment;

  insert into public.workflow_events (run_id,step_id,actor_id,event_type,data)
  values (v_run.id,v_step.id,v_user_id,'workflow.assignment_reassigned',
    jsonb_build_object('assignmentId',v_assignment.id,'newUserId',p_new_user_id,'reason',trim(p_reason)));
  insert into public.notifications (workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  values (v_run.workspace_id,p_new_user_id,'system'::public.notification_kind,'Workflow task assigned',v_step.name,
    'workflow',v_run.id,jsonb_build_object('subtype','workflow_reassigned','runId',v_run.id,'stepId',v_step.id,'assignmentId',v_assignment.id));

  return v_assignment;
end;
$$;

-- Public API wrappers remain SECURITY INVOKER. Privileged implementations stay in private.
create or replace function public.start_document_workflow(p_document_id uuid,p_template_id uuid,p_due_at timestamptz default null)
returns public.workflow_runs language sql security invoker set search_path=public,private,pg_temp
as $$ select private.start_document_workflow(p_document_id,p_template_id,p_due_at); $$;
create or replace function public.submit_workflow_decision(p_assignment_id uuid,p_decision text,p_comment text default null)
returns public.workflow_runs language sql security invoker set search_path=public,private,pg_temp
as $$ select private.submit_workflow_decision(p_assignment_id,p_decision,p_comment); $$;
create or replace function public.resubmit_document_workflow(p_run_id uuid,p_expected_document_editor_version integer,p_comment text default null)
returns public.workflow_runs language sql security invoker set search_path=public,private,pg_temp
as $$ select private.resubmit_document_workflow(p_run_id,p_expected_document_editor_version,p_comment); $$;
create or replace function public.cancel_document_workflow(p_run_id uuid,p_reason text)
returns public.workflow_runs language sql security invoker set search_path=public,private,pg_temp
as $$ select private.cancel_document_workflow(p_run_id,p_reason); $$;
create or replace function public.reassign_workflow_assignment(p_assignment_id uuid,p_new_user_id uuid,p_reason text)
returns public.workflow_step_assignees language sql security invoker set search_path=public,private,pg_temp
as $$ select private.reassign_workflow_assignment(p_assignment_id,p_new_user_id,p_reason); $$;

revoke all on function public.start_document_workflow(uuid,uuid,timestamptz) from public, anon;
revoke all on function public.submit_workflow_decision(uuid,text,text) from public, anon;
revoke all on function public.resubmit_document_workflow(uuid,integer,text) from public, anon;
revoke all on function public.cancel_document_workflow(uuid,text) from public, anon;
revoke all on function public.reassign_workflow_assignment(uuid,uuid,text) from public, anon;
grant execute on function public.start_document_workflow(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.submit_workflow_decision(uuid,text,text) to authenticated;
grant execute on function public.resubmit_document_workflow(uuid,integer,text) to authenticated;
grant execute on function public.cancel_document_workflow(uuid,text) to authenticated;
grant execute on function public.reassign_workflow_assignment(uuid,uuid,text) to authenticated;

grant execute on function private.start_document_workflow(uuid,uuid,timestamptz) to authenticated;
grant execute on function private.submit_workflow_decision(uuid,text,text) to authenticated;
grant execute on function private.resubmit_document_workflow(uuid,integer,text) to authenticated;
grant execute on function private.cancel_document_workflow(uuid,text) to authenticated;
grant execute on function private.reassign_workflow_assignment(uuid,uuid,text) to authenticated;

-- Personal work queue view; underlying RLS remains active.
create or replace view public.workflow_work_queue
with (security_invoker = true)
as
select
  wa.id as assignment_id,
  wr.id as run_id,
  ws.id as step_id,
  wr.workspace_id,
  wr.document_id,
  wr.document_version_id,
  d.title as document_title,
  d.document_kind,
  wr.title as workflow_title,
  wr.status as workflow_status,
  wr.workflow_revision,
  ws.step_order,
  ws.name as step_name,
  ws.step_type,
  ws.due_at,
  wa.participant_role,
  wa.status as assignment_status,
  wr.started_by,
  wr.started_at,
  wr.updated_at
from public.workflow_step_assignees wa
join public.workflow_steps ws on ws.id=wa.step_id
join public.workflow_runs wr on wr.id=ws.run_id
join public.documents d on d.id=wr.document_id
where wa.user_id=(select auth.uid())
  and wa.status='pending'
  and ws.status='active'
  and wr.status='in_progress';
revoke all on public.workflow_work_queue from anon;
grant select on public.workflow_work_queue to authenticated;

comment on table public.workflow_runs is 'Document workflow instances tied to immutable document_versions snapshots.';
comment on table public.workflow_decisions is 'Immutable review, approval, rejection, change-request and acknowledgement decisions.';
comment on view public.workflow_work_queue is 'Authenticated user work queue for active pending workflow assignments.';
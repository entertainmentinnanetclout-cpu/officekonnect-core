create index if not exists workflow_comments_step_run_idx
  on public.workflow_comments(step_id,run_id)
  where step_id is not null;
create index if not exists workflow_comments_parent_run_idx
  on public.workflow_comments(parent_id,run_id)
  where parent_id is not null;
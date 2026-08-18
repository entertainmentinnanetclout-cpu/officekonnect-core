alter table public.workflow_steps
  add constraint workflow_steps_id_run_unique unique (id,run_id);

alter table public.workflow_comments
  add constraint workflow_comments_id_run_unique unique (id,run_id);

alter table public.workflow_comments
  add constraint workflow_comments_step_run_fkey
  foreign key (step_id,run_id)
  references public.workflow_steps(id,run_id)
  on delete cascade;

alter table public.workflow_comments
  add constraint workflow_comments_parent_run_fkey
  foreign key (parent_id,run_id)
  references public.workflow_comments(id,run_id)
  on delete set null;

drop policy if exists "Authors and admins update workflow comments" on public.workflow_comments;
revoke update on public.workflow_comments from authenticated;

create or replace function private.update_workflow_comment(
  p_comment_id uuid,
  p_body text
)
returns public.workflow_comments
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_comment public.workflow_comments%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if nullif(trim(p_body),'') is null then raise exception using errcode='22023', message='Comment body is required'; end if;

  select * into v_comment from public.workflow_comments where id=p_comment_id for update;
  if not found then raise exception using errcode='P0002', message='Workflow comment not found'; end if;
  if not private.is_workflow_participant(v_comment.run_id) or v_comment.author_id<>v_user_id then
    raise exception using errcode='42501', message='Only the comment author may edit this comment';
  end if;
  if v_comment.is_resolved then raise exception using errcode='22023', message='Resolved comments cannot be edited'; end if;

  update public.workflow_comments set body=trim(p_body) where id=v_comment.id returning * into v_comment;
  insert into public.workflow_events(run_id,step_id,actor_id,event_type,data)
  values(v_comment.run_id,v_comment.step_id,v_user_id,'workflow.comment_updated',jsonb_build_object('commentId',v_comment.id));
  return v_comment;
end;
$$;

create or replace function private.resolve_workflow_comment(
  p_comment_id uuid,
  p_resolved boolean
)
returns public.workflow_comments
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_comment public.workflow_comments%rowtype;
  v_run public.workflow_runs%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501', message='Authentication required'; end if;
  select * into v_comment from public.workflow_comments where id=p_comment_id for update;
  if not found then raise exception using errcode='P0002', message='Workflow comment not found'; end if;
  select * into v_run from public.workflow_runs where id=v_comment.run_id;

  if not private.is_workflow_participant(v_comment.run_id)
     or not (v_comment.author_id=v_user_id or private.has_workspace_role(v_run.workspace_id,'admin'::public.workspace_role)) then
    raise exception using errcode='42501', message='Only the comment author or a workspace administrator may change resolution';
  end if;

  update public.workflow_comments
  set is_resolved=p_resolved,
      resolved_by=case when p_resolved then v_user_id else null end,
      resolved_at=case when p_resolved then now() else null end
  where id=v_comment.id returning * into v_comment;

  insert into public.workflow_events(run_id,step_id,actor_id,event_type,data)
  values(v_comment.run_id,v_comment.step_id,v_user_id,
    case when p_resolved then 'workflow.comment_resolved' else 'workflow.comment_reopened' end,
    jsonb_build_object('commentId',v_comment.id));
  return v_comment;
end;
$$;

create or replace function public.update_workflow_comment(p_comment_id uuid,p_body text)
returns public.workflow_comments language sql security invoker set search_path=public,private,pg_temp
as $$ select private.update_workflow_comment(p_comment_id,p_body); $$;
create or replace function public.resolve_workflow_comment(p_comment_id uuid,p_resolved boolean)
returns public.workflow_comments language sql security invoker set search_path=public,private,pg_temp
as $$ select private.resolve_workflow_comment(p_comment_id,p_resolved); $$;

revoke all on function public.update_workflow_comment(uuid,text) from public,anon;
revoke all on function public.resolve_workflow_comment(uuid,boolean) from public,anon;
grant execute on function public.update_workflow_comment(uuid,text) to authenticated;
grant execute on function public.resolve_workflow_comment(uuid,boolean) to authenticated;
grant execute on function private.update_workflow_comment(uuid,text) to authenticated;
grant execute on function private.resolve_workflow_comment(uuid,boolean) to authenticated;
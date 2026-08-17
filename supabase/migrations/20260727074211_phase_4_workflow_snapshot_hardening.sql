create or replace function private.create_workflow_document_snapshot(
  p_document_id uuid,
  p_created_by uuid,
  p_title text,
  p_change_summary text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_document public.documents%rowtype;
  v_next_version integer;
  v_version_id uuid;
  v_file_reference text;
begin
  select * into v_document from public.documents where id=p_document_id;
  if not found then raise exception using errcode='P0002', message='Document not found for snapshot'; end if;

  select coalesce(max(version_number),0)+1 into v_next_version
  from public.document_versions where document_id=v_document.id;

  if v_document.document_kind='file' then
    v_file_reference := coalesce(v_document.current_file_url,v_document.original_file_url,v_document.storage_path);
    if v_file_reference is null then
      raise exception using errcode='22023', message='Uploaded file has no versionable file reference';
    end if;
  end if;

  insert into public.document_versions (
    document_id,version_number,file_url,storage_path,created_by,title,content,
    change_summary,word_count,letterhead_id,sheet_count,cell_count,formula_count,calculation_version
  ) values (
    v_document.id,
    v_next_version,
    case when v_document.document_kind='file' then v_file_reference else null end,
    case when v_document.document_kind='file' then v_document.storage_path else null end,
    p_created_by,
    p_title,
    case when v_document.document_kind in ('native','spreadsheet') then v_document.content else null end,
    p_change_summary,
    v_document.word_count,
    v_document.letterhead_id,
    v_document.sheet_count,
    v_document.cell_count,
    v_document.formula_count,
    v_document.calculation_version
  ) returning id into v_version_id;

  return v_version_id;
end;
$$;

grant execute on function private.create_workflow_document_snapshot(uuid,uuid,text,text) to authenticated;

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
  v_assignee_count integer;
  v_step_count integer;
  v_min_order integer;
  v_max_order integer;
  v_participant_role text;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;

  select * into v_document from public.documents where id=p_document_id for update;
  if not found then raise exception using errcode='P0002', message='Document not found'; end if;

  if not private.has_workspace_role(v_document.workspace_id,'member'::public.workspace_role)
     or not (v_document.created_by=v_user_id or private.has_workspace_role(v_document.workspace_id,'admin'::public.workspace_role)) then
    raise exception using errcode='42501', message='Only the document creator or a workspace administrator may start a workflow';
  end if;

  select * into v_template
  from public.workflow_templates
  where id=p_template_id and workspace_id=v_document.workspace_id and is_active=true;
  if not found then raise exception using errcode='P0002', message='Active workflow template not found in this workspace'; end if;

  select count(*),min(step_order),max(step_order)
  into v_step_count,v_min_order,v_max_order
  from public.workflow_template_steps where template_id=v_template.id;
  if v_step_count=0 or v_min_order<>1 or v_max_order<>v_step_count then
    raise exception using errcode='22023', message='Workflow template steps must be contiguous and begin at step 1';
  end if;

  if exists(select 1 from public.workflow_runs where document_id=p_document_id and status in ('in_progress','changes_requested')) then
    raise exception using errcode='23505', message='This document already has an active workflow';
  end if;

  v_version_id := private.create_workflow_document_snapshot(
    v_document.id,
    v_user_id,
    'Workflow submission',
    'Automatic immutable snapshot created for workflow review'
  );

  insert into public.workflow_runs (
    workspace_id,document_id,document_version_id,template_id,template_version,title,status,
    current_step_order,workflow_revision,document_editor_version_at_submission,started_by,due_at
  ) values (
    v_document.workspace_id,v_document.id,v_version_id,v_template.id,v_template.version,v_template.name,'in_progress',
    1,1,v_document.editor_version,v_user_id,p_due_at
  ) returning * into v_run;

  for v_template_step in
    select * from public.workflow_template_steps where template_id=v_template.id order by step_order
  loop
    v_participant_role := case v_template_step.step_type
      when 'review' then 'reviewer'
      when 'approval' then 'approver'
      else 'acknowledger'
    end;

    insert into public.workflow_steps (
      run_id,step_order,name,description,step_type,status,required_decisions,
      allow_changes,allow_reject,due_at,started_at
    ) values (
      v_run.id,v_template_step.step_order,v_template_step.name,v_template_step.description,v_template_step.step_type,
      case when v_template_step.step_order=1 then 'active' else 'pending' end,
      v_template_step.required_decisions,v_template_step.allow_changes,v_template_step.allow_reject,
      case when v_template_step.due_in_hours is null then null else now()+make_interval(hours=>v_template_step.due_in_hours) end,
      case when v_template_step.step_order=1 then now() else null end
    ) returning id into v_step_id;

    if v_template_step.assignment_mode='user' then
      if not exists(select 1 from public.workspace_members where workspace_id=v_document.workspace_id and user_id=v_template_step.assigned_user_id) then
        raise exception using errcode='22023', message='A workflow assignee is no longer a workspace member';
      end if;
      insert into public.workflow_step_assignees(step_id,user_id,assigned_by,participant_role)
      values(v_step_id,v_template_step.assigned_user_id,v_user_id,v_participant_role);
    elsif v_template_step.assignment_mode='document_creator' then
      if not exists(select 1 from public.workspace_members where workspace_id=v_document.workspace_id and user_id=v_document.created_by) then
        raise exception using errcode='22023', message='The document creator is no longer a workspace member';
      end if;
      insert into public.workflow_step_assignees(step_id,user_id,assigned_by,participant_role)
      values(v_step_id,v_document.created_by,v_user_id,v_participant_role);
    elsif v_template_step.assignment_mode='workflow_starter' then
      insert into public.workflow_step_assignees(step_id,user_id,assigned_by,participant_role)
      values(v_step_id,v_user_id,v_user_id,v_participant_role);
    else
      insert into public.workflow_step_assignees(step_id,user_id,assigned_by,participant_role)
      select v_step_id,wm.user_id,v_user_id,v_participant_role
      from public.workspace_members wm
      where wm.workspace_id=v_document.workspace_id
        and (wm.role=v_template_step.assigned_workspace_role
          or (v_template_step.assigned_workspace_role='admin'::public.workspace_role and wm.role='owner'::public.workspace_role));
    end if;

    select count(*) into v_assignee_count from public.workflow_step_assignees where step_id=v_step_id;
    if v_assignee_count=0 or v_template_step.required_decisions>v_assignee_count then
      raise exception using errcode='22023', message=format('Workflow step %s has insufficient assignees',v_template_step.name);
    end if;
  end loop;

  insert into public.workflow_events(run_id,actor_id,event_type,to_status,data)
  values(v_run.id,v_user_id,'workflow.started','in_progress',jsonb_build_object('documentVersionId',v_version_id));
  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_document.workspace_id,v_user_id,'workflow.started','workflow',v_run.id,
    jsonb_build_object('documentId',v_document.id,'templateId',v_template.id,'documentVersionId',v_version_id));
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  select v_document.workspace_id,wa.user_id,'system'::public.notification_kind,'Workflow task assigned',
         format('%s: %s',v_document.title,ws.name),'workflow',v_run.id,
         jsonb_build_object('subtype','workflow_assigned','runId',v_run.id,'stepId',ws.id,'assignmentId',wa.id,'documentId',v_document.id)
  from public.workflow_steps ws join public.workflow_step_assignees wa on wa.step_id=ws.id
  where ws.run_id=v_run.id and ws.status='active';

  return v_run;
end;
$$;

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
  if v_run.status<>'changes_requested' then raise exception using errcode='22023', message='Workflow is not awaiting resubmission'; end if;
  if v_document.editor_version<>p_expected_document_editor_version then
    raise exception using errcode='40001', message='Document changed in another session';
  end if;

  select * into v_step from public.workflow_steps
  where run_id=v_run.id and step_order=v_run.current_step_order for update;
  if not found then raise exception using errcode='P0002', message='Current workflow step not found'; end if;

  v_version_id := private.create_workflow_document_snapshot(
    v_document.id,
    v_user_id,
    'Workflow resubmission',
    coalesce(nullif(trim(p_comment),''),'Corrected document resubmitted after changes were requested')
  );

  update public.workflow_steps set status='active',started_at=now(),completed_at=null where id=v_step.id;
  update public.workflow_step_assignees set status='pending',decision_comment=null,decided_at=null where step_id=v_step.id;
  update public.workflow_runs
    set status='in_progress',document_version_id=v_version_id,
        document_editor_version_at_submission=v_document.editor_version,
        workflow_revision=workflow_revision+1,completed_at=null
    where id=v_run.id returning * into v_run;

  if nullif(trim(p_comment),'') is not null then
    insert into public.workflow_comments(run_id,step_id,author_id,body)
    values(v_run.id,v_step.id,v_user_id,trim(p_comment));
  end if;
  insert into public.workflow_events(run_id,step_id,actor_id,event_type,from_status,to_status,data)
  values(v_run.id,v_step.id,v_user_id,'workflow.resubmitted','changes_requested','in_progress',
    jsonb_build_object('documentVersionId',v_version_id,'workflowRevision',v_run.workflow_revision));
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  select v_run.workspace_id,wa.user_id,'system'::public.notification_kind,'Workflow resubmitted',v_document.title,
         'workflow',v_run.id,jsonb_build_object('subtype','workflow_resubmitted','runId',v_run.id,'stepId',v_step.id,'assignmentId',wa.id,'documentId',v_document.id)
  from public.workflow_step_assignees wa where wa.step_id=v_step.id;
  insert into public.activity_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
  values(v_run.workspace_id,v_user_id,'workflow.resubmitted','workflow',v_run.id,
    jsonb_build_object('documentId',v_document.id,'documentVersionId',v_version_id,'stepId',v_step.id));

  return v_run;
end;
$$;
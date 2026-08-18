create table public.notification_receipts (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index notification_receipts_user_read_idx on public.notification_receipts(user_id, read_at, notification_id);
create trigger notification_receipts_set_updated_at before update on public.notification_receipts for each row execute function public.update_updated_at_column();
alter table public.notification_receipts enable row level security;
create policy "Users manage own notification receipts" on public.notification_receipts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member'::public.workspace_role,
  invited_by uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invitations_email_check check (email = lower(trim(email)) and position('@' in email) > 1),
  constraint workspace_invitations_role_check check (role <> 'owner'::public.workspace_role),
  constraint workspace_invitations_expiry_check check (expires_at > created_at)
);
create unique index workspace_invitations_active_email_idx on public.workspace_invitations(workspace_id, email)
  where accepted_at is null and revoked_at is null;
create index workspace_invitations_workspace_created_idx on public.workspace_invitations(workspace_id, created_at desc);
create index workspace_invitations_email_pending_idx on public.workspace_invitations(email, expires_at)
  where accepted_at is null and revoked_at is null;
create trigger workspace_invitations_set_updated_at before update on public.workspace_invitations for each row execute function public.update_updated_at_column();
alter table public.workspace_invitations enable row level security;
create policy "Admins read workspace invitations" on public.workspace_invitations for select to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'::public.workspace_role));

create or replace function public.list_workspace_notifications(
  p_workspace_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_unread_only boolean default false
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  data jsonb,
  delivered_channels jsonb,
  effective_read_at timestamptz,
  created_at timestamptz,
  is_broadcast boolean
)
language sql stable security definer
set search_path=public,private,pg_temp as $$
  select n.id,
         n.kind::text,
         n.title,
         n.body,
         n.entity_type,
         n.entity_id,
         n.data,
         n.delivered_channels,
         case when n.user_id is null then nr.read_at else n.read_at end as effective_read_at,
         n.created_at,
         n.user_id is null as is_broadcast
  from public.notifications n
  left join public.notification_receipts nr
    on nr.notification_id=n.id and nr.user_id=(select auth.uid())
  where n.workspace_id=p_workspace_id
    and private.is_workspace_member(p_workspace_id)
    and (n.user_id=(select auth.uid()) or n.user_id is null)
    and (
      not p_unread_only
      or case when n.user_id is null then nr.read_at else n.read_at end is null
    )
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200))
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.list_workspace_notifications(uuid,integer,integer,boolean) from public,anon;
grant execute on function public.list_workspace_notifications(uuid,integer,integer,boolean) to authenticated;

create or replace function public.count_unread_workspace_notifications(p_workspace_id uuid)
returns integer
language sql stable security definer
set search_path=public,private,pg_temp as $$
  select count(*)::integer
  from public.notifications n
  left join public.notification_receipts nr
    on nr.notification_id=n.id and nr.user_id=(select auth.uid())
  where n.workspace_id=p_workspace_id
    and private.is_workspace_member(p_workspace_id)
    and (n.user_id=(select auth.uid()) or n.user_id is null)
    and case when n.user_id is null then nr.read_at else n.read_at end is null;
$$;
revoke all on function public.count_unread_workspace_notifications(uuid) from public,anon;
grant execute on function public.count_unread_workspace_notifications(uuid) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v public.notifications%rowtype;
begin
  select * into v from public.notifications where id=p_notification_id;
  if not found then raise exception 'Notification not found'; end if;
  if not private.is_workspace_member(v.workspace_id) then raise exception 'Forbidden'; end if;
  if v.user_id is not null and v.user_id <> (select auth.uid()) then raise exception 'Forbidden'; end if;
  if v.user_id is null then
    insert into public.notification_receipts(notification_id,user_id,read_at)
    values (v.id,(select auth.uid()),now())
    on conflict (notification_id,user_id) do update set read_at=excluded.read_at, archived_at=null, updated_at=now();
  else
    update public.notifications set read_at=coalesce(read_at,now()) where id=v.id and user_id=(select auth.uid());
  end if;
end $$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_workspace_notifications_read(p_workspace_id uuid)
returns integer
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare changed integer:=0; inserted_count integer:=0;
begin
  if not private.is_workspace_member(p_workspace_id) then raise exception 'Forbidden'; end if;
  update public.notifications
     set read_at=coalesce(read_at,now())
   where workspace_id=p_workspace_id and user_id=(select auth.uid()) and read_at is null;
  get diagnostics changed = row_count;
  insert into public.notification_receipts(notification_id,user_id,read_at)
  select n.id,(select auth.uid()),now()
    from public.notifications n
    left join public.notification_receipts nr on nr.notification_id=n.id and nr.user_id=(select auth.uid())
   where n.workspace_id=p_workspace_id and n.user_id is null and nr.read_at is null
  on conflict (notification_id,user_id) do update set read_at=excluded.read_at, archived_at=null, updated_at=now();
  get diagnostics inserted_count = row_count;
  return changed + inserted_count;
end $$;
revoke all on function public.mark_all_workspace_notifications_read(uuid) from public,anon;
grant execute on function public.mark_all_workspace_notifications_read(uuid) to authenticated;

create or replace function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role default 'member'::public.workspace_role,
  p_expires_in_days integer default 7
)
returns table(invitation_id uuid, raw_token text, expires_at timestamptz)
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare
  v_email text:=lower(trim(p_email));
  v_token text:=encode(extensions.gen_random_bytes(32),'hex');
  v_inviter_role public.workspace_role;
  v_id uuid;
  v_expires timestamptz;
  v_existing_user uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select role into v_inviter_role from public.workspace_members where workspace_id=p_workspace_id and user_id=(select auth.uid());
  if v_inviter_role not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if p_role='owner' then raise exception 'Owner role cannot be invited'; end if;
  if v_inviter_role='admin' and p_role='admin' then raise exception 'Only the workspace owner can invite admins'; end if;
  if v_email='' or position('@' in v_email)<=1 then raise exception 'A valid email is required'; end if;
  if exists(select 1 from public.workspace_members wm join public.profiles p on p.id=wm.user_id where wm.workspace_id=p_workspace_id and lower(p.email)=v_email) then
    raise exception 'This person is already a workspace member';
  end if;
  update public.workspace_invitations set revoked_at=now()
   where workspace_id=p_workspace_id and email=v_email and accepted_at is null and revoked_at is null;
  v_expires:=now()+make_interval(days=>greatest(1,least(coalesce(p_expires_in_days,7),30)));
  insert into public.workspace_invitations(workspace_id,email,role,invited_by,token_hash,expires_at)
  values(p_workspace_id,v_email,p_role,(select auth.uid()),encode(extensions.digest(v_token,'sha256'),'hex'),v_expires)
  returning id into v_id;
  select id into v_existing_user from public.profiles where lower(email)=v_email limit 1;
  if v_existing_user is not null then
    insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
    values(p_workspace_id,v_existing_user,'member_invited'::public.notification_kind,'Workspace invitation','You have been invited to join a workspace.','workspace_invitation',v_id,jsonb_build_object('route','/dashboard/team','invitationId',v_id));
  end if;
  return query select v_id,v_token,v_expires;
end $$;
revoke all on function public.create_workspace_invitation(uuid,text,public.workspace_role,integer) from public,anon;
grant execute on function public.create_workspace_invitation(uuid,text,public.workspace_role,integer) to authenticated;

create or replace function public.list_my_workspace_invitations()
returns table(invitation_id uuid,workspace_id uuid,workspace_name text,email text,role public.workspace_role,invited_by uuid,inviter_name text,expires_at timestamptz,created_at timestamptz)
language sql stable security definer
set search_path=public,private,pg_temp as $$
  select wi.id,wi.workspace_id,w.name,wi.email,wi.role,wi.invited_by,coalesce(nullif(trim(p.full_name),''),p.email),wi.expires_at,wi.created_at
  from public.workspace_invitations wi
  join public.workspaces w on w.id=wi.workspace_id
  left join public.profiles p on p.id=wi.invited_by
  join public.profiles me on me.id=(select auth.uid())
  where lower(wi.email)=lower(me.email)
    and wi.accepted_at is null and wi.revoked_at is null and wi.expires_at>now()
  order by wi.created_at desc;
$$;
revoke all on function public.list_my_workspace_invitations() from public,anon;
grant execute on function public.list_my_workspace_invitations() to authenticated;

create or replace function public.accept_workspace_invitation_by_id(p_invitation_id uuid)
returns table(workspace_id uuid,workspace_name text,role public.workspace_role)
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v public.workspace_invitations%rowtype; v_email text; v_name text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select email into v_email from public.profiles where id=(select auth.uid());
  select * into v from public.workspace_invitations where id=p_invitation_id for update;
  if not found or v.accepted_at is not null or v.revoked_at is not null or v.expires_at<=now() then raise exception 'Invitation is invalid or expired'; end if;
  if lower(v.email)<>lower(v_email) then raise exception 'This invitation belongs to another email address'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=v.workspace_id and user_id=(select auth.uid())) then
    insert into public.workspace_members(workspace_id,user_id,role,invited_by)
    values(v.workspace_id,(select auth.uid()),v.role,v.invited_by);
  end if;
  update public.workspace_invitations set accepted_at=now(),accepted_by=(select auth.uid()) where id=v.id;
  update public.profiles set default_workspace_id=coalesce(default_workspace_id,v.workspace_id) where id=(select auth.uid());
  select name into v_name from public.workspaces where id=v.workspace_id;
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  values(v.workspace_id,v.invited_by,'system'::public.notification_kind,'Workspace invitation accepted',coalesce(v_email,'A member')||' joined '||v_name,'workspace_member',(select auth.uid()),jsonb_build_object('route','/dashboard/team'));
  return query select v.workspace_id,v_name,v.role;
end $$;
revoke all on function public.accept_workspace_invitation_by_id(uuid) from public,anon;
grant execute on function public.accept_workspace_invitation_by_id(uuid) to authenticated;

create or replace function public.accept_workspace_invitation(p_token text)
returns table(workspace_id uuid,workspace_name text,role public.workspace_role)
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into v_id from public.workspace_invitations
   where token_hash=encode(extensions.digest(trim(p_token),'sha256'),'hex')
     and accepted_at is null and revoked_at is null and expires_at>now();
  if v_id is null then raise exception 'Invitation is invalid or expired'; end if;
  return query select * from public.accept_workspace_invitation_by_id(v_id);
end $$;
revoke all on function public.accept_workspace_invitation(text) from public,anon;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

create or replace function public.revoke_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.workspace_invitations where id=p_invitation_id;
  if v_ws is null then raise exception 'Invitation not found'; end if;
  if not private.has_workspace_role(v_ws,'admin'::public.workspace_role) then raise exception 'Admin access required'; end if;
  update public.workspace_invitations set revoked_at=now() where id=p_invitation_id and accepted_at is null and revoked_at is null;
end $$;
revoke all on function public.revoke_workspace_invitation(uuid) from public,anon;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

create or replace function public.update_workspace_member_role(p_workspace_id uuid,p_user_id uuid,p_role public.workspace_role)
returns void
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v_actor public.workspace_role; v_target public.workspace_role;
begin
  if p_role='owner' then raise exception 'Owner transfer is not supported here'; end if;
  select role into v_actor from public.workspace_members where workspace_id=p_workspace_id and user_id=(select auth.uid());
  select role into v_target from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
  if v_actor not in ('owner','admin') then raise exception 'Admin access required'; end if;
  if v_target is null then raise exception 'Member not found'; end if;
  if v_target='owner' then raise exception 'The workspace owner role cannot be changed'; end if;
  if v_actor='admin' and (v_target='admin' or p_role='admin') then raise exception 'Only the owner can manage admin roles'; end if;
  update public.workspace_members set role=p_role where workspace_id=p_workspace_id and user_id=p_user_id;
  insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
  values(p_workspace_id,p_user_id,'system'::public.notification_kind,'Workspace role updated','Your workspace role is now '||p_role::text,'workspace_member',p_user_id,jsonb_build_object('route','/dashboard/team','role',p_role::text));
end $$;
revoke all on function public.update_workspace_member_role(uuid,uuid,public.workspace_role) from public,anon;
grant execute on function public.update_workspace_member_role(uuid,uuid,public.workspace_role) to authenticated;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid)
returns void
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v_actor public.workspace_role; v_target public.workspace_role;
begin
  select role into v_actor from public.workspace_members where workspace_id=p_workspace_id and user_id=(select auth.uid());
  select role into v_target from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
  if v_target is null then raise exception 'Member not found'; end if;
  if v_target='owner' then raise exception 'The workspace owner cannot leave or be removed'; end if;
  if p_user_id<>(select auth.uid()) then
    if v_actor not in ('owner','admin') then raise exception 'Admin access required'; end if;
    if v_actor='admin' and v_target='admin' then raise exception 'Only the owner can remove an admin'; end if;
  end if;
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
  update public.profiles set default_workspace_id=null where id=p_user_id and default_workspace_id=p_workspace_id;
end $$;
revoke all on function public.remove_workspace_member(uuid,uuid) from public,anon;
grant execute on function public.remove_workspace_member(uuid,uuid) to authenticated;

create or replace function public.create_workspace(p_name text)
returns table(workspace_id uuid,name text,slug text)
language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v_id uuid:=gen_random_uuid(); v_name text:=trim(p_name); v_slug text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if char_length(v_name)<2 or char_length(v_name)>120 then raise exception 'Workspace name must be between 2 and 120 characters'; end if;
  v_slug:=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'))||'-'||substr(v_id::text,1,8);
  insert into public.workspaces(id,name,slug,owner_id) values(v_id,v_name,v_slug,(select auth.uid()));
  insert into public.workspace_members(workspace_id,user_id,role) values(v_id,(select auth.uid()),'owner'::public.workspace_role);
  insert into public.subscriptions(workspace_id,plan,status) values(v_id,'free'::public.subscription_plan,'active'::public.subscription_status) on conflict do nothing;
  update public.profiles set default_workspace_id=v_id where id=(select auth.uid());
  return query select v_id,v_name,v_slug;
end $$;
revoke all on function public.create_workspace(text) from public,anon;
grant execute on function public.create_workspace(text) to authenticated;

create or replace function public.list_workspace_activity(p_workspace_id uuid,p_limit integer default 100,p_offset integer default 0)
returns table(source text,event_id uuid,action text,entity_type text,entity_id uuid,actor_id uuid,actor_name text,occurred_at timestamptz,metadata jsonb,route text)
language plpgsql stable security definer
set search_path=public,private,pg_temp as $$
declare v_admin boolean;
begin
  if not private.is_workspace_member(p_workspace_id) then raise exception 'Forbidden'; end if;
  v_admin:=private.has_workspace_role(p_workspace_id,'admin'::public.workspace_role);
  return query
  with events as (
    select 'activity'::text as source,a.id as event_id,a.action,a.entity_type,a.entity_id,a.user_id as actor_id,
      coalesce(nullif(trim(p.full_name),''),p.email,'System') as actor_name,a.created_at as occurred_at,a.metadata,
      case
        when a.entity_type='documents' then '/dashboard/documents/'||a.entity_id::text
        when a.entity_type='tasks' then '/dashboard/tasks?task='||a.entity_id::text
        when a.entity_type='calendar_events' then '/dashboard/calendar'
        when a.entity_type in ('workspace_members','workspace_invitations','workspaces') then '/dashboard/team'
        when a.entity_type='document_templates' then '/dashboard/templates'
        else '/dashboard/activity'
      end as route
    from public.activity_logs a left join public.profiles p on p.id=a.user_id
    where a.workspace_id=p_workspace_id and (v_admin or a.user_id=(select auth.uid()))
    union all
    select 'workflow',we.id,we.event_type,'workflow',we.run_id,we.actor_id,
      coalesce(nullif(trim(p.full_name),''),p.email,'System'),we.created_at,
      we.data||jsonb_build_object('fromStatus',we.from_status,'toStatus',we.to_status,'stepId',we.step_id),
      '/dashboard/workflows/'||we.run_id::text
    from public.workflow_events we join public.workflow_runs wr on wr.id=we.run_id left join public.profiles p on p.id=we.actor_id
    where wr.workspace_id=p_workspace_id and (v_admin or we.actor_id=(select auth.uid()))
    union all
    select 'signing',se.id,se.event_type,'signing_request',se.request_id,se.actor_id,
      coalesce(nullif(trim(p.full_name),''),p.email,case when se.event_source='external' then 'External signer' else 'System' end),se.created_at,
      se.metadata||jsonb_build_object('eventSource',se.event_source,'eventHash',se.event_hash),
      '/dashboard/signing/'||se.request_id::text
    from public.signing_events se join public.signing_requests sr on sr.id=se.request_id left join public.profiles p on p.id=se.actor_id
    where sr.workspace_id=p_workspace_id and (v_admin or se.actor_id=(select auth.uid()))
  )
  select e.source,e.event_id,e.action,e.entity_type,e.entity_id,e.actor_id,e.actor_name,e.occurred_at,e.metadata,e.route
    from events e order by e.occurred_at desc
    limit greatest(1,least(coalesce(p_limit,100),300)) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.list_workspace_activity(uuid,integer,integer) from public,anon;
grant execute on function public.list_workspace_activity(uuid,integer,integer) to authenticated;

create or replace function public.notify_task_assignment()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.assignee_id is not null
     and (tg_op='INSERT' or old.assignee_id is distinct from new.assignee_id)
     and new.assignee_id is distinct from (select auth.uid()) then
    insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
    values(new.workspace_id,new.assignee_id,'system'::public.notification_kind,'Task assigned',new.title,'task',new.id,jsonb_build_object('route','/dashboard/tasks?task='||new.id::text,'priority',new.priority,'dueAt',new.due_at));
  end if;
  return new;
end $$;
revoke all on function public.notify_task_assignment() from public,anon,authenticated;

drop trigger if exists tasks_notify_assignment on public.tasks;
create trigger tasks_notify_assignment after insert or update of assignee_id on public.tasks for each row execute function public.notify_task_assignment();

create trigger aud_tasks after insert or update or delete on public.tasks for each row execute function public.log_activity();
create trigger aud_calendar_events after insert or update or delete on public.calendar_events for each row execute function public.log_activity();
create trigger aud_document_templates after insert or update or delete on public.document_templates for each row execute function public.log_activity();
create trigger aud_workspace_members after insert or update or delete on public.workspace_members for each row execute function public.log_activity();
create trigger aud_workspaces after insert or update or delete on public.workspaces for each row execute function public.log_activity();
create trigger aud_workspace_invitations after insert or update or delete on public.workspace_invitations for each row execute function public.log_activity();
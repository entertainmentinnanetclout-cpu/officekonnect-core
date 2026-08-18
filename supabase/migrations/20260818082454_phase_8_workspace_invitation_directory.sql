create or replace function public.list_workspace_invitations(p_workspace_id uuid)
returns table(invitation_id uuid,email text,role public.workspace_role,invited_by uuid,inviter_name text,expires_at timestamptz,created_at timestamptz)
language sql stable security definer
set search_path=public,private,pg_temp as $$
  select wi.id,wi.email,wi.role,wi.invited_by,coalesce(nullif(trim(p.full_name),''),p.email,'Workspace admin'),wi.expires_at,wi.created_at
  from public.workspace_invitations wi
  left join public.profiles p on p.id=wi.invited_by
  where wi.workspace_id=p_workspace_id
    and private.has_workspace_role(p_workspace_id,'admin'::public.workspace_role)
    and wi.accepted_at is null and wi.revoked_at is null and wi.expires_at>now()
  order by wi.created_at desc;
$$;
revoke all on function public.list_workspace_invitations(uuid) from public,anon;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;

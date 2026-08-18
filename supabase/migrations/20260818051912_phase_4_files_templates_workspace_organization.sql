create unique index if not exists documents_id_workspace_uidx
  on public.documents (id, workspace_id);

create table public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid null,
  created_by uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_folders_name_check check (char_length(trim(name)) between 1 and 120),
  constraint workspace_folders_self_parent_check check (parent_id is null or parent_id <> id),
  constraint workspace_folders_id_workspace_unique unique (id, workspace_id),
  constraint workspace_folders_parent_workspace_fkey
    foreign key (parent_id, workspace_id)
    references public.workspace_folders(id, workspace_id)
    on delete cascade
);

create unique index workspace_folders_sibling_name_uidx
  on public.workspace_folders (
    workspace_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  );
create index workspace_folders_workspace_parent_idx
  on public.workspace_folders(workspace_id, parent_id, name);

create trigger workspace_folders_set_updated_at
before update on public.workspace_folders
for each row execute function public.update_updated_at_column();

create table public.document_folder_items (
  document_id uuid primary key,
  workspace_id uuid not null,
  folder_id uuid not null,
  moved_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_folder_items_document_workspace_fkey
    foreign key (document_id, workspace_id)
    references public.documents(id, workspace_id)
    on delete cascade,
  constraint document_folder_items_folder_workspace_fkey
    foreign key (folder_id, workspace_id)
    references public.workspace_folders(id, workspace_id)
    on delete cascade
);
create index document_folder_items_workspace_folder_idx
  on public.document_folder_items(workspace_id, folder_id, updated_at desc);
create trigger document_folder_items_set_updated_at
before update on public.document_folder_items
for each row execute function public.update_updated_at_column();

create table public.document_favorites (
  document_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (document_id, user_id),
  constraint document_favorites_document_workspace_fkey
    foreign key (document_id, workspace_id)
    references public.documents(id, workspace_id)
    on delete cascade
);
create index document_favorites_user_workspace_idx
  on public.document_favorites(user_id, workspace_id, created_at desc);

create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  workspace_id uuid not null,
  shared_with uuid not null,
  shared_by uuid not null,
  permission text not null default 'view',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_shares_permission_check check (permission = 'view'),
  constraint document_shares_not_self_check check (shared_with <> shared_by),
  constraint document_shares_document_workspace_fkey
    foreign key (document_id, workspace_id)
    references public.documents(id, workspace_id)
    on delete cascade,
  constraint document_shares_document_recipient_unique unique(document_id, shared_with)
);
create index document_shares_recipient_workspace_idx
  on public.document_shares(shared_with, workspace_id, created_at desc);
create index document_shares_document_idx
  on public.document_shares(document_id, created_at desc);
create trigger document_shares_set_updated_at
before update on public.document_shares
for each row execute function public.update_updated_at_column();

alter table public.workspace_folders enable row level security;
alter table public.document_folder_items enable row level security;
alter table public.document_favorites enable row level security;
alter table public.document_shares enable row level security;

create policy "Workspace members read folders"
on public.workspace_folders for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Members create own folders"
on public.workspace_folders for insert
to authenticated
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and created_by = (select auth.uid())
);

create policy "Folder owners or admins update folders"
on public.workspace_folders for update
to authenticated
using (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
)
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
);

create policy "Folder owners or admins delete folders"
on public.workspace_folders for delete
to authenticated
using (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
);

create policy "Workspace members read folder assignments"
on public.document_folder_items for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "Document owners manage folder assignments"
on public.document_folder_items for all
to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.workspace_id = workspace_id
      and private.has_workspace_role(d.workspace_id, 'member'::public.workspace_role)
      and (d.created_by = (select auth.uid()) or private.has_workspace_role(d.workspace_id, 'admin'::public.workspace_role))
  )
)
with check (
  moved_by = (select auth.uid())
  and exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.workspace_id = workspace_id
      and private.has_workspace_role(d.workspace_id, 'member'::public.workspace_role)
      and (d.created_by = (select auth.uid()) or private.has_workspace_role(d.workspace_id, 'admin'::public.workspace_role))
  )
);

create policy "Users read own favorites"
on public.document_favorites for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_workspace_member(workspace_id)
);

create policy "Users add own favorites"
on public.document_favorites for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_workspace_member(workspace_id)
);

create policy "Users remove own favorites"
on public.document_favorites for delete
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_workspace_member(workspace_id)
);

create policy "Share recipients and document owners read shares"
on public.document_shares for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
  and (
    shared_with = (select auth.uid())
    or shared_by = (select auth.uid())
    or exists (
      select 1 from public.documents d
      where d.id = document_id
        and d.workspace_id = workspace_id
        and (d.created_by = (select auth.uid()) or private.has_workspace_role(d.workspace_id, 'admin'::public.workspace_role))
    )
  )
);

create policy "Document owners create shares"
on public.document_shares for insert
to authenticated
with check (
  shared_by = (select auth.uid())
  and shared_with <> (select auth.uid())
  and private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.workspace_id = workspace_id
      and (d.created_by = (select auth.uid()) or private.has_workspace_role(d.workspace_id, 'admin'::public.workspace_role))
  )
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = document_shares.workspace_id
      and wm.user_id = document_shares.shared_with
  )
);

create policy "Document owners remove shares"
on public.document_shares for delete
to authenticated
using (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.workspace_id = workspace_id
      and (d.created_by = (select auth.uid()) or private.has_workspace_role(d.workspace_id, 'admin'::public.workspace_role))
  )
);

create or replace function public.list_workspace_member_directory(p_workspace_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.workspace_role
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select wm.user_id, p.full_name, p.email, wm.role
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and private.is_workspace_member(p_workspace_id)
  order by coalesce(nullif(trim(p.full_name), ''), p.email), p.email;
$$;

revoke all on function public.list_workspace_member_directory(uuid) from public;
grant execute on function public.list_workspace_member_directory(uuid) to authenticated;

drop policy if exists "Admins create document templates" on public.document_templates;
drop policy if exists "Admins update document templates" on public.document_templates;
drop policy if exists "Admins delete document templates" on public.document_templates;

create policy "Members create own document templates"
on public.document_templates for insert
to authenticated
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and created_by = (select auth.uid())
);

create policy "Template owners or admins update templates"
on public.document_templates for update
to authenticated
using (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
)
with check (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
);

create policy "Template owners or admins delete templates"
on public.document_templates for delete
to authenticated
using (
  private.has_workspace_role(workspace_id, 'member'::public.workspace_role)
  and (created_by = (select auth.uid()) or private.has_workspace_role(workspace_id, 'admin'::public.workspace_role))
);

drop trigger if exists guard_locked_signing_request on public.signing_requests;
drop trigger if exists guard_locked_signing_participants on public.signing_participants;
drop trigger if exists guard_locked_signing_fields on public.signing_fields;

drop policy if exists sr_update on public.signing_requests;
drop policy if exists sr_delete on public.signing_requests;
create policy sr_update on public.signing_requests
for update to authenticated
using (
  status='draft'::public.signing_request_status
  and locked_at is null
  and (
    sender_id=(select auth.uid())
    or private.has_workspace_role(workspace_id,'admin'::public.workspace_role)
  )
)
with check (
  status='draft'::public.signing_request_status
  and locked_at is null
  and (
    sender_id=(select auth.uid())
    or private.has_workspace_role(workspace_id,'admin'::public.workspace_role)
  )
);
create policy sr_delete on public.signing_requests
for delete to authenticated
using (
  status='draft'::public.signing_request_status
  and locked_at is null
  and (
    sender_id=(select auth.uid())
    or private.has_workspace_role(workspace_id,'admin'::public.workspace_role)
  )
);

drop policy if exists sp_insert on public.signing_participants;
drop policy if exists sp_update on public.signing_participants;
drop policy if exists sp_delete on public.signing_participants;
create policy sp_insert on public.signing_participants
for insert to authenticated
with check (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
));
create policy sp_update on public.signing_participants
for update to authenticated
using (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
))
with check (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
));
create policy sp_delete on public.signing_participants
for delete to authenticated
using (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
));

drop policy if exists sf_insert on public.signing_fields;
drop policy if exists sf_update on public.signing_fields;
drop policy if exists sf_delete on public.signing_fields;
create policy sf_insert on public.signing_fields
for insert to authenticated
with check (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
));
create policy sf_update on public.signing_fields
for update to authenticated
using (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
))
with check (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
));
create policy sf_delete on public.signing_fields
for delete to authenticated
using (exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id
    and sr.status='draft'::public.signing_request_status
    and sr.locked_at is null
    and (
      sr.sender_id=(select auth.uid())
      or private.has_workspace_role(sr.workspace_id,'admin'::public.workspace_role)
    )
));

comment on table public.signing_requests is 'Draft configuration is directly editable under RLS; sent requests are structurally immutable and change only through controlled signing RPCs.';
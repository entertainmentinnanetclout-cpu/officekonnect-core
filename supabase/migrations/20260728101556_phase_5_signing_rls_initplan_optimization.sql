drop policy if exists sr_select on public.signing_requests;
drop policy if exists sr_insert on public.signing_requests;
create policy sr_select on public.signing_requests
for select to authenticated
using (
  sender_id=(select auth.uid())
  or private.is_signing_participant(id)
);
create policy sr_insert on public.signing_requests
for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and private.has_workspace_role(workspace_id,'member'::public.workspace_role)
);

drop policy if exists sp_select on public.signing_participants;
create policy sp_select on public.signing_participants
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.is_signing_request_sender(request_id)
);
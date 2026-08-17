drop policy if exists sp_insert on public.signing_participants;
create policy sp_insert on public.signing_participants
for insert to authenticated
with check (private.is_signing_request_sender(request_id) and exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id and sr.status='draft'::public.signing_request_status and sr.locked_at is null
));

drop policy if exists sp_update on public.signing_participants;
create policy sp_update on public.signing_participants
for update to authenticated
using (private.is_signing_request_sender(request_id) and exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id and sr.status='draft'::public.signing_request_status and sr.locked_at is null
))
with check (private.is_signing_request_sender(request_id) and exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id and sr.status='draft'::public.signing_request_status and sr.locked_at is null
));

drop policy if exists sp_delete on public.signing_participants;
create policy sp_delete on public.signing_participants
for delete to authenticated
using (private.is_signing_request_sender(request_id) and exists (
  select 1 from public.signing_requests sr
  where sr.id=request_id and sr.status='draft'::public.signing_request_status and sr.locked_at is null
));
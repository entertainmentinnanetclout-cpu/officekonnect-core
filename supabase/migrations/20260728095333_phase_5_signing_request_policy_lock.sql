drop policy if exists sr_update on public.signing_requests;
create policy sr_update on public.signing_requests
for update to authenticated
using (sender_id = auth.uid() and status = 'draft'::public.signing_request_status and locked_at is null)
with check (sender_id = auth.uid() and status = 'draft'::public.signing_request_status and locked_at is null);

drop policy if exists sr_delete on public.signing_requests;
create policy sr_delete on public.signing_requests
for delete to authenticated
using (sender_id = auth.uid() and status = 'draft'::public.signing_request_status and locked_at is null);
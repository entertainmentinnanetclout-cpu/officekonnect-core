create or replace function private.notify_cc_signing_recipients()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
begin
  if old.status='draft'::public.signing_request_status and new.status='sent'::public.signing_request_status then
    update public.signing_participants
    set invited_at=coalesce(invited_at,now()),last_notified_at=coalesce(last_notified_at,now())
    where request_id=new.id and role='cc'::public.signing_participant_role;

    insert into public.notifications(workspace_id,user_id,kind,title,body,entity_type,entity_id,data)
    select new.workspace_id,sp.user_id,'system'::public.notification_kind,
      'Document shared for your records',new.title,'signing_request',new.id,
      jsonb_build_object('subtype','signing_cc_shared','requestId',new.id,'participantId',sp.id,'documentId',new.document_id)
    from public.signing_participants sp
    where sp.request_id=new.id and sp.role='cc'::public.signing_participant_role and sp.user_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_cc_signing_recipients on public.signing_requests;
create trigger notify_cc_signing_recipients
after update of status on public.signing_requests
for each row execute function private.notify_cc_signing_recipients();
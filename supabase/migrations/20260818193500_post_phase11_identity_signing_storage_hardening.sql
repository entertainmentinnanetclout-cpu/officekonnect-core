alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$'
  );

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;

create index if not exists profiles_directory_full_name_idx
  on public.profiles (lower(full_name));
create index if not exists profiles_directory_email_idx
  on public.profiles (lower(email));

create or replace function public.search_officekonnect_directory(
  p_query text default '',
  p_limit integer default 20
)
returns table(
  user_id uuid,
  full_name text,
  email text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.username,
    p.avatar_url
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and coalesce(u.is_anonymous, false) = false
    and u.email is not null
    and p.is_active = true
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or p.full_name ilike '%' || trim(p_query) || '%'
      or p.email ilike '%' || trim(p_query) || '%'
      or p.username ilike '%' || trim(p_query) || '%'
    )
  order by
    case
      when lower(coalesce(p.username, '')) = lower(trim(coalesce(p_query, ''))) then 0
      when lower(coalesce(p.email, '')) = lower(trim(coalesce(p_query, ''))) then 1
      when lower(coalesce(p.full_name, '')) = lower(trim(coalesce(p_query, ''))) then 2
      else 3
    end,
    coalesce(nullif(trim(p.full_name), ''), p.email),
    p.email
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_officekonnect_directory(text, integer) from public;
grant execute on function public.search_officekonnect_directory(text, integer) to authenticated;

create or replace function private.enforce_registered_signing_participant()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_email text;
  v_full_name text;
begin
  if new.user_id is null then
    raise exception 'Signing participants must have an OfficeKonnect account';
  end if;

  select p.email, p.full_name
    into v_email, v_full_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = new.user_id
    and p.is_active = true
    and coalesce(u.is_anonymous, false) = false
    and u.email is not null;

  if v_email is null then
    raise exception 'Selected signer does not have an active OfficeKonnect profile';
  end if;

  new.email := lower(v_email);
  new.full_name := coalesce(nullif(trim(v_full_name), ''), v_email);
  return new;
end;
$$;

drop trigger if exists signing_participants_registered_profile_guard on public.signing_participants;
create trigger signing_participants_registered_profile_guard
before insert or update of user_id, email, full_name
on public.signing_participants
for each row
execute function private.enforce_registered_signing_participant();

drop policy if exists "avatars owner read" on storage.objects;
create policy "avatars owner read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

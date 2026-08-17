alter table public.signing_participants
  add column if not exists consent_at timestamptz,
  add column if not exists consent_text_version text,
  add column if not exists last_access_at timestamptz,
  add column if not exists last_notified_at timestamptz;
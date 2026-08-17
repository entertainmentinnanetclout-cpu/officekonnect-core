alter table public.signing_fields
  alter column field_key set default gen_random_uuid()::text;

comment on column public.signing_fields.field_key is 'Stable request-scoped field identifier; generated automatically when the client does not provide one.';
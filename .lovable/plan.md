# OfficeKonnect Base V1 — Backend Plan (v2, extended)

Backend-only, Supabase-first, host-agnostic (deploys to Vercel; Cloudflare/CDN can be added later without backend changes). Mobile (Android/iOS), desktop, and OfficeKonnect Pro team workspaces are first-class from day one.

OfficeKonnect Base V1 — Backend Build Plan

Backend-only. No UI work. Supabase (external project ydgsmnzcwkrlghlhtpgq) already connected. Target deploy: Vercel + Supabase (no Cloudflare-Worker-specific code).

Stack notes (important — please confirm)

This project is currently scaffolded as TanStack Start, whose default server runtime targets Cloudflare Workers. You asked for Vercel compatibility and to avoid Worker-specific code. I'll keep all business logic inside Supabase Edge Functions (Deno) as you specified, so server logic is host-agnostic and runs on Supabase regardless of whether the frontend is later deployed to Vercel, Cloudflare, or anywhere else. The TanStack app itself is standard React/Vite and deploys cleanly to Vercel.

Per your spec I will use Supabase Edge Functions for all backend logic (not TanStack createServerFn). This overrides the default stack recommendation because you explicitly required Edge Functions and a host-agnostic backend.

Secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY already exist. I will additionally request: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, OPENAI_API_KEY.

1. Database migration (single migration)

Enums

subscription_plan_enum: free, professional, business

subscription_status_enum: active, trialing, past_due, canceled, expired

document_status_enum: draft, signed, converted, sent, archived, deleted

campaign_status_enum: draft, scheduled, sending, completed, failed

delivery_status_enum: pending, sent, delivered, bounced, failed, complained

transcription_status_enum: pending, processing, completed, failed

billing_event_type_enum: created, renewed, upgraded, downgraded, canceled, payment_succeeded, payment_failed, refunded

app_role: admin, user

Tables (UUID PKs, created_at/updated_at with trigger where applicable, FK ON DELETE rules tuned per relationship)

Table

Notes

profiles

PK = [auth.users.id](http://auth.users.id), all spec fields, last_login timestamptz, is_active bool default true

user_roles

(user_id, role) unique; separate from profiles to prevent privilege escalation

user_signatures

unique (user_id) where is_default partial index

documents

spec fields, storage_path for original/current, indexes on user_id, document_status

document_versions

(document_id, version_number) unique

document_signatures

coordinate fields numeric

letterheads

spec fields, company_details jsonb

email_templates

spec fields + merge_tags jsonb

contacts

(user_id, lower(email)) unique partial index

contact_groups

(user_id, name) unique

contact_group_members

(group_id, contact_id) unique

email_campaigns

counters default 0

campaign_recipients

(campaign_id, contact_id) unique, indexes on status

voice_notes

duration_seconds int

transcription_jobs

provider default 'openai_whisper', result jsonb

activity_logs

ip_address inet, indexes on (user_id, created_at desc) and entity_type, entity_id

subscriptions

one active per user (partial unique index where status in active/trialing)

billing_events

indexed on subscription_id, created_at

usage_metrics

per-user counters (documents, signatures, campaigns, voice_minutes) for subscription limits

Functions / triggers

public.update_updated_at_column() — generic updated_at trigger, applied to all mutable tables.

public.handle_new_user() — SECURITY DEFINER, fires on auth.users insert. Creates profiles row (email, full_name from raw_user_meta_data, default plan=free, status=active), subscriptions free row, usage_metrics row, default user_roles = 'user'.

public.handle_user_login() — updates profiles.last_login (called from edge fn or via auth hook).

public.has_role(_user_id uuid, *role app*role) — SECURITY DEFINER, used in RLS to avoid recursion.

public.log_activity() — generic audit trigger function attached to documents, user_signatures, email_campaigns, voice_notes, profiles, subscriptions. Writes to activity_logs with action (INSERT/UPDATE/DELETE), entity_type=TG_TABLE_NAME, entity_id, metadata jsonb diff.

[public.is](http://public.is)_document_owner(_doc_id uuid) — SECURITY DEFINER, used by document_versions/document_signatures policies.

[public.is](http://public.is)_campaign_owner(_campaign_id uuid) — same pattern for campaign_recipients.

[public.is](http://public.is)_group_owner(_group_id uuid) — for contact_group_members.

[public.is](http://public.is)_voice_note_owner(_voice_note_id uuid) — for transcription_jobs.

GRANTs (per project rules)

Every public table gets GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;. No anon grants — every policy scopes to auth.uid().

RLS

Enabled on every table. Pattern: USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id). Child tables use security-definer ownership helpers above. activity_logs/billing_events: SELECT-only for owners, INSERT restricted to service_role (triggers + edge fns).

Realtime

ALTER PUBLICATION supabase_realtime ADD TABLE for documents, email_campaigns, transcription_jobs, voice_notes, activity_logs.

2. Storage buckets + policies (created via storage tool, RLS policies on storage.objects via SQL)

Bucket

Public

Folder convention

Size limit

MIME

avatars

yes

{user_id}/...

5 MB

image/*

signatures

no

{user_id}/...

2 MB

image/png, image/svg+xml

documents

no

{user_id}/...

50 MB

pdf, docx, xlsx, csv, txt

document-versions

no

{user_id}/{document_id}/v{n}

50 MB

same

letterheads

no

{user_id}/...

5 MB

image/*, pdf

voice-notes

no

{user_id}/...

25 MB

audio/*

exports

no

{user_id}/...

50 MB

*

Storage policies enforce (storage.foldername(name))[1] = auth.uid()::text for select/insert/update/delete on private buckets. avatars allows public read, owner-scoped writes.

3. Supabase Edge Functions (Deno)

Shared *shared/ modules: cors.ts, supabase-admin.ts, auth.ts (resolves caller from JWT, returns 401 otherwise), validate.ts (zod), rate-limit.ts (in-memory token bucket per user*id), logger.ts, brevo.ts, whisper.ts, activity.ts (insert helper).

Each function: JWT-required (unless noted), zod-validated body, typed JSON response { ok, data?, error? }, structured logs, ownership checks, rate-limited.

Function

Verify JWT

Notes

create-document

yes

Records metadata after client upload to documents bucket; creates v1 in document_versions

apply-signature

yes

Persists signature placement, creates new document_versions row pointing to merged file path (PDF merge via pdf-lib)

generate-letterhead

yes

Builds reusable letterhead PDF (pdf-lib), stores in letterheads bucket

convert-document

yes

PDF↔DOCX, XLSX→PDF, CSV→XLSX. Uses pure-JS libs runnable in Deno (xlsx, pdf-lib, docx); architecture documented for swap to external worker if needed

export-document

yes

Generates final file, writes to exports, returns signed URL

save-email-template

yes

Upsert template, validate merge tags

send-campaign

yes

Loads template + recipients, personalizes, calls Brevo SMTP API, writes campaign_recipients rows, updates campaign counters

brevo-webhook

no (HMAC)

Public endpoint for Brevo delivery/open/click events; verifies signature; updates campaign_recipients + counters

import-contacts

yes

CSV/XLSX parsing, dedupe by (user_id, email)

export-contacts

yes

CSV/XLSX/VCF

create-voice-note

yes

Records metadata after upload, enqueues transcription_jobs row

transcribe-audio

yes

Pulls job, calls OpenAI Whisper, writes transcript

activity-tracker

yes

Generic write-through for client-side events the DB triggers can't see (login, downloads)

All functions are POST JSON, return uniform error envelope, set CORS for * (Vercel-friendly), use Deno.env.get only (no Worker/Node-specific APIs).

4. Auth configuration

Email/password + email verification enabled.

Google OAuth: user must enable in Supabase dashboard (linked below).

Password reset flow: backend ready; UI is out of scope this phase.

Triggers: on_auth_user_created → handle_new_user.

5. Subscription architecture (no payments yet)

subscriptions row per user (free on signup).

usage_metrics updated by triggers + edge fns.

Plan limits stored in a subscription_plans reference table (free/professional/business with documents_per_month, campaigns_per_month, voice_minutes, signatures, contacts caps).

Stripe-ready: billing_events accepts stripe-shaped metadata; future stripe_customer_id/stripe_subscription_id columns reserved.

6. Secrets to add (after migration approved)

BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, OPENAI_API_KEY, BREVO_WEBHOOK_SECRET.

7. Verification

supabase--linter after migration; fix all findings.

Smoke-test each edge function via supabase--test_edge_functions (or invoke tool) with a seeded test user.

Confirm RLS: cross-user read attempts return 0 rows.

Confirm storage isolation per bucket.

Deliverable summary: schema map, function list with URLs, secrets list, security report.

Execution order

Run the single big migration (enums, tables, GRANTs, RLS, policies, functions, triggers, realtime).

Fix linter findings.

Create storage buckets + storage RLS policies.

Request missing secrets (Brevo, OpenAI).

Create all edge functions + shared modules.

Run verification + produce final report.

Out of scope this phase

Frontend pages, UI components, Stripe checkout, actual Brevo sender-domain DNS, production OAuth client creation (user action in Supabase dashboard).

## 0. Build error triage (do first, in build mode)

The async build failed during the rolldown SSR build. No source-level diff was attempted yet in this turn. Once switched to build mode I will:

1. Re-run `bun run build:dev` and capture the real error frames (the snippet above is only the tail).
2. Most likely cause given recent state: a stray `src/pages/` import, a missing route file referenced by a `<Link to=...>`, or a server-only import (`client.server`, `*.server.ts`) reachable from a client module. Fix by either removing the offending import, moving logic into a `*.functions.ts` handler with a dynamic `await import(...)`, or creating the missing route.
3. Confirm green build before any new migration runs.

No code changes happen until the user approves this plan.

## 1. Architectural shifts vs v1

- **Workspaces become the tenancy root.** Every domain row (documents, contacts, campaigns, voice notes, letterheads, signatures, templates, jobs, notifications) carries `workspace_id`. `user_id` stays as "created_by". This is what unlocks OfficeKonnect Pro teams later without a schema rewrite.
- **All long-running work becomes jobs.** `convert-document`, `send-campaign`, `transcribe-audio`, `export-document`, `generate-letterhead` no longer do work synchronously in the edge function. They enqueue a row in `jobs`, return `{ job_id }`, and a worker function processes the queue. Clients subscribe via Supabase Realtime on `jobs` filtered by `workspace_id`.
- **Pluggable providers.** Conversion, transcription, email, and push are wired through a `provider` column + adapter pattern so we can swap (e.g.) self-hosted convert → CloudConvert/Adobe API without schema changes.
- **Mobile/desktop ready.** `devices` table holds push tokens (FCM / APNs / Web Push / desktop), `user_integrations` holds per-user OAuth tokens for external services, and all auth uses Supabase JWT which mobile/desktop SDKs already support.

## 2. New tables (added to the v1 schema)

All include `id uuid pk`, `created_at`, `updated_at` (where mutable), GRANTs to `authenticated` + `service_role`, RLS enabled.

### `workspaces`

`name`, `slug unique`, `owner_id`, `plan` (enum, mirrors subscription plan), `settings jsonb`, `is_personal bool` (auto-created on signup), `avatar_url`.

### `workspace_members`

`workspace_id`, `user_id`, `role` (`owner`, `admin`, `member`, `viewer`), unique `(workspace_id, user_id)`. Drives all access. Replaces direct `user_id = auth.uid()` checks with `public.is_workspace_member(workspace_id, required_role)` security-definer helper.

### `plan_limits`

Reference table, one row per plan: `plan`, `max_members`, `max_documents`, `max_storage_mb`, `max_campaigns_per_month`, `max_contacts`, `max_voice_minutes_per_month`, `max_signatures`, `features jsonb` (feature flags: `e_signatures`, `bulk_email`, `transcription`, `letterheads`, `conversion`, `api_access`, `priority_support`). Seeded for free / professional / business.

### `jobs` (the queue)

`workspace_id`, `created_by`, `kind` enum (`document_convert`, `document_export`, `letterhead_generate`, `email_campaign_send`, `audio_transcribe`, `contact_import`, `contact_export`, `signature_apply`), `status` enum (`queued`, `running`, `succeeded`, `failed`, `canceled`), `priority int default 5`, `provider text`, `input jsonb`, `output jsonb`, `error jsonb`, `attempts int default 0`, `max_attempts int default 3`, `scheduled_for timestamptz default now()`, `started_at`, `finished_at`, `entity_type`, `entity_id` (nullable FK-by-convention back to documents / campaigns / voice_notes / letterheads). Indexes on `(status, scheduled_for)`, `(workspace_id, status)`, `(entity_type, entity_id)`. Added to `supabase_realtime` publication.

### `notifications`

`workspace_id`, `user_id` (nullable = workspace-wide), `kind` (`job_succeeded`, `job_failed`, `campaign_completed`, `transcription_ready`, `member_invited`, `quota_warning`, `document_shared`, `system`), `title`, `body`, `entity_type`, `entity_id`, `data jsonb`, `read_at`, `delivered_channels jsonb` (which of in-app/push/email actually went out). Added to realtime.

### `devices`

`user_id`, `workspace_id` (nullable; null = applies across all workspaces of that user), `platform` enum (`ios`, `android`, `web`, `macos`, `windows`, `linux`), `push_token text`, `push_provider` enum (`fcm`, `apns`, `web_push`, `expo`), `device_name`, `app_version`, `last_seen_at`, `is_active`. Unique on `(user_id, push_token)`.

### `document_metadata`

1:1 with `documents`, `document_id unique`. Holds extracted/derived data so the `documents` row stays lean and we can re-extract without schema churn: `page_count`, `word_count`, `language`, `ocr_text` (nullable for future OCR), `thumbnail_url`, `preview_urls jsonb` (per-page), `extracted_fields jsonb` (form fields, future smart-doc data), `checksum`, `mime_type`, `extracted_at`.

### `user_integrations`

Per-user external service connections (mobile/desktop will need these): `user_id`, `workspace_id` (nullable), `provider` enum (`google_drive`, `dropbox`, `onedrive`, `stripe`, `brevo`, `openai`, `cloudconvert`, `adobe_pdf`, `slack`, `microsoft_graph`), `account_email`, `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `scopes text[]`, `metadata jsonb`, `is_active`. Tokens encrypted via Supabase Vault (`vault.create_secret`); only `secret_id` stored. Unique `(user_id, provider, account_email)`.

## 3. Refactor existing tables for tenancy

All v1 tables get:

- `workspace_id uuid not null references workspaces(id) on delete cascade`
- existing `user_id` renamed in policies' intent to `created_by` (column name stays for compatibility)
- composite indexes `(workspace_id, created_at desc)` for list views
- RLS rewritten from `auth.uid() = user_id` → `public.is_workspace_member(workspace_id)`; mutations additionally check role via `public.has_workspace_role(workspace_id, 'member' | 'admin' | 'owner')`.

Personal workspace auto-creation: `handle_new_user()` trigger creates a workspace, inserts the user as `owner` in `workspace_members`, and sets `profiles.default_workspace_id`.

## 4. Job-driven refactor of edge functions

Each "do work" function splits into two endpoints:


| Public endpoint (JWT)                                                                                             | Worker endpoint                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert-document` → enqueues `document_convert` job                                                              | `jobs-worker` picks it up, dispatches to provider adapter (`local-pdf`, `cloudconvert`, `adobe`), writes `documents.current_file_url` + new `document_versions` row, sets job `succeeded`, emits notification |
| `export-document` → enqueues `document_export` job                                                                | worker generates final file into `exports` bucket, stores signed URL in `jobs.output`                                                                                                                         |
| `generate-letterhead` → enqueues `letterhead_generate` job                                                        | worker renders PDF with pdf-lib, stores in `letterheads` bucket, links back via `entity_id`                                                                                                                   |
| `send-campaign` → enqueues `email_campaign_send` job, expands recipients into `campaign_recipients` synchronously | worker batches Brevo sends (rate-limited), updates per-recipient delivery status, increments counters, emits notification on completion                                                                       |
| `transcribe-audio` → enqueues `audio_transcribe` job                                                              | worker calls provider (`openai_whisper` default; pluggable to `assemblyai`, `deepgram`), writes transcript to `voice_notes.transcript`, sets `transcription_jobs.status`                                      |


### Worker(s)

- `jobs-worker` edge function: claims up to N queued jobs with `UPDATE jobs SET status='running', started_at=now() ... RETURNING *` (atomic, SKIP LOCKED via SQL function `public.claim_jobs(p_kinds text[], p_limit int)`), dispatches to per-kind handler, retries on failure with exponential backoff up to `max_attempts`, then marks `failed` and emits a `job_failed` notification.
- Triggered by **pg_cron** every minute hitting `/api/public/hooks/jobs-tick` (TanStack server route, no UI dependency) which invokes `jobs-worker`. The TanStack route is host-agnostic — works on Vercel, Cloudflare, Node.
- Webhooks (Brevo delivery, future Stripe, future CloudConvert) update the related `jobs` / `campaign_recipients` row directly.

### Notification dispatcher

`notifications-dispatcher` edge function fires on `notifications` insert (via DB trigger → pg_net → function, or a small cron). It looks up `devices` and `user_integrations` per recipient and sends through:

- in-app (already there via realtime)
- push: FCM/APNs/Web Push (provider abstraction; adapter selected by `devices.push_provider`)
- email (Brevo) for digest/critical kinds

## 5. Mobile / desktop / Vercel readiness

- Auth: Supabase JWT (works for React Native, Expo, native iOS/Android via supabase-swift / supabase-kt, Tauri/Electron desktop). No platform-specific code in backend.
- Storage: signed URLs returned from edge functions so mobile clients with no cookie support work.
- Realtime: jobs + notifications + documents + campaigns are in `supabase_realtime` — same channel works for web/mobile/desktop.
- Vercel: frontend stays standard TanStack Start / Vite build; no Cloudflare Worker APIs used in TanStack server routes (only `request`, `Response`, `process.env`). Edge Functions are pure Deno, deployed to Supabase, callable from any host.
- Future CDN: only static assets + public bucket reads need CDN; can front `*.supabase.co/storage/v1/object/public/avatars/*` with Cloudflare later — no code change.

## 6. Security additions

- `is_workspace_member(ws, min_role)` and `has_workspace_role(ws, role)` security-definer helpers used by every policy.
- Role hierarchy enforced: owner > admin > member > viewer.
- `user_integrations` tokens stored in Supabase Vault; only the calling edge function can decrypt via service role.
- `devices.push_token` treated as sensitive — only the owning user can read, only service role can read all (for dispatcher).
- Plan-limit enforcement: BEFORE INSERT triggers on `documents`, `email_campaigns`, `voice_notes`, `contacts`, `workspace_members` consult `plan_limits` and `usage_metrics`; raise on overflow.

## 7. Execution order (build-mode)

1. Fix the failing build, confirm green.
2. Single migration: enums + workspaces, workspace_members, plan_limits (seeded), then v1 tables (with `workspace_id` from the start), then jobs, notifications, devices, document_metadata, user_integrations, helpers, triggers, RLS, GRANTs, realtime publication.
3. Storage buckets + storage RLS (workspace-folder convention: `{workspace_id}/{user_id}/...`).
4. Add secrets: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_WEBHOOK_SECRET`, `OPENAI_API_KEY`. Push provider keys (FCM server key / APNs key / VAPID) requested only when push goes live; backend is wired so adding them later "just works".
5. Edge functions: enqueue endpoints, `jobs-worker`, `notifications-dispatcher`, `brevo-webhook`, plus the v1 utility functions (`create-document`, `apply-signature`, `save-email-template`, `import-contacts`, `export-contacts`, `create-voice-note`, `activity-tracker`, `register-device`, `link-integration`).
6. TanStack public route `src/routes/api/public/hooks/jobs-tick.ts` + pg_cron schedule.
7. Linter + smoke tests (queue → run → succeed; cross-workspace isolation; plan-limit trigger).
8. Deliverable summary (schema map, function URLs, secrets, realtime channels, security report).

## 8. Explicitly out of scope this phase

UI, Stripe checkout, actually shipping push notifications (only the data plane + adapter interface), OCR implementation (column reserved), Google Drive/Dropbox sync logic (only `user_integrations` table + OAuth scaffolding).
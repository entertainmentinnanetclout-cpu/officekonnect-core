# OfficeKonnect Base V1 — Completion Plan

Backend foundation (24 tables, RLS, helpers, realtime, 7 storage buckets) is in place. This plan finishes the remaining backend wiring, verifies it end-to-end, then executes the production UI pass.

## Phase A — Finish Backend (server-side glue)

### A1. Secrets
Add via `add_secret` (after confirming with you):
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_WEBHOOK_SECRET`
- `OPENAI_API_KEY` (Whisper)
- `JOBS_TICK_SECRET` (generated, protects cron endpoint)

Already present: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`.

### A2. TanStack server functions (`src/lib/*.functions.ts`)
Thin enqueue wrappers — all use `requireSupabaseAuth`, write a row into `jobs`, return job id. Client subscribes to `jobs` via Realtime.

- `documents.functions.ts` — `createDocument`, `enqueueConvert`, `enqueueExport`, `deleteDocument`, `archiveDocument`, `restoreDocument`, `createSignedUploadUrl`, `getSignedDownloadUrl`
- `signatures.functions.ts` — `saveSignature`, `applySignatureToDocument` (enqueues job)
- `letterheads.functions.ts` — `saveLetterhead`, `enqueueGenerateLetterhead`
- `contacts.functions.ts` — `enqueueImportContacts`, `enqueueExportContacts`, group CRUD
- `templates.functions.ts` — email template CRUD
- `campaigns.functions.ts` — `createCampaign`, `enqueueSendCampaign`, `getCampaignStats`
- `voice.functions.ts` — `createVoiceNote`, `enqueueTranscribe`
- `notifications.functions.ts` — `markRead`, `markAllRead`
- `workspaces.functions.ts` — switch active workspace, invite member (admin+), update role, remove member
- `devices.functions.ts` — register/unregister push token
- `integrations.functions.ts` — Brevo connect/validate, list user_integrations

Plan-limit checks happen in BEFORE INSERT triggers (already deployed); server fns surface friendly errors.

### A3. Job worker dispatcher (`src/lib/jobs/*.server.ts`)
Per-kind handlers, dynamically imported inside the worker (server-only):
- `document_convert` — calls CloudConvert-style provider stub (provider column already there); writes output back to `documents` + `document_versions`.
- `document_export`, `letterhead_generate` — render via pdf-lib (Worker-safe).
- `audio_transcribe` — uploads to OpenAI Whisper, writes transcript to `voice_notes.transcript`.
- `email_campaign_send` — iterates `campaign_recipients`, calls Brevo via gateway, updates per-recipient status.
- `contacts_import` / `contacts_export` — CSV/XLSX/VCF parse via SheetJS (worker-safe build).

Each handler: success → `succeeded` + notification; failure → exponential backoff up to `max_attempts`, then `failed` + error notification.

### A4. Public routes (`src/routes/api/public/*`)
- `jobs-tick.ts` — POST, header `x-jobs-secret`, calls `claim_jobs` then dispatches up to 5 jobs. Invoked by pg_cron every minute.
- `brevo-webhook.ts` — POST, HMAC-verifies with `BREVO_WEBHOOK_SECRET`, updates `campaign_recipients` (delivered/opened/clicked/bounced/complained).

### A5. pg_cron schedule
Via `supabase--insert`: schedule `process-jobs-tick` every minute hitting the stable preview URL with `x-jobs-secret`.

### A6. Manual prerequisites you must do in Supabase dashboard
1. Auth → Providers: enable Email (auto-confirm off for prod) and Google OAuth (paste Client ID/Secret).
2. Auth → URL Config: set Site URL + redirect to the published Lovable URL.

## Phase B — Verify Backend

1. `supabase--linter` — fix any flagged issues from the migration.
2. `security--run_security_scan` — review RLS coverage on all 24 tables + storage policies.
3. `bun run build:dev` — green.
4. Smoke test via Playwright: signup → personal workspace auto-created → upload doc to `documents` bucket via signed URL → row appears → enqueue convert → worker claims → status flips to `succeeded` → notification realtime-pushed.
5. Confirm RLS isolation by signing in as second user and verifying zero cross-workspace reads.

## Phase C — Production UI Pass

Design system: Inter, deep blue primary (already in tokens), slate neutrals, cyan accent, semantic success/warning/error. Subtle shadows, 8pt spacing, Microsoft 365 / Linear / Stripe feel. Fully responsive. All tokens in `src/styles.css` — no hardcoded colors in components.

### C1. Shell & navigation
- Authenticated layout: collapsible sidebar (Dashboard, Documents, Mail, Contacts, Voice, Settings), top bar with workspace switcher, search, notifications bell (realtime unread badge), profile menu.
- Mobile: bottom tab bar + slide-over sidebar.

### C2. Public pages
Landing, Pricing (Free/Pro/Business from `plan_limits`), Contact, Terms, Privacy. SEO `head()` on each.

### C3. Auth pages
Polish existing login/register/forgot/reset/callback. Add Google button, email verification screen, session-expired toast.

### C4. Dashboard
KPI cards (docs, emails sent this month, contacts, voice notes), Quick Actions, Recent Documents / Campaigns / Voice Notes lists. All data via `useSuspenseQuery` against real tables.

### C5. Documents module
List view (search, filter by status/type, sort, pagination), upload dropzone (signed URL flow), grid/list toggle, archive/restore, version history drawer. Viewer page: PDF via `react-pdf`, DOCX via `mammoth` preview, XLSX/CSV via SheetJS table. Convert modal → enqueues job → realtime progress.

### C6. Signature module
Manager (draw via `react-signature-canvas`, type, upload), saved signatures grid, default toggle. Placement overlay on viewer: drag/resize/rotate/confirm; full-screen on mobile.

### C7. Letterhead builder
Logo upload, company fields, header/footer editor, live preview, save, apply-to-document.

### C8. Contacts
Table with search/filter/groups/bulk actions, import wizard (CSV/XLSX/VCF) → job, export → job, group manager.

### C9. Mail Center
Templates CRUD with merge-tag inserter and live preview. Campaign wizard: name → recipients (groups or filter) → template → review → send (enqueues). Campaign detail: realtime stats from `campaign_recipients`.

### C10. Brevo integration wizard (Settings → Integrations)
3-step: create account link → paste API key → test (validates via gateway, stores in `user_integrations` with Vault). Status pill (connected/error).

### C11. Voice Notes
Recorder (MediaRecorder, pause/resume/stop, waveform), list, playback, rename, delete, transcribe button → job → transcript viewer with copy/search/export.

### C12. Settings
Profile, Company, Security (password change, sessions), Integrations (Brevo, future Google Drive), Signatures, Billing (read from `subscriptions` + `plan_limits` + `usage_metrics`), Notifications prefs, Appearance (light/dark).

### C13. Notification center
Slide-over panel from bell icon, realtime-subscribed to `notifications`, mark read / mark all read.

## Phase D — QA & Deploy Readiness

- Responsive audit at 375 / 768 / 1280 / 1920.
- Empty / loading / error states on every list.
- a11y: keyboard nav, focus rings, ARIA labels.
- Lighthouse pass on landing + dashboard.
- Confirm Vercel-compatible (no Worker-only APIs in server fns).
- Final security scan; publish.

## Out of scope (V1)
- Stripe checkout flow (subscription rows exist, UI is read-only Billing).
- Actual native push delivery (devices table stores tokens; dispatcher stubbed).
- Document editing (preview only, per spec).
- Google Drive / Dropbox sync (`user_integrations` ready, no UI).

## Technical Details

- Server fns: `createServerFn` + `requireSupabaseAuth`; admin client dynamically imported inside handlers.
- Worker dispatch via `claim_jobs` SQL (atomic SKIP LOCKED) — already deployed.
- pg_cron hits `/api/public/jobs-tick` with shared secret header; route returns 401 otherwise.
- Brevo via Lovable connector gateway (`connector-gateway.lovable.dev/brevo`).
- Whisper via direct OpenAI API call from server-only worker file.
- Realtime channels filtered by `workspace_id` to limit fan-out.
- PDF rendering uses pdf-lib + react-pdf (both Worker-safe / browser-safe respectively).

## Execution order
A1 → A2/A3 in parallel batches → A4 → A5 → B (verify) → request your confirmation → C1–C13 → D.

Approving this plan starts Phase A.

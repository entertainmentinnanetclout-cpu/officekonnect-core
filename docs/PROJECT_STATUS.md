# OfficeKonnect Project Status

Last audited: 2026-08-18

## Current phase

Phases 6 and 7 are **fully implemented, live-backend reconciled and source validated**.

Next implementation phase: **Phase 8 — Notifications, Activity, Team, Workspace and Settings**.

## Upgrade branch policy

Draft PR #2 is the single long-running upgrade PR for Phases 0–11. All phase work is committed to `phase-0-canonical-reconciliation`. The PR remains Draft and must not merge to `main` until the Phase 11 release-candidate gate is complete.

Vercel/deployment-platform validation is intentionally deferred until Phase 11. Phases 6–10 are accepted on repository parity, live Supabase verification, lint, TypeScript, regression tests and production build.

## Source-of-truth policy

The live Supabase project is authoritative for deployed database behavior. GitHub carries applied migration history, deployed Edge Function source, generated database types and application integrations. Existing document, spreadsheet, workflow and signing engines are extended rather than replaced.

## Confirmed architecture

- Frontend: React 19, TanStack Start/Router/Query, TypeScript, Tailwind, Radix UI.
- Backend: Supabase Auth, Postgres, RLS, Storage, RPCs and Edge Functions.
- Private storage buckets include documents, document-versions, exports, letterheads, signatures and voice-notes.
- Canonical package manager: Bun 1.3.14 with committed `bun.lock` and frozen `bun ci` validation.
- Spreadsheet interoperability uses the locked `xlsx` dependency.
- Document/workbook exports and signing copies use deterministic server-side PDF renderers.

## Completed phases

### Phase 0 — Canonical reconciliation

- Restored 31/31 missing live migrations.
- Checked in deployed signing Edge Function source.
- Regenerated Supabase TypeScript types.
- Reconciled workspace-first Storage and signing contracts.
- Added environment hygiene, repository parity and Upgrade Validation.

### Phase 1 — Development identity and application shell

- Added server-only development-session bootstrap with a real Supabase identity.
- Preserved `auth.uid()`, workspace membership and RLS.
- Replaced V1 chrome with the responsive canonical OfficeKonnect shell and real workspace switching.

### Phase 2 — Documents, native editor and PDF

- Preserved `documents`, `document_versions` and private Storage as canonical.
- Completed native editing, autosave/version restore and deterministic PDF output.
- Added immutable PDF signing-copy generation.

### Phase 3 — OfficeKonnect Sheets

- Activated production Sheets library/editor.
- Preserved the canonical `kind: "workbook"`, `schemaVersion: 1` content model and one deterministic formula engine.
- Added XLSX/XLS/CSV interoperability, spreadsheet PDF/Print and signing-copy generation.

### Phase 4 — Files and Templates

- Activated Files with nested folders, Favourites, Shared with me, Archive/Trash, upload, move, duplicate and lifecycle actions.
- Added additive organization relations while keeping `documents` canonical.
- Activated reusable document/spreadsheet Templates over `document_templates`.
- Applied live Phase 4 organization and hierarchy-cycle migrations.

### Phase 5 — Workflows and Approvals

- Activated Workflows, immutable submitted-version review and Approvals work queue.
- Reused the existing server-authoritative workflow state machine/RPCs.
- Added versioned template revisions, decisions, comments, reassignment, cancellation, Request Changes and optimistic-concurrency resubmission.
- No replacement workflow engine or fake production workflow data.

### Phase 6 — Production E-Signatures

- Activated `/dashboard/signing`, `/dashboard/signing/$requestId/prepare` and `/dashboard/signing/$requestId`.
- Added full request dashboard/status buckets, PDF-only draft creation, internal/external participants, signer/approver/CC roles and parallel/sequential order.
- Added normalized drag/resize signature, initial, text and date fields with participant assignment and strict send-time validation.
- Sending locks participant/field hashes and the immutable source PDF through the existing hardened signing backend.
- Added authenticated internal signing with saved/drawn/typed signatures, explicit electronic-signing consent, sequential eligibility, decline, cancellation, invitation rotation, audit timeline, finalization retry, signed PDF and certificate access.
- Added public `/sign/$token` one-time raw-token exchange and `/sign/active` short-lived session workflow. Only the short-lived session token is retained in `sessionStorage` after exchange.
- Removed the obsolete admin-backed `signing-public.functions.ts` bypass.
- Native Documents and Sheets now use **Send for signature**: flush-save → deterministic immutable PDF signing copy → prefilled signing request → preparation workspace.
- Synchronized live `signing-finalize` to version 2 with `OfficeKonnect Signing Certificate`; JWT requirement and finalization state machine remain unchanged.
- Live RLS remains enabled across signing requests, participants, fields, events and certificates.
- No fake signing request/participant/field/certificate rows were inserted.

See `docs/PHASE6.md` for the full Phase 6 contract.

### Phase 7 — Tasks, Calendar and Global Search

- Applied live migrations `20260818062157_phase_7_tasks_calendar_search` and `20260818080155_phase_7_rpc_execute_acl_hardening`, and checked in their exact migration source.
- Added real workspace-scoped `tasks` persistence with status, priority, assignee, start/due/completion, object links, constraints/indexes and RLS.
- Activated `/dashboard/tasks` with board/list views, filters, search, assignment, priorities, dates, lifecycle actions and document/workflow/signing links.
- Added real `calendar_events` persistence for manual events with range constraints and RLS.
- Activated `/dashboard/calendar` as an aggregate operational calendar. Manual events are persisted; task dates, workflow run/step deadlines and signature expiries are derived read-only from their canonical source tables.
- Added membership-checked `search_workspace_objects` RPC; no duplicate search index/table was introduced.
- Revoked anonymous `EXECUTE` from `search_workspace_objects` and `list_workspace_member_directory`; authenticated application execution remains available and membership checked.
- Activated `/dashboard/search` and the Ctrl/Cmd+K global command search dialog over live workspace data.
- Search covers documents/Sheets, templates, workflows, e-signatures, tasks and workspace members.
- `tasks` and `calendar_events` both retain four RLS policies and contain zero fabricated production rows after completion.

See `docs/PHASE7.md` for the full Phase 7 contract.

## Phase 6/7 live backend state

### Signing Edge Functions

- `signing-actions` — ACTIVE, JWT required.
- `signing-external` — ACTIVE, JWT disabled intentionally because custom invitation/session authentication is enforced in-function.
- `signing-finalize` — ACTIVE version 2, JWT required.

### Phase 7 migrations

- `20260818062157_phase_7_tasks_calendar_search`
- `20260818080155_phase_7_rpc_execute_acl_hardening`

### RLS verification

- `tasks`: RLS enabled, 4 policies.
- `calendar_events`: RLS enabled, 4 policies.
- `signing_requests`: RLS enabled, 4 policies.
- `signing_participants`: RLS enabled, 2 policies.
- `signing_fields`: RLS enabled, 2 policies.
- `signing_events`: RLS enabled, 1 policy.
- `signing_certificates`: RLS enabled, 1 policy.

### RPC execution boundary

- `search_workspace_objects`: authenticated execution only; workspace membership checked in-function.
- `list_workspace_member_directory`: authenticated execution only; workspace membership checked in-function.
- Anonymous SECURITY DEFINER execution warnings for these RPCs are cleared.

## Phase 6/7 validation record

The combined Phase 6/7 implementation has passed the canonical read-only validation gate with:

- Repository parity: **PASS**.
- Frozen dependency install (`bun ci`): **PASS**.
- ESLint: **PASS — 0 errors**.
- TypeScript (`tsc --noEmit`): **PASS**.
- Bun regression tests: **33 passed / 0 failed**.
- Production build: **PASS**.

The final ACL-hardening/documentation head receives the same read-only gate and becomes the authoritative Phase 6/7 completion SHA.

## Known limitations carried forward

- Email/SMS delivery infrastructure for external invitation tokens remains dependent on the existing notification/job infrastructure; secure links can be rotated/copied from the sender workspace.
- Phase 10 will add deeper real-PDF automated end-to-end signing/security/performance coverage; it does not replace the Phase 6 signing system.
- Calendar does not duplicate workflow/signing/task source dates into `calendar_events` by design.
- Global search is live SQL/RPC search rather than a separate full-text/search-service index; performance optimization belongs to Phase 10 if scale requires it.
- Notifications, Activity, Team, Workspace and comprehensive Settings remain Phase 8.
- Product-wide dead-action/responsive/accessibility cleanup remains Phase 9.

## Non-negotiable release rule

Do not merge Draft PR #2 after an individual phase. Continue Phases 8–11 on the same branch/PR. Merge to `main` only when the complete Phase 11 upgrade passes release-candidate validation.

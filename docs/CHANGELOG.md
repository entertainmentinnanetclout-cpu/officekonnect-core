# OfficeKonnect Changelog

## 2026-08-18 — Phase 10 completed

### Security / CI

- Added permanent `scripts/check-security-boundaries.mjs` browser/server credential and token-boundary audit.
- Kept Phase 9 `scripts/check-product-hardening.mjs` as a permanent gate.
- Permanent Upgrade Validation is read-only and now gates parity, frozen install, lint, product audit, security audit, TypeScript, unit/integration tests, production build, asset budget and Chromium E2E.
- Removed all temporary/write-capable reconciliation workflows after use.

### Signing-PDF integration

- Extracted production field rendering into `supabase/functions/_shared/signing-pdf.ts`.
- Added deterministic real three-page PDF integration coverage for signature, text and date fields plus invalid geometry/page rejection.
- Production `signing-finalize` consumes the same tested renderer.
- Deployed `signing-finalize` **version 3 — ACTIVE, JWT required**.
- Preserved the existing finalization RPC state machine, hashes, private exports and generic `OfficeKonnect Signing Certificate`.

### Performance

- Applied live migration `20260818101750_phase_10_files_fk_covering_indexes`.
- Added covering indexes for Phase 4 composite foreign keys.
- Cleared Supabase's unindexed-foreign-key advisor category.
- Added production asset budgets: JS <= 640 KiB and CSS <= 150 KiB per asset.
- Did not remove low-traffic indexes merely because the advisor reports them unused.

### Browser E2E / route hardening

- Added Playwright configuration and Chromium E2E.
- Added real public `/privacy` and `/terms` routes after browser QA exposed missing routes already treated as public by the auth boundary.
- Updated landing title/metadata to current OfficeKonnect positioning.
- Synchronized TanStack generated route registry.
- Browser suite: **4/4 passing**.

### Validation

Validated source checkpoint `ddb2edf65ef07da6d4ae5bcaa2a6129966a46c3d` — Upgrade Validation `32129565222`:

- repository parity ✅
- frozen `bun ci` ✅
- ESLint ✅ — 0 errors
- product-hardening audit ✅
- security-boundary audit ✅
- TypeScript ✅
- **42/42 unit/integration tests** ✅
- production client/SSR/Nitro build ✅
- production asset budget ✅
- Playwright/Chromium installation ✅
- **4/4 Chromium E2E tests** ✅

Vercel/deployment-platform validation remains intentionally deferred until Phase 11.

## 2026-08-18 — Phase 9 completed

### Product-wide hardening

- Replaced fabricated dashboard trend/open-rate/transcription labels with real active-workspace metrics.
- Removed dead History and Quick Create controls.
- Routed recent Dashboard activity through the canonical Phase 8 aggregate.
- Removed internal PR/upgrade-programme wording from the production shell.
- Converted internal Settings, Workspace and Global Search navigation away from hard reloads.
- Removed stale V1/debug/implementation wording from user-facing surfaces.
- Added accessible labels to icon-only shell controls and explicit Settings button semantics.
- Added permanent `scripts/check-product-hardening.mjs` release gate.

Validated Phase 9 code checkpoint `42c4dbd3e4c66f0570ec19c5ad6246bc39e3bb64` — Upgrade Validation `32125480383`.

## 2026-08-18 — Phase 8 completed

- Added receipt-aware Notifications while keeping `notifications` canonical.
- Added cross-module Activity over existing audit/workflow/signing ledgers.
- Added secure hash-only expiring workspace invitations and controlled role/member administration.
- Activated Workspace administration and comprehensive real Settings.
- Hardened workspace audit tenant scope.
- Applied Phase 8 migrations:
  - `20260818082337_phase_8_notifications_team_workspace_activity`
  - `20260818082454_phase_8_workspace_invitation_directory`
  - `20260818084738_phase_8_activity_workspace_identity_hardening`
- No duplicate identity/role/notification/activity engine and no fake Phase 8 production rows.

Final Phase 8 baseline `ca6802edcd11533276c6df597b004dfcbade2615` — Upgrade Validation `32119440424`.

## 2026-08-18 — Phases 6 and 7 completed

### Phase 6 — Production E-Signatures

- Activated signing dashboard, PDF preparation, authenticated internal signing and external short-lived-session signing.
- Added participant roles/order, normalized fields, consent, cancellation, invitation rotation, finalization retry, audit timeline, final PDF and certificate access.
- Native Documents and Sheets use immutable PDF signing copies.
- Removed obsolete privileged `signing-public.functions.ts`.

### Phase 7 — Tasks, Calendar and Global Search

- Applied `20260818062157_phase_7_tasks_calendar_search` and `20260818080155_phase_7_rpc_execute_acl_hardening`.
- Added RLS-protected Tasks/manual Calendar persistence.
- Activated aggregate Calendar using derived task/workflow/signing dates.
- Added membership-checked Global Search and Ctrl/Cmd+K command search.

Final Phase 6/7 validation passed parity, frozen install, ESLint, TypeScript, **33 tests / 0 failures**, and production build.

## 2026-08-18 — Phase 5 completed

- Activated production Workflows, immutable review, Approvals work queue, template builder, decisions, comments, reassignment, cancellation, Request Changes and optimistic-concurrency resubmission.
- Reused the recovered server-authoritative workflow backend; no replacement workflow engine or fake production data.
- Clean validation passed with **24 tests / 0 failures**.

## 2026-08-18 — Phase 4 completed

- Activated Files and Templates over canonical `documents`, private Storage and `document_templates`.
- Added nested folders, favourites, workspace-internal shares, upload/move/duplicate/lifecycle operations and hierarchy-cycle protection.
- Applied live Phase 4 organization migrations.
- Clean validation passed with **19 tests / 0 failures**.

## 2026-08-18 — Phase 3 completed

- Activated production OfficeKonnect Sheets over the canonical workbook JSON model.
- Added deterministic formulas, multi-sheet editing, XLSX/XLS/CSV interoperability, PDF/Print and signing-copy integration.

## 2026-08-17 — Upgrade workstream started

- Created the canonical long-running upgrade branch/PR and architecture/status/roadmap/handoff documentation.
- Reconciled missing migrations, signing Edge Function source, generated types, Storage path contracts and hardened signing helpers.

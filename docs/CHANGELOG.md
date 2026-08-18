# OfficeKonnect Changelog

## 2026-08-18 — Phase 11 release candidate completed

### Release governance

- Removed obsolete write-capable `.github/workflows/phase0-record-validation.yml`.
- Added permanent `scripts/check-release-candidate.mjs` and wired `audit:release` into Upgrade Validation.
- Permanent GitHub Actions now contains one PR-driven workflow only, with `contents: read`.

### Release contract QA

- Added `tests/phase11.release-candidate.test.ts`.
- Locked canonical review → changes requested → resubmit → approve state semantics.
- Locked the immutable PDF signing-copy → signing actions/external session → single finalizer chain.
- Locked route-registry coverage for all canonical dashboard/legal release surfaces.
- Expanded unit/integration suite to **45/45 passing tests**.

### Live backend / deployment verification

- Confirmed 51 public application tables and 51/51 RLS coverage.
- Confirmed 48 live migrations; latest `20260818101750`.
- Confirmed all nine release-critical workflow/signing RPCs are live.
- Confirmed `signing-actions`, `signing-external`, and `signing-finalize` ACTIVE; finalizer remains version 3 with JWT required.
- Re-reviewed Supabase security/performance advisor residuals without weakening RLS or deleting low-traffic indexes merely to reduce warnings.
- Vercel reports success for the technical release-candidate head.

### Technical release-candidate validation

`1b7ee8bc4536eab418c7114df38f4e1e7775c76f` — Upgrade Validation `32153427170`:

- repository parity ✅
- frozen `bun ci` ✅
- ESLint ✅ — 0 errors, 7 inherited warnings
- Phase 9 product-hardening audit ✅
- Phase 10 security-boundary audit ✅
- Phase 11 release-candidate audit ✅
- TypeScript ✅
- **45/45 unit/integration tests** ✅
- production client/SSR/Nitro build ✅
- production asset budget ✅
- pinned Playwright runner + GitHub runner Chrome ✅
- **4/4 browser E2E tests** ✅
- Vercel ✅

Final documentation-head validation is recorded in Draft PR #2 so the documentation does not require a self-referential commit SHA.

## 2026-08-18 — Phase 10 completed

### Security / CI

- Added permanent `scripts/check-security-boundaries.mjs` browser/server credential and token-boundary audit.
- Kept Phase 9 `scripts/check-product-hardening.mjs` as a permanent gate.
- Permanent Upgrade Validation gates parity, frozen install, lint, product/security audits, TypeScript, unit/integration tests, production build, asset budget and browser E2E.

### Signing-PDF integration

- Extracted production field rendering into `supabase/functions/_shared/signing-pdf.ts`.
- Added deterministic real three-page PDF integration coverage.
- Deployed `signing-finalize` version 3 — ACTIVE, JWT required.

### Performance / browser QA

- Applied live migration `20260818101750_phase_10_files_fk_covering_indexes`.
- Added per-client-asset budgets: JS <= 640 KiB and CSS <= 150 KiB.
- Added Playwright browser QA plus real `/privacy` and `/terms` routes.
- Later Phase 10 closure boundary `074e6e95d01d1cc3dd0e6dec15f1a99dc78d31ed` passed Upgrade Validation `32152036895` and Vercel.

## 2026-08-18 — Phase 9 completed

- Replaced fabricated dashboard trends/open-rate/transcription labels with real active-workspace metrics.
- Removed dead History and Quick Create controls.
- Routed recent Dashboard activity through the canonical Phase 8 aggregate.
- Removed internal PR/upgrade/V1/debug wording from production surfaces.
- Hardened internal navigation/accessibility.
- Added permanent `scripts/check-product-hardening.mjs`.

Validated checkpoint `42c4dbd3e4c66f0570ec19c5ad6246bc39e3bb64` — Upgrade Validation `32125480383`.

## 2026-08-18 — Phase 8 completed

- Added receipt-aware Notifications while keeping `notifications` canonical.
- Added cross-module Activity over existing audit/workflow/signing ledgers.
- Added secure hash-only expiring workspace invitations and controlled role/member administration.
- Activated Workspace administration and comprehensive real Settings.
- Applied Phase 8 migrations and retained one identity/role/notification/activity architecture.

Final baseline `ca6802edcd11533276c6df597b004dfcbade2615` — Upgrade Validation `32119440424`.

## 2026-08-18 — Phases 6 and 7 completed

- Phase 6 activated production E-Signatures, internal/external secure signing, immutable PDF signing copies, final PDF/certificate access and removed obsolete privileged signing code.
- Phase 7 added RLS-protected Tasks/manual Calendar persistence, aggregate operational Calendar and membership-checked Global Search.

## 2026-08-18 — Phase 5 completed

- Activated production Workflows, immutable review, Approvals, decisions/comments/reassignment/cancellation, Request Changes and optimistic-concurrency resubmission over the recovered state machine.

## 2026-08-18 — Phase 4 completed

- Activated Files/Templates over canonical `documents`, private Storage and `document_templates`; added nested folders, favourites, shares and lifecycle operations.

## 2026-08-18 — Phase 3 completed

- Activated production OfficeKonnect Sheets over canonical workbook JSON, deterministic formulas, XLSX/CSV interoperability, PDF/Print and signing-copy integration.

## 2026-08-17 — Upgrade workstream started

- Created the long-running upgrade branch/PR and architecture/status/roadmap/handoff documentation.
- Reconciled missing migrations, signing Edge Function source, generated types, Storage paths and hardened signing helpers.

# OfficeKonnect Project Status

Last audited: 2026-08-18

## Current phase

Phase 3 — OfficeKonnect Sheets: **source implementation and validation complete**.

Next implementation phase: Phase 4 — Files and Templates.

## Upgrade branch policy

Draft PR #2 is the single long-running upgrade PR for Phases 0–11. All phase work is committed to `phase-0-canonical-reconciliation`. The PR must remain draft and must not merge to `main` until the Phase 11 release-candidate gate is complete.

## Source of truth policy

The live Supabase project was treated as the authoritative description of already-deployed database behavior during Phase 0. GitHub has now been brought forward to represent that behavior without destructive production changes. GitHub migrations and checked-in Edge Function source are the reproducible source of truth for future changes.

## Confirmed architecture

- Frontend: React 19, TanStack Start/Router/Query, TypeScript, Tailwind, Radix UI.
- Backend: Supabase Auth, Postgres, RLS, Storage, RPCs and Edge Functions.
- Public application tables: 43; RLS enabled on all 43 at Phase 0 audit time.
- Private storage buckets include documents, document-versions, exports, letterheads, signatures and voice-notes.
- Existing backend foundations: native documents, structured versions, spreadsheets, workflows/review/approval, secure e-signing, notifications, activity logs and workspace membership.
- Canonical package manager: Bun 1.3.14 with committed `bun.lock` and frozen `bun ci` validation.
- Spreadsheet office-file interoperability: locked `xlsx` dependency.

## Phase 0 reconciliation result

1. GitHub migration history was behind the live database. **Resolved: 31/31 missing live migrations recovered.**
2. Deployed signing Edge Functions were absent from source control. **Resolved: all three are checked in.**
3. Generated Supabase TypeScript types were stale. **Resolved in source with live-generated types.**
4. Storage path conventions had drifted. **Documents, saved signatures and Voice Notes are confirmed workspace-first.**
5. The frontend signing helper predated the hardened signing state machine. **Resolved: draft creation plus controlled lifecycle actions.**
6. Signing certificate source contained stale CCSF branding. **Checked-in finalizer source now uses OfficeKonnect-only branding; production deployment remains deferred.**
7. `.env` was tracked. **Resolved: removed from version control, `.env.example` added.**
8. Repository parity/validation gates were absent. **Resolved with repository parity and the canonical Upgrade Validation workflow.**
9. The invalid secondary npm lock path was removed. **Resolved: Bun 1.3.14 + `bun.lock` are canonical and `bun ci` is green.**
10. Supabase advisor findings were documented without weakening intentional signing-token isolation.

## Phase 1 result

- Added server-only development identity bootstrap using a real Supabase sign-in.
- Development bootstrap cannot run on Vercel production deployments.
- Browser code never receives development email/password credentials.
- Existing Supabase JWT identity, `auth.uid()`, workspace membership and RLS remain authoritative.
- Replaced the V1 dashboard chrome with the canonical OfficeKonnect shell.
- Reframed existing auth routes in the canonical OfficeKonnect visual/identity system without changing auth semantics.
- Added authenticated workspace discovery and workspace switching through `profiles.default_workspace_id`.
- Added grouped canonical navigation for Workspace, Operations, Communication and Administration.
- Added responsive mobile drawer and bottom navigation.
- Added a production-safe unauthenticated workspace state and secure sign-in path.
- Repaired historical ESLint blockers without weakening lint rules.

## Phase 2 result

- Preserved the existing `documents` + `document_versions` + private Storage architecture rather than creating a competing document model.
- Kept the real document library and its native creation, signed uploads, drag-and-drop, search/filter/sort, table/grid, rename, duplicate, archive, Trash/restore, native PDF export and uploaded-file download flows.
- Hardened the native structured-document contract with persisted indentation and stable block identity.
- Prevented ordinary autosave refreshes from unnecessarily replacing editor `innerHTML` and disturbing the active cursor/selection.
- Added a mandatory save barrier before PDF export, print preparation and static signing-copy generation.
- Upgraded the server-side native `pdf-lib` renderer for page setup, multi-page layout, rich inline formatting, tables, letterheads/logos, headers/footers and page numbers.
- Added an immutable native-document PDF signing-copy bridge using the existing document/version/storage model.
- Added real Bun regression tests for native-document normalization and actual `pdf-lib` output.
- No new Phase 2 database table or migration was required.

## Phase 3 result

- Activated **OfficeKonnect Sheets** as a real desktop/mobile navigation destination at `/dashboard/sheets`.
- Added a dedicated workspace-scoped Sheets library with blank creation, search, sorting, archive, Trash/restore, duplicate and XLSX/XLS/CSV import.
- Replaced the old spreadsheet placeholder with the production editor on both the canonical Sheets detail route and the shared document detail route.
- Centralized the canonical `kind: "workbook"`, `schemaVersion: 1` workbook model in one spreadsheet module; legacy two-dimensional sheet data is normalized into that model instead of preserved as a second persistence format.
- Added sparse A1-addressed cells, multi-sheet add/delete/rename/reorder, row/column sizing, persisted frozen panes, merges, formatting, selection, clipboard paste/copy, fill, sorting and active-column filtering.
- Added a deterministic formula parser/evaluator without JavaScript `eval`, including ranges, cross-sheet references, arithmetic/comparison and the focused office-function set documented in `docs/PHASE3.md`.
- Preserved `save_structured_document` and `restore_structured_document_version` as the authoritative save/restore RPCs; server functions recompute workbook metrics before save.
- Added whole-workbook XLSX export and active-sheet CSV export through the locked `xlsx` dependency.
- Added server-side spreadsheet PDF/Print with worksheet selection, print area, orientation, scale, fit-to-width, margins, repeated top rows, gridlines and deterministic metadata.
- Added a spreadsheet static signing-copy bridge that writes `<Original> — Signing Copy` into the existing private PDF document/version architecture after a mandatory save barrier.
- Added real Bun regression coverage for workbook normalization, formulas, cross-sheet calculation, cycle detection, editing helpers and actual `pdf-lib` spreadsheet output.
- Regenerated and checked in the TanStack route tree so the new Sheets routes are first-class typed routes.
- No new Phase 3 database migration was required during completion because the live/reconciled Phase 3 migrations already contain the workbook constraints, ACL hardening, metadata and structured-save/restore RPC contract.

## Latest validated Phase 3 source checkpoint

Upgrade Validation run `32101707386` completed successfully on the clean Phase 3 source after compiler/route-tree reconciliation:

- Repository parity: **PASS**.
- Deterministic dependency install (`bun ci`): **PASS**.
- ESLint: **PASS**.
- TypeScript (`tsc --noEmit`): **PASS**.
- Bun regression tests: **PASS**.
- Production build: **PASS**.

The final documentation/cleanup head is revalidated after this record is committed and becomes the authoritative Phase 3 completion SHA.

## Known Phase 3 limitations carried forward

- The formula engine intentionally implements a focused office-function set rather than claiming full Excel parity.
- Macros, pivot tables, charts, external workbook links and advanced Excel-only constructs are not native OfficeKonnect workbook features in Phase 3.
- XLSX round-trip prioritizes values, formulas and core worksheet geometry rather than pixel-perfect preservation of every Excel-specific style/feature.
- Spreadsheet PDF currently follows the existing PDF Standard Font/WinAnsi-safe fallback strategy.
- Folders, favourites, controlled sharing and richer document/spreadsheet templates remain Phase 4.
- Full workflow/approval submission remains Phase 5.
- Full production signing request preparation, participants, fields, external sessions, finalization, audit and certificates remain Phase 6.

## Non-negotiable release rule

Do not merge Draft PR #2 after an individual phase. Continue Phases 4–11 on the same branch/PR. Merge to `main` only when the complete Phase 11 upgrade passes release-candidate validation.

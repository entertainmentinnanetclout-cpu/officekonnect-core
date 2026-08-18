# OfficeKonnect Project Status

Last audited: 2026-08-18

## Current phase

Phase 4 — Files and Templates: **source implementation, live backend reconciliation and validation complete**.

Next implementation phase: **Phase 5 — Workflows and Approvals**.

## Upgrade branch policy

Draft PR #2 is the single long-running upgrade PR for Phases 0–11. All phase work is committed to `phase-0-canonical-reconciliation`. The PR must remain draft and must not merge to `main` until the Phase 11 release-candidate gate is complete.

## Source of truth policy

The live Supabase project is authoritative for deployed database behavior. GitHub must carry the exact applied migration history, generated types and application integrations. Phase 4 therefore applied the required additive schema first, recorded the exact live migration versions in GitHub, and built the frontend/server functions against those contracts.

## Confirmed architecture

- Frontend: React 19, TanStack Start/Router/Query, TypeScript, Tailwind, Radix UI.
- Backend: Supabase Auth, Postgres, RLS, Storage, RPCs and Edge Functions.
- Private storage buckets include documents, document-versions, exports, letterheads, signatures and voice-notes.
- Existing foundations remain canonical: documents, versions, native editor, Sheets, workflows/review/approval, secure e-signing, notifications, activity and workspace membership.
- Canonical package manager: Bun 1.3.14 with committed `bun.lock` and frozen `bun ci` validation.
- Spreadsheet office-file interoperability: locked `xlsx` dependency.

## Phase 0 result

- Recovered 31/31 missing live migrations into GitHub.
- Checked in deployed signing Edge Function source.
- Regenerated live Supabase TypeScript types.
- Reconciled workspace-first Storage and hardened signing contracts.
- Removed tracked `.env`; added a safe environment contract.
- Added permanent parity and Upgrade Validation gates.

## Phase 1 result

- Added server-only development-session bootstrap using a real Supabase identity without exposing credentials to browser code.
- Preserved `auth.uid()`, workspace membership and RLS.
- Replaced the V1 chrome with the canonical responsive OfficeKonnect workspace shell and real workspace switching.

## Phase 2 result

- Preserved `documents`, `document_versions` and private Storage as the only native/uploaded document architecture.
- Completed the native structured-document editor, autosave/version lifecycle and deterministic server-side PDF output.
- Added static PDF signing-copy generation over the existing document/version architecture.

## Phase 3 result

- Activated `/dashboard/sheets` and the production OfficeKonnect Sheets editor.
- Preserved `documents.content` with `kind: "workbook"`, `schemaVersion: 1` and one deterministic formula/calculation engine.
- Added XLSX/XLS/CSV interoperability, spreadsheet PDF/Print and static signing-copy generation.
- Added real workbook/formula/PDF regression coverage.

## Phase 4 result

### Files

- Activated `/dashboard/files` as a real workspace for native documents, spreadsheets and uploaded files.
- Added nested folders, breadcrumbs, real upload/drag-drop, search/sort, Favourites, Shared with me, Archive, Trash/restore, rename, move, duplicate and download/export.
- Added `workspace_folders`, `document_folder_items`, `document_favorites` and `document_shares` as additive organization relations; `documents` remains the canonical file record.
- Folder moves do not relocate private Storage binaries. Uploaded-file duplication copies the actual private object to a fresh document-owned path and creates a fresh document plus version 1.
- Added a PostgreSQL folder-cycle guard so self-parenting/descendant cycles cannot bypass the UI.
- Explicit shares are restricted to existing members of the same workspace and `view` permission. Because existing document SELECT visibility is workspace-wide, Phase 4 uses these records for the explicit **Shared with me** surface rather than pretending to replace the existing workspace privacy boundary.
- Added `list_workspace_member_directory` for the controlled share picker with membership enforcement and a restricted security-definer search path.

### Templates

- Activated `/dashboard/templates` over the existing `document_templates` table; no competing template model was created.
- Added the canonical categories: General, Letters, Reports, Meeting Notes, Agreements, Forms, Policies, Proposals, Internal Memos and Spreadsheets.
- Added real preview, save-from-existing, create-from-template, duplicate, metadata editing, archive and restore.
- New documents created from a template remain normal `documents` rows and record `template_id`.
- Existing Mail Center email templates remain separate and untouched.
- No fabricated/sample document templates are inserted into production.

### Phase 4 migrations

- `20260818051912_phase_4_files_templates_workspace_organization`
- `20260818052526_phase_4_folder_hierarchy_cycle_guard`

Both are applied to the live Supabase project and checked into the repository with their live version numbers.

### Live security verification

RLS is enabled on every new Phase 4 organization relation:

- `workspace_folders`: 4 policies
- `document_folder_items`: 2 policies
- `document_favorites`: 3 policies
- `document_shares`: 3 policies

`list_workspace_member_directory` is present as a security-definer function with membership enforcement.

## Latest validated Phase 4 source checkpoint

Clean source checkpoint `0ac628ccd536538199c159cedb92f50ece13410e` passed Upgrade Validation run `32103495621`:

- Repository parity: **PASS**.
- Deterministic dependency install (`bun ci`): **PASS**.
- ESLint: **PASS — 0 errors** (7 pre-existing Fast Refresh warnings remain non-blocking).
- TypeScript (`tsc --noEmit`): **PASS**.
- Bun regression tests: **19 passed / 0 failed**, 66 expectations across 5 files.
- Production build: **PASS**.

The final documentation head is revalidated after these records are committed and becomes the authoritative Phase 4 completion SHA.

## Known Phase 4 limitations carried forward

- Explicit sharing is workspace-internal and view-only; external/public-link sharing is not introduced in Phase 4.
- Existing workspace-wide document read visibility remains unchanged; explicit shares are an organizational/intent marker, not a replacement ACL model.
- Folder moves deliberately keep Storage object paths stable.
- Template previews are structured summaries rather than image-rendered thumbnails.
- The production build still reports non-blocking large-chunk optimization warnings; bundle optimization remains a later performance-hardening task.
- Full workflow/approval UX remains Phase 5.
- Full production signing request preparation, participants, fields, external sessions, finalization, audit and certificates remain Phase 6.

## Non-negotiable release rule

Do not merge Draft PR #2 after an individual phase. Continue Phases 5–11 on the same branch/PR. Merge to `main` only when the complete Phase 11 upgrade passes release-candidate validation.

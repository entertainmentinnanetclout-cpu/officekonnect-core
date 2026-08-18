# OfficeKonnect Changelog

## 2026-08-18 — Phase 4 completed

### Added

- Production `/dashboard/files` workspace for native documents, sheets and uploaded files.
- Nested workspace folders and breadcrumbs over existing document identities.
- Personal Favourites and a real **Shared with me** surface.
- Workspace-internal, view-only explicit share records and a membership-checked directory RPC.
- Safe uploaded-file duplication that copies the actual private Storage object to a new document-owned path and creates version 1.
- Production `/dashboard/templates` workspace over the existing `document_templates` table.
- Generic template categories: General, Letters, Reports, Meeting Notes, Agreements, Forms, Policies, Proposals, Internal Memos and Spreadsheets.
- Template preview, save-from-existing, create-from-template, duplicate, metadata editing, archive and restore.
- Four template contract/summary regression tests.
- Live migrations `20260818051912_phase_4_files_templates_workspace_organization` and `20260818052526_phase_4_folder_hierarchy_cycle_guard`.

### Changed

- Files and Templates are active canonical navigation destinations instead of Phase 4 placeholders.
- Normal workspace members may create templates they own; template owners and admins may manage them under RLS.
- Folder moves change relational organization only and deliberately keep existing private Storage paths stable.
- Folder hierarchy is protected against self-parenting and descendant cycles in PostgreSQL.

### Security / architecture

- `documents`, `document_versions`, private Storage and `document_templates` remain canonical; no replacement file/template persistence system was introduced.
- All four new organization tables have live RLS enabled.
- Explicit sharing is restricted to existing workspace members and `view` permission.
- Existing workspace-wide document read visibility is unchanged; explicit shares are an organizational marker, not a falsely advertised privacy boundary.
- No service-role secret was exposed to the browser and no existing RLS policy was weakened.

### Validation

- Clean source validation: repository parity, frozen install, ESLint, TypeScript, **19 tests passed / 0 failed**, and production build all pass.

## 2026-08-18 — Phase 3 completed

### Added

- Production **OfficeKonnect Sheets** library and editor routes.
- Canonical sparse workbook application model over the existing `kind: "workbook"`, `schemaVersion: 1` Supabase contract.
- Deterministic formula parser/evaluator with A1/range/cross-sheet references, cycle detection and a focused office-function set.
- Multi-sheet add/delete/rename/reorder, cell/range selection, formula bar, clipboard paste/copy, fill, formatting, merges, sorting, filtering, frozen panes and persisted row/column sizing.
- Locked XLSX interoperability dependency with XLSX/XLS/CSV import, workbook XLSX export and active-sheet CSV export.
- Server-side spreadsheet PDF renderer with worksheet selection, print area, orientation, scaling, margins, repeated top rows, gridlines and deterministic metadata.
- Spreadsheet static PDF signing-copy bridge over the existing private `documents` + `document_versions` architecture.
- Real Bun regression tests covering workbook normalization, formulas, cross-sheet calculation, cycles, editing helpers and actual spreadsheet PDF output.
- Typed TanStack routes for `/dashboard/sheets` and `/dashboard/sheets/$documentId`.

### Changed

- Sheets is now an active desktop/mobile OfficeKonnect navigation destination instead of a future-phase placeholder.
- Spreadsheet records opened through the shared document route now use the production spreadsheet editor rather than the former Phase 3 placeholder.
- PDF/Print, XLSX/CSV export and signing-copy operations use a workbook save barrier before generating immutable/output artifacts.
- Spreadsheet metrics remain synchronized through the existing `save_structured_document` RPC rather than client-only counters.

### Security / architecture

- No new spreadsheet database table was introduced.
- No RLS, workspace membership or `auth.uid()` contract was weakened.
- No service-role secret was added to browser code.
- No new Phase 3 migration was required during completion because the reconciled live migration history already contained the workbook constraints, ACL hardening and save/restore RPCs.

## 2026-08-17 — Phase 0 started

### Added

- Dedicated `phase-0-canonical-reconciliation` workstream.
- Canonical project status, architecture, roadmap and handoff documentation.

### Audit findings recorded

- Live Supabase had 31 named migrations not yet present in GitHub.
- Deployed signing Edge Functions were absent from repository source.
- Generated Supabase TypeScript types were stale.
- An older storage upload helper conflicted with live workspace-first Storage RLS.
- The frontend signing helper predated the hardened signing RPC/Edge Function state machine.
- Signing certificate finalizer contained stale CCSF branding.

### Production changes

None. Phase 0 began as a repository reconciliation exercise; production data/schema was not reset or destructively altered.

# OfficeKonnect Changelog

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

- Live Supabase has 31 named migrations not yet present in GitHub.
- Deployed signing Edge Functions are absent from repository source.
- Generated Supabase TypeScript types are stale.
- An older storage upload helper conflicts with live workspace-first Storage RLS.
- The current frontend signing helper predates the hardened signing RPC/Edge Function state machine.
- Signing certificate finalizer contains stale CCSF branding.

### Production changes

None. Phase 0 began as a repository reconciliation exercise; production data/schema was not reset or destructively altered.

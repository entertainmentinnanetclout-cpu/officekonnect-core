# OfficeKonnect Changelog

## 2026-08-18 — Phases 6 and 7 completed

### Phase 6 — Production E-Signatures

#### Added

- Production `/dashboard/signing` request dashboard and status filtering.
- Production `/dashboard/signing/$requestId/prepare` three-column PDF preparation workspace.
- Production `/dashboard/signing/$requestId` authenticated request/signing/audit workspace.
- Public `/sign/$token` one-time invitation exchange and `/sign/active` short-lived external signing session.
- Internal signer support for saved, drawn and typed signatures, consent, text/date fields and sequential eligibility.
- External signature-image upload/completion/decline through the hardened `signing-external` session gateway.
- Participant configuration for workspace/external identities, signer/approver/CC roles and parallel/sequential order.
- Normalized drag/resize signature, initial, text and date fields.
- Sender invitation rotation, cancellation, finalization retry, completed PDF and certificate access.
- Signing-event timeline with event hashes.
- Five Phase 6 signing-contract regression tests.

#### Changed

- Native Documents and Sheets now use **Send for signature**: flush-save → deterministic PDF signing copy → prefilled signing request → preparation workspace.
- `signing-finalize` live deployment advanced to version 2 with generic `OfficeKonnect Signing Certificate` branding while preserving JWT enforcement and the existing finalization state machine.
- The legacy send dialog now creates a standards-compliant signing draft and routes to preparation.

#### Removed

- Obsolete `signing-public.functions.ts`, which used privileged direct access and the pre-hardened signing model.

#### Security / architecture

- Existing signing tables/RPCs/Edge Functions remain canonical; no second signing engine was created.
- Raw external invitation tokens are exchange-only; only short-lived session tokens remain in `sessionStorage` after exchange.
- Internal signing completes through authenticated RPC/Edge Function paths.
- RLS remains enabled on requests, participants, fields, events and certificates.
- No fake signing transactions were inserted into production.

### Phase 7 — Tasks, Calendar and Global Search

#### Added

- Live migrations `20260818062157_phase_7_tasks_calendar_search` and `20260818080155_phase_7_rpc_execute_acl_hardening`.
- RLS-protected `tasks` persistence with assignment, status, priority, start/due/completion dates and operational object links.
- Production `/dashboard/tasks` board/list views, filters, search, CRUD, assignment and lifecycle controls.
- RLS-protected `calendar_events` persistence for manual office events.
- Production `/dashboard/calendar` month/agenda UI combining manual events with derived task/workflow/signing operational dates.
- Membership-checked `search_workspace_objects` RPC.
- Production `/dashboard/search` route.
- Ctrl/Cmd+K global workspace command-search dialog.
- Phase 7 migration/security/search contract regression coverage.

#### Security / architecture

- `tasks` and `calendar_events` each retain four live RLS policies.
- Operational task/workflow/signing dates are derived in Calendar rather than copied into `calendar_events`.
- Global Search uses live workspace data and membership checking; no duplicate search-copy index/table was introduced.
- Anonymous `EXECUTE` is revoked from `search_workspace_objects` and `list_workspace_member_directory`; authenticated application execution remains membership checked.
- Supabase's anonymous SECURITY DEFINER advisor warnings for those RPCs are cleared.
- No fake tasks or calendar events were inserted into production.

### Validation

Final Phase 6/7 documentation/security head `5637663003808ae6f86aecf253cbecf9fa519d9f` passed Upgrade Validation run `32114708453`:

- Repository parity ✅
- Frozen `bun ci` ✅
- ESLint ✅ — 0 errors
- TypeScript ✅
- **33 tests / 0 failures** ✅
- Production build ✅

Deployment-platform/Vercel validation remains intentionally deferred until Phase 11.

## 2026-08-18 — Phase 5 completed

### Added

- Production `/dashboard/workflows` workflow-run and workflow-template management surface.
- Production `/dashboard/workflows/$runId` immutable review workspace.
- Production `/dashboard/approvals` authenticated work queue.
- Owner/admin workflow-template builder for ordered Review, Approval and Acknowledgement steps.
- Assignment modes for specific workspace member, workspace role, document creator and workflow starter.
- Versioned workflow-template revision flow that preserves prior definitions used by historical/running workflows.
- Immutable review rendering for submitted native documents, OfficeKonnect Sheets, PDFs and other uploaded binaries.
- State-machine-valid Approve, Request Changes, Reject and Acknowledge actions through the existing decision RPC.
- Workflow/step comments, comment editing, resolve/reopen, audited reassignment and cancellation.
- Request-changes working-document path and optimistic-concurrency resubmission through `resubmit_document_workflow`.
- Work-queue grouping: Overdue, Due soon, Upcoming and No deadline.
- Recently completed decision history sourced from immutable `workflow_decisions` for the current actor.
- Five workflow contract regression tests covering role mapping, decision eligibility, queue classification and template validation.
- `docs/PHASE5.md` with the complete workflow architecture/security/validation record.

### Changed

- Workflows and Approvals are active canonical navigation destinations rather than future-phase placeholders.
- Workflow template design changes create a new template revision instead of editing a live definition in place.
- Submitted workflow content is reviewed from the exact immutable `document_versions` snapshot while the working document remains separate.
- Request Changes now follows the real edit → resubmit → new immutable document version → incremented workflow revision path.
- The Approvals queue consumes the existing auth-scoped `workflow_work_queue` database view directly instead of rebuilding access rules client-side.

### Security / architecture

- No replacement workflow engine was introduced.
- No Phase 5 database migration was required; the recovered live workflow schema/RPCs were already sufficient.
- Run, step and assignment lifecycle states remain server-authoritative and are not directly written by browser code.
- RLS remains enabled on all eight workflow state tables.
- Existing workflow transition/comment/reassignment/cancellation RPCs remain authoritative.
- No fake workflow templates, runs, decisions or comments were seeded into production.
- No service-role credential was exposed and no existing RLS policy was weakened.

### Validation

- Clean source Upgrade Validation run `32105437719` passed repository parity, frozen install, ESLint, TypeScript, **24 tests / 0 failures**, 83 expectations across 6 files, and production build.
- Deployment-platform validation is intentionally deferred until Phase 11.

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

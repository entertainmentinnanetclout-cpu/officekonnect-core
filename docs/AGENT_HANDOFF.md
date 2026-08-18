# OfficeKonnect Agent Handoff

## Active branch

`phase-0-canonical-reconciliation`

## Long-running PR

Draft PR #2 carries the OfficeKonnect Phases 0–11 upgrade. Do not merge it after an individual phase. `main` remains unchanged until the Phase 11 release-candidate gate is complete.

## Current status

- Phase 0 — canonical reconciliation: completed.
- Phase 1 — development identity and application shell: completed.
- Phase 2 — documents, native editor and PDF engine: completed.
- Phase 3 — OfficeKonnect Sheets: completed.
- **Next: Phase 4 — Files and Templates.**

## Do not do

- Do not reset production.
- Do not create replacement document, spreadsheet, workflow or signing engines.
- Do not weaken RLS to make frontend helpers work.
- Do not expose service-role credentials to the browser.
- Do not delete Mail, Contacts or Voice merely because later phases focus on other modules.
- Do not mutate/squash historical migrations.
- Do not replace the workbook JSON contract with an XLSX-native persistence model.

## Live backend facts retained from Phase 0

- Supabase project: `ydgsmnzcwkrlghlhtpgq`.
- 43 public application tables; RLS enabled on all 43 at Phase 0 audit time.
- Private storage buckets: documents, document-versions, exports, letterheads, signatures, voice-notes. Avatars is public.
- Deployed signing Edge Functions: signing-actions, signing-external, signing-finalize.
- Workflow RPCs include start, decision, resubmit, reassign, comment resolve/update and cancel.
- Signing RPCs include secure send, rotate invitation, complete/decline participant, external token exchange/session payload, finalization and cancellation.
- Live migration ledger extends through `20260728101556_phase_5_signing_rls_initplan_optimization`.

## Canonical documents and Sheets contracts

- `documents` is the current-state record for native documents, uploaded files and spreadsheets.
- `document_versions` is the immutable version ledger.
- native/spreadsheet structured saves use `save_structured_document` with optimistic concurrency.
- structured restores use `restore_structured_document_version` and create a pre-restore backup.
- spreadsheet content remains JSONB with `kind: "workbook"`, `schemaVersion: 1`.
- `src/lib/spreadsheet.ts` is the single application workbook/calculation module.
- imported XLSX/XLS/CSV content is normalized into that workbook model.
- `src/lib/spreadsheet-pdf.server.ts` is the spreadsheet PDF renderer.
- spreadsheet static signing copies create normal private PDF document/version records and do not bypass the hardened signing state machine.

## Phase 3 implementation surfaces

- `/dashboard/sheets` — real spreadsheet library.
- `/dashboard/sheets/$documentId` — production spreadsheet editor.
- `/dashboard/documents/$documentId` — also renders the same editor when `document_kind = 'spreadsheet'`.
- `src/lib/spreadsheets.functions.ts` — authenticated create/save/restore/duplicate/PDF/signing-copy server functions.
- locked `xlsx` dependency — XLSX/XLS/CSV import/export boundary.
- TanStack generated route tree includes the Sheets routes.

## Phase 3 security invariants

- no new spreadsheet database table was needed;
- no new Phase 3 migration was needed in the completion pass;
- browser code uses publishable Supabase access only;
- server functions resolve the active workspace and rely on existing RLS/RPC checks;
- authoritative sheet/cell/formula metrics are recomputed server-side before structured save;
- outputs and signing copies remain private and use signed URLs.

## Known Sheets limitations

Do not claim unsupported Excel parity. Phase 3 does not implement macros, pivot tables, charts, external workbook links, or pixel-perfect preservation of every Excel-specific style. The formula engine is intentionally focused. Full workflows/approvals are Phase 5; full production signing is Phase 6.

## Phase 4 focus

Extend the existing document/storage architecture rather than creating parallel file systems. Phase 4 should complete folders, favourites, controlled sharing and document/spreadsheet templates while preserving private Storage, workspace membership and current document identities.

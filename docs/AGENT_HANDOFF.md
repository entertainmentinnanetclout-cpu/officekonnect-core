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
- Phase 4 — Files and Templates: completed.
- **Next: Phase 5 — Workflows and Approvals.**

## Do not do

- Do not reset production.
- Do not create replacement document, spreadsheet, file, template, workflow or signing engines.
- Do not weaken RLS to make frontend helpers work.
- Do not expose service-role credentials to the browser.
- Do not delete Mail, Contacts or Voice merely because later phases focus on other modules.
- Do not mutate/squash historical migrations.
- Do not replace the workbook JSON contract with an XLSX-native persistence model.
- Do not make folder moves physically relocate private Storage objects.
- Do not describe Phase 4 explicit shares as a new privacy boundary; existing workspace document SELECT visibility remains canonical.

## Live backend

- Supabase project: `ydgsmnzcwkrlghlhtpgq`.
- Private resource storage remains workspace-first.
- Deployed signing Edge Functions remain `signing-actions`, `signing-external`, `signing-finalize`.
- Phase 4 migrations are applied through:
  - `20260818051912_phase_4_files_templates_workspace_organization`
  - `20260818052526_phase_4_folder_hierarchy_cycle_guard`
- New Phase 4 organization relations: `workspace_folders`, `document_folder_items`, `document_favorites`, `document_shares`.
- RLS is enabled on all four new relations.
- `list_workspace_member_directory` is the membership-checked directory RPC used by the explicit-share picker.

## Canonical document/file/template contracts

- `documents` is the current-state record for native documents, uploaded files and spreadsheets.
- `document_versions` is the immutable version ledger.
- `document_templates` is the reusable native-document/spreadsheet template table.
- `documents.template_id` links created documents back to their source template.
- `workspace_folders` and `document_folder_items` organize document identities without moving binaries.
- `document_favorites` is user-specific.
- `document_shares` is workspace-internal and currently constrained to `view`.
- uploaded-file duplicate must copy the real private Storage object and create a fresh document/version record.
- Mail Center email templates remain separate; do not fold them into document templates.

## Phase 4 implementation surfaces

- `/dashboard/files` — real files/folders/favourites/shared/archive/Trash workspace.
- `/dashboard/templates` — real reusable document/spreadsheet template workspace.
- `src/lib/files.functions.ts` — authenticated folder, favourite, share, member-directory and uploaded-file duplicate operations.
- `src/lib/document-templates.functions.ts` — save/use/duplicate/update document-template lifecycle.
- `src/lib/templates.ts` — canonical generic template categories and structured-content summaries.
- `docs/PHASE4.md` — detailed Phase 4 architecture, security and limitations.

## Phase 4 security invariants

- no duplicate document or binary store;
- no public Storage path introduced;
- folder hierarchy cycles are rejected server-side;
- explicit shares require an existing member of the same workspace and are view-only;
- member-directory RPC verifies workspace membership;
- template creation/management is constrained by workspace membership plus owner/admin RLS;
- browser continues to use publishable credentials only.

## Validation checkpoint

Clean Phase 4 source passed repository parity, frozen `bun ci`, ESLint, TypeScript, **19 Bun tests / 0 failures**, and production build in Upgrade Validation run `32103495621`. Final documentation head must receive the same canonical gate before Phase 4 is closed.

## Phase 5 focus

Do not rebuild workflows. Use the existing Phase 4/5 backend state machine and tables: `workflow_templates`, `workflow_template_steps`, `workflow_runs`, `workflow_steps`, `workflow_step_assignees`, `workflow_decisions`, `workflow_comments`, and `workflow_events`. Build the production workflow builder, work queue, immutable submitted-version review, Approve/Request Changes/Reject/Acknowledge actions, comments, revision/resubmission and optimistic-concurrency UX over the existing RPC/security contracts.

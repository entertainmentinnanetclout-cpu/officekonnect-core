# OfficeKonnect Agent Handoff

## Active branch

`phase-0-canonical-reconciliation`

## Long-running PR

Draft PR #2 carries the OfficeKonnect Phases 0–11 upgrade. Do not merge it after an individual phase. `main` remains unchanged until the Phase 11 release-candidate gate is complete.

Vercel deployment validation is intentionally deferred until Phase 11. Do not use Vercel status as a Phase 6–10 acceptance gate unless the user explicitly changes this instruction.

## Current status

- Phase 0 — canonical reconciliation: completed.
- Phase 1 — development identity and application shell: completed.
- Phase 2 — documents, native editor and PDF engine: completed.
- Phase 3 — OfficeKonnect Sheets: completed.
- Phase 4 — Files and Templates: completed.
- Phase 5 — Workflows and Approvals: completed.
- **Next: Phase 6 — Production E-Signatures.**

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
- Do not directly write workflow run/step/assignment lifecycle statuses from browser code.
- Do not review mutable `documents.content` as if it were the submitted workflow version; use `workflow_runs.document_version_id`.

## Live backend

- Supabase project: `ydgsmnzcwkrlghlhtpgq`.
- Private resource storage remains workspace-first.
- Deployed signing Edge Functions remain `signing-actions`, `signing-external`, `signing-finalize`.
- Phase 4 organization migrations are applied:
  - `20260818051912_phase_4_files_templates_workspace_organization`
  - `20260818052526_phase_4_folder_hierarchy_cycle_guard`
- Workflow foundation already exists in recovered live migrations; no new Phase 5 migration was required.

## Canonical document/file/template contracts

- `documents` is the current-state record for native documents, uploaded files and spreadsheets.
- `document_versions` is the immutable version ledger and the workflow submission snapshot source.
- `document_templates` is the reusable native-document/spreadsheet template table.
- `documents.template_id` links created documents back to their source template.
- `workspace_folders` and `document_folder_items` organize document identities without moving binaries.
- `document_favorites` is user-specific.
- `document_shares` is workspace-internal and constrained to `view`.
- Uploaded-file duplicate must copy the real private Storage object and create a fresh document/version record.
- Mail Center email templates remain separate.

## Canonical workflow contracts

Workflow relations:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_runs`
- `workflow_steps`
- `workflow_step_assignees`
- `workflow_decisions`
- `workflow_comments`
- `workflow_events`
- `workflow_work_queue`

Lifecycle/comment RPCs:

- `start_document_workflow`
- `submit_workflow_decision`
- `resubmit_document_workflow`
- `reassign_workflow_assignment`
- `cancel_document_workflow`
- `resolve_workflow_comment`
- `update_workflow_comment`

Workflow state remains server-authoritative. Starting a workflow creates an immutable `document_versions` snapshot. Decisions operate on that submission until a controlled resubmission creates another immutable version and increments `workflow_revision`.

## Phase 5 implementation surfaces

- `/dashboard/workflows` — workflow runs plus owner/admin versioned template builder.
- `/dashboard/workflows/$runId` — immutable submitted-version review workspace, decisions, comments, reassignment, cancellation and resubmission.
- `/dashboard/approvals` — current-user work queue over `workflow_work_queue` plus recent immutable decisions.
- `src/lib/workflows.ts` — canonical workflow types, decision rules, queue classification and template validation.
- `src/lib/workflows.functions.ts` — authenticated application wrappers over existing RLS/RPC contracts.
- `src/components/workflow/workflow-snapshot.tsx` — immutable native/sheet/uploaded-file review rendering.
- `src/lib/workflows.test.ts` — workflow contract regression tests.
- `docs/PHASE5.md` — full Phase 5 architecture/security/validation record.

## Phase 5 security invariants

- no replacement workflow state machine;
- no direct client run/step/assignment status writes;
- workflow start, decision, resubmit, reassign and cancel use existing RPCs;
- submitted review content always comes from the immutable version referenced by the run;
- working document edits remain separate and only enter review through `resubmit_document_workflow`;
- `workflow_work_queue` is already auth-scoped to the current user's pending active assignment;
- comments remain protected by existing RLS/RPC rules;
- all eight workflow state tables retain RLS;
- no fake workflow data was seeded;
- browser continues to use publishable credentials only.

## Validation checkpoint

Clean Phase 5 source checkpoint before documentation: `556a605457f7f6a033e2f2d89fc50a7b2c18a993`.

Upgrade Validation run `32105437719` passed:

- repository parity;
- frozen `bun ci`;
- ESLint with 0 errors;
- TypeScript;
- **24 Bun tests / 0 failures**, 83 expectations across 6 files;
- production build.

The final documentation head receives the same read-only gate before Phase 5 is formally closed.

## Phase 6 focus

Do not rebuild signing. Reuse the already hardened backend:

- `signing_requests`
- `signing_participants`
- `signing_fields`
- `signing_tokens`
- `signing_events`
- `signing_certificates`
- private external signing sessions
- `signing-actions`
- `signing-external`
- `signing-finalize`

Phase 6 should replace the obsolete frontend signing path with the production signing dashboard/status buckets, preparation workspace, participant configuration and ordering, normalized drag/resize fields, internal signer UX, external raw-token exchange/session flow, signature/initial/text/date completion, sequential/parallel behavior, finalization, signed PDF access, certificate access and audit timeline. Preserve the existing token/session/hash/immutability/finalization contracts exactly.

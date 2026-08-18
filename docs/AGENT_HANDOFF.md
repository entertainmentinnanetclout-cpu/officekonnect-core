# OfficeKonnect Agent Handoff

## Active branch

`phase-0-canonical-reconciliation`

## Long-running PR

Draft PR #2 carries the OfficeKonnect Phases 0–11 upgrade. Do not merge after an individual phase. `main` remains unchanged until the Phase 11 release-candidate gate is complete.

Vercel/deployment-platform validation is intentionally deferred until Phase 11. Do not use Vercel status as a Phase 8–10 acceptance gate unless the user explicitly changes this instruction.

## Current status

- Phase 0 — Canonical reconciliation: completed.
- Phase 1 — Development identity and application shell: completed.
- Phase 2 — Documents, native editor and PDF engine: completed.
- Phase 3 — OfficeKonnect Sheets: completed.
- Phase 4 — Files and Templates: completed.
- Phase 5 — Workflows and Approvals: completed.
- Phase 6 — Production E-Signatures: completed.
- Phase 7 — Tasks, Calendar and Global Search: completed.
- **Next: Phase 8 — Notifications, Activity, Team, Workspace and Settings.**

## Do not do

- Do not reset production.
- Do not create replacement document, spreadsheet, file, template, workflow, signing, role, notification or storage engines.
- Do not weaken RLS to make frontend helpers work.
- Do not expose service-role credentials to the browser.
- Do not delete Mail, Contacts or Voice.
- Do not mutate/squash historical migrations.
- Do not replace the workbook JSON contract with an XLSX-native persistence model.
- Do not physically relocate private Storage objects during ordinary folder moves.
- Do not directly write workflow or signing lifecycle states that are owned by RPCs/Edge Functions.
- Do not review mutable `documents.content` as a submitted workflow version.
- Do not reintroduce `signing-public.functions.ts`.
- Do not retain the raw external invitation token after successful exchange.
- Do not persist task/workflow/signing source dates into `calendar_events`; derive them from canonical modules.
- Do not build a second search-copy database/index merely to power the command palette.
- Do not grant anonymous execution to the membership-directory or global-search SECURITY DEFINER RPCs.

## Live backend

Supabase project: `ydgsmnzcwkrlghlhtpgq`.

Private resource Storage remains workspace-first.

### Applied Phase 4 migrations

- `20260818051912_phase_4_files_templates_workspace_organization`
- `20260818052526_phase_4_folder_hierarchy_cycle_guard`

### Applied Phase 7 migrations

- `20260818062157_phase_7_tasks_calendar_search`
- `20260818080155_phase_7_rpc_execute_acl_hardening`

### Live signing Edge Functions

- `signing-actions` — ACTIVE, JWT required.
- `signing-external` — ACTIVE, JWT disabled intentionally for its custom invitation/session authentication contract.
- `signing-finalize` — ACTIVE version 2, JWT required.

The finalizer certificate title is `OfficeKonnect Signing Certificate`.

## Canonical document/file/template contracts

- `documents` — current-state record for native docs, uploaded files and Sheets.
- `document_versions` — immutable version ledger and workflow/signing source snapshots.
- `document_templates` — reusable native-document/spreadsheet templates.
- `workspace_folders` + `document_folder_items` — relational organization without moving binaries.
- `document_favorites` — user-specific.
- `document_shares` — workspace-internal and view-only.
- Mail Center email templates remain separate.

## Canonical workflow contracts

Relations:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_runs`
- `workflow_steps`
- `workflow_step_assignees`
- `workflow_decisions`
- `workflow_comments`
- `workflow_events`
- `workflow_work_queue`

Lifecycle/comment RPCs remain authoritative. Workflow start snapshots an immutable `document_versions` submission; decisions operate on that snapshot until controlled resubmission creates another immutable version and increments `workflow_revision`.

## Canonical Phase 6 signing contracts

Relations:

- `signing_requests`
- `signing_participants`
- `signing_fields`
- `signing_tokens`
- `signing_events`
- `signing_certificates`
- private signing sessions

### Product surfaces

- `/dashboard/signing` — request dashboard/status buckets, PDF request creation and participant configuration.
- `/dashboard/signing/$requestId/prepare` — participant ordering plus normalized PDF field preparation and secure send.
- `/dashboard/signing/$requestId` — sender controls, internal signing, audit, finalization and certificate/final-PDF access.
- `/sign/$token` — one-time raw invitation exchange only.
- `/sign/active` — short-lived external session signing workspace.

### Signing invariants

- PDF-only signing requests.
- Unlocked drafts may be configured under RLS.
- Sending and all terminal transitions remain server-authoritative.
- Parallel or sequential order.
- Roles: signer, approver, CC.
- CC owns no signing fields.
- Signers require a required signature/initial field.
- Send locks immutable source version plus participant/field hashes.
- Internal completion validates `auth.uid()`, eligibility, order, consent and locked hashes.
- External raw token is exchange-only; the active browser session uses only a short-lived session token in `sessionStorage`.
- External signature uploads/completion/decline go through `signing-external`.
- `signing-finalize` is the only completed-PDF/certificate generator.

Documents and Sheets now follow:

```text
Send for signature
→ flush canonical save
→ deterministic immutable PDF signing copy
→ prefilled signing draft
→ prepare participants/fields
→ secure send
```

See `docs/PHASE6.md`.

## Canonical Phase 7 contracts

### Tasks

`tasks` is the only lightweight task persistence table. It stores workspace, creator, optional assignee, status, priority, start/due/completion dates and optional operational object links.

RLS:

- workspace members read;
- members create;
- creator/assignee/admin update;
- creator/admin delete.

Surface: `/dashboard/tasks`.

### Calendar

`calendar_events` stores only manual workspace events.

The Calendar UI derives operational dates at read time from:

- tasks;
- workflow runs;
- workflow steps;
- signing requests.

Do not duplicate those dates into `calendar_events`.

Surface: `/dashboard/calendar`.

### Search

`search_workspace_objects` is the membership-checked server-side workspace search RPC. Current search coverage: documents/Sheets, templates, workflows, signing requests, tasks and members.

Execution boundary:

- anonymous `EXECUTE` is revoked;
- authenticated application execution is retained;
- workspace membership is still checked inside the function;
- `list_workspace_member_directory` follows the same authenticated-only execution boundary.

Surfaces:

- `/dashboard/search`;
- Ctrl/Cmd+K `GlobalSearchDialog` in the OfficeKonnect shell.

No search-copy table was introduced.

See `docs/PHASE7.md`.

## Live Phase 6/7 security verification

- `tasks`: RLS enabled, 4 policies.
- `calendar_events`: RLS enabled, 4 policies.
- `signing_requests`: RLS enabled, 4 policies.
- `signing_participants`: RLS enabled, 2 policies.
- `signing_fields`: RLS enabled, 2 policies.
- `signing_events`: RLS enabled, 1 policy.
- `signing_certificates`: RLS enabled, 1 policy.
- Anonymous SECURITY DEFINER execution is revoked for `search_workspace_objects` and `list_workspace_member_directory`.

No fake rows were seeded during Phase 6/7 completion:

- tasks: 0
- calendar events: 0
- signing requests: 0
- signing participants: 0
- signing fields: 0
- signing certificates: 0

## Validation checkpoint

Phase 6/7 product source, migration parity and ACL hardening pass the permanent read-only gate:

- repository parity;
- frozen `bun ci`;
- ESLint with 0 errors;
- TypeScript;
- **33 Bun tests / 0 failures**;
- production build.

The final documentation branch head receives the same read-only validation gate and becomes the authoritative Phase 6/7 completion checkpoint.

## Phase 8 focus

Phase 8 must complete the existing infrastructure rather than creating replacement systems:

- Notifications — real center, unread/read state and entity navigation.
- Activity — complete workspace/user activity timeline over actual audit/event sources.
- Team — members, roles, invitations/management according to existing workspace role contracts.
- Workspace — workspace identity/preferences and membership administration.
- Settings — complete General, Workspace, Documents, PDF & Printing, Notifications, Signatures, Templates, Security, Appearance and Developer surfaces with persisted real settings where backend support exists/additive schema only where a demonstrated gap exists.

Keep the same Draft PR #2 and do not merge after Phase 8.

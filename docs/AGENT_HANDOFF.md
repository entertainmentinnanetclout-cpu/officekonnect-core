# OfficeKonnect Agent Handoff

## Active branch

`phase-0-canonical-reconciliation`

## Long-running PR

Draft PR #2 carries the OfficeKonnect Phases 0–11 upgrade. Do not merge after an individual phase. `main` remains unchanged until the Phase 11 release-candidate gate is complete.

Vercel/deployment-platform validation is intentionally deferred until Phase 11. Do not use Vercel status as a Phase 9–10 acceptance gate unless the user explicitly changes this instruction.

## Current status

- Phase 0 — Canonical reconciliation: completed.
- Phase 1 — Development identity and application shell: completed.
- Phase 2 — Documents, native editor and PDF engine: completed.
- Phase 3 — OfficeKonnect Sheets: completed.
- Phase 4 — Files and Templates: completed.
- Phase 5 — Workflows and Approvals: completed.
- Phase 6 — Production E-Signatures: completed.
- Phase 7 — Tasks, Calendar and Global Search: completed.
- Phase 8 — Notifications, Activity, Team, Workspace and Settings: completed.
- **Next: Phase 9 — Product-wide UX and Route Hardening.**

## Do not do

- Do not reset production.
- Do not create replacement document, spreadsheet, file, template, workflow, signing, task, calendar, search, role, notification, audit, tenancy or storage engines.
- Do not weaken RLS to make frontend code work.
- Do not expose service-role credentials to the browser.
- Do not delete Mail, Contacts or Voice.
- Do not mutate/squash historical migrations.
- Do not replace the workbook JSON persistence model with XLSX-native persistence.
- Do not physically relocate private Storage binaries during ordinary folder moves.
- Do not directly write workflow/signing lifecycle states owned by RPCs/Edge Functions.
- Do not review mutable document content as a submitted workflow version.
- Do not reintroduce `signing-public.functions.ts`.
- Do not retain external signing raw tokens after session exchange.
- Do not persist derived task/workflow/signing dates into `calendar_events`.
- Do not build a duplicate search-copy database/index.
- Do not grant anonymous execution to authenticated application SECURITY DEFINER RPCs.
- Do not store raw workspace invitation bearer tokens in Postgres or persistent browser storage.
- Do not introduce fake Connect, upgrade/checkout, account-delete or preference controls whose backend behavior does not exist.
- Do not remove integrity/relationship indexes solely because low-traffic advisor statistics say unused.

## Live backend

Supabase project: `ydgsmnzcwkrlghlhtpgq`.

Private resource Storage remains workspace-first.

### Phase 4 migrations

- `20260818051912_phase_4_files_templates_workspace_organization`
- `20260818052526_phase_4_folder_hierarchy_cycle_guard`

### Phase 7 migrations

- `20260818062157_phase_7_tasks_calendar_search`
- `20260818080155_phase_7_rpc_execute_acl_hardening`

### Phase 8 migrations

- `20260818082337_phase_8_notifications_team_workspace_activity`
- `20260818082454_phase_8_workspace_invitation_directory`
- `20260818084738_phase_8_activity_workspace_identity_hardening`

### Live signing Edge Functions

- `signing-actions` — ACTIVE, JWT required.
- `signing-external` — ACTIVE, JWT disabled intentionally for custom invitation/session authentication.
- `signing-finalize` — ACTIVE version 2, JWT required.

## Canonical product contracts

### Documents / Sheets / Files / Templates

- `documents` — current native/uploaded/Sheet state.
- `document_versions` — immutable version ledger and workflow/signing snapshots.
- `document_templates` — native document/spreadsheet templates.
- `workspace_folders` + `document_folder_items` — relational organization only.
- `document_favorites` — user-specific.
- `document_shares` — workspace-internal view markers.
- Workbook persistence remains `{kind:"workbook",schemaVersion:1,...}`.

### Workflows

Canonical relations remain `workflow_templates`, `workflow_template_steps`, `workflow_runs`, `workflow_steps`, `workflow_step_assignees`, `workflow_decisions`, `workflow_comments`, `workflow_events` and `workflow_work_queue`.

Lifecycle/comment/reassignment/cancellation/resubmission RPCs remain authoritative. Submitted review content is an immutable document version.

### Signing

Canonical relations remain `signing_requests`, `signing_participants`, `signing_fields`, `signing_tokens`, `signing_events`, `signing_certificates` and private signing sessions.

External raw tokens are exchange-only; active external signing uses short-lived `sessionStorage` session tokens. `signing-finalize` remains the only completed-PDF/certificate generator.

### Tasks / Calendar / Search

- `tasks` remains the lightweight task table.
- `calendar_events` stores manual events only; operational dates are derived.
- `search_workspace_objects` remains the canonical membership-checked global-search RPC.
- anonymous search/directory RPC execution remains revoked.

## Canonical Phase 8 contracts

### Notifications

- `notifications` remains the canonical event row.
- `notification_receipts` exists only for per-user read state of broadcast rows.
- Direct notification `read_at` is not migrated into a duplicate table.
- Canonical RPCs: list, unread count, mark read, mark all read.
- Surfaces: header `NotificationBell` and `/dashboard/notifications`.

### Activity

- No duplicate consolidated activity table.
- `list_workspace_activity` aggregates `activity_logs`, `workflow_events`, `signing_events`.
- owner/admin gets workspace view; ordinary members get own actor-scoped view.
- audit triggers cover tasks/calendar/templates/members/workspaces/invitations.
- `log_activity()` special-cases `workspaces` so the row id is the tenant scope.
- Surface: `/dashboard/activity`.

### Team

- `workspace_members` and `workspace_role` remain canonical.
- `workspace_invitations` is pending state only.
- raw token is generated server-side, returned once, SHA-256 hash stored.
- browser auth continuation uses `sessionStorage` and clears token after success.
- acceptance verifies authenticated profile email.
- owner cannot be invited/changed/removed through ordinary member-management actions.
- admin cannot manage another admin.
- Surfaces: `/dashboard/team`, `/invite/$token`.

### Workspace

- `workspaces`, memberships, default workspace and subscriptions remain canonical.
- `create_workspace` atomically creates workspace + owner membership + free subscription + default workspace.
- Surface: `/dashboard/workspace`.

### Settings

The completed Settings page exposes only real behavior:

- profile/avatar;
- workspace/team links;
- actual document/PDF module behavior;
- notification state;
- reusable signatures;
- template state;
- Auth password/session actions;
- persisted theme preference;
- actual integrations with disconnect;
- actual subscription state without fake checkout;
- non-secret developer identifiers;
- personal-data export.

Disabled/fake account deletion was removed pending an explicit retention/ownership/audit deletion contract.

## Security/advisor interpretation

All new Phase 8 public application RPCs revoke anonymous execution. Authenticated execution is intentional for the SECURITY DEFINER functions because they implement the controlled application transaction boundary and perform `auth.uid()`, membership, role and/or invited-email checks internally.

The `signing_tokens` RLS/no-direct-policy notice is intentional. Leaked-password protection and inherited RLS planner/multiple-policy warnings belong to Phase 10 security/performance hardening.

Low/no-traffic unused-index notices are not evidence to remove future-scale/relationship indexes.

## Generated types / repository hygiene

The repository generated Supabase types include Phase 8 tables/RPCs.

Temporary write workflows used to synchronize route-tree generation, scoped formatting and generated type reconciliation were deleted after use. Do not reintroduce them as permanent CI.

## Production data integrity

No fake Phase 8 rows were seeded during completion:

- notification receipts: 0
- workspace invitations: 0
- notifications: 0

## Validation checkpoint

The substantive Phase 8 implementation passed:

- repository parity;
- frozen `bun ci`;
- ESLint with 0 errors;
- TypeScript;
- **39 Bun tests / 0 failures**;
- production client/SSR/Nitro build.

The final documentation/hardening branch head receives the same read-only validation gate and is the authoritative Phase 8 completion checkpoint.

## Phase 9 focus

Phase 9 must harden the complete product horizontally rather than add replacement systems:

- audit all user-facing actions for dead/no-op behavior;
- verify every navigation/route/deep link and route parameter;
- remove remaining mock/sample/placeholder/fake production state;
- improve empty/loading/error/permission/expired/terminal states;
- harden mobile/tablet/desktop layouts;
- keyboard/focus/accessibility review;
- cross-module consistency for documents, sheets, files, templates, workflows, approvals, signing, tasks, calendar, search, notifications, activity, team, workspace and settings;
- retain current RLS/workspace/state-machine contracts.

Keep Draft PR #2 open and unmerged after Phase 9.

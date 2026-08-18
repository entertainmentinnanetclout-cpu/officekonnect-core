# OfficeKonnect Architecture

## Architectural rule

Preserve and extend the existing Supabase data model and server-authoritative state machines. Do not create parallel document-version, spreadsheet, file, template, workflow, signing, task, calendar, search, role, notification, audit, tenancy or storage systems unless a demonstrated gap requires a narrowly additive model.

## Runtime layers

### Client

- React 19
- TanStack Router / Start / Query
- TypeScript
- Tailwind / Radix UI
- PDF.js/react-pdf for viewing
- `react-rnd` for normalized signing-field preparation
- `react-signature-canvas` for signature capture
- pdf-lib for deterministic PDF work where appropriate
- xlsx for XLSX/XLS/CSV interoperability

### Server application layer

TanStack Start server functions and authenticated Supabase RPCs provide application operations. Browser code never receives a service-role credential and never replaces `auth.uid()` or live RLS with a fake identity.

### Supabase

- Auth identity/JWT
- Postgres persistence
- RLS
- private helper schema for state-machine internals
- workspace-partitioned Storage
- authenticated RPCs for controlled transitions/administration/search
- Edge Functions for signing actions, external signing sessions and finalization

## Workspace isolation

Canonical private-resource path:

```text
{workspace_id}/{user_id}/{resource...}
```

Workspace membership remains canonical in `workspace_members`; `workspace_role` remains owner/admin/member/viewer and `private.has_workspace_role` remains the role hierarchy helper.

## Documents and Sheets

`documents` is the canonical current-state record for uploaded files, native documents and spreadsheets. `document_versions` stores immutable snapshots. Structured native content uses JSONB and optimistic `editor_version` concurrency.

Spreadsheet records remain normal `documents` rows with `document_kind='spreadsheet'` and authoritative content `{ "kind": "workbook", "schemaVersion": 1, ... }`. `src/lib/spreadsheet.ts` remains the application workbook/calculation engine. XLSX/CSV are interoperability formats, not persistence.

Native Documents/Sheets use deterministic PDF output. Static signing copies become normal private PDF document/version identities before entering the signing system.

## Files and Templates

Files organize `documents`; they do not create a second binary store:

- `workspace_folders`
- `document_folder_items`
- `document_favorites`
- `document_shares`

Folder moves are relational and keep Storage paths stable. `document_templates` remains the canonical native document/spreadsheet template system; Mail Center email templates remain separate.

## Workflows and Approvals

Canonical workflow relations:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_runs`
- `workflow_steps`
- `workflow_step_assignees`
- `workflow_decisions`
- `workflow_comments`
- `workflow_events`
- `workflow_work_queue`

Lifecycle transitions remain server-authoritative through the recovered workflow RPCs. Starting a workflow creates an immutable `document_versions` submission. Review renders that snapshot, never mutable current document content. Request Changes returns to working content and re-enters review only through controlled resubmission.

## Production E-Signatures

Canonical signing backend:

- `signing_requests`
- `signing_participants`
- `signing_fields`
- `signing_tokens`
- `signing_events`
- `signing_certificates`
- private signing sessions

Canonical bridge:

```text
flush save
→ deterministic immutable PDF signing copy
→ signing draft
→ participant configuration
→ normalized PDF field preparation
→ secure send
```

Browser code may configure an unlocked draft under RLS but does not directly force signing lifecycle states.

Internal completion validates authenticated participant identity, eligibility/order, locked hashes, required fields and consent. External raw invitation tokens are exchange-only; `/sign/active` uses a short-lived session token stored in `sessionStorage`.

`signing-finalize` remains the only completed-PDF/certificate generator. Live version 2 is JWT protected and generates the generic `OfficeKonnect Signing Certificate`.

## Tasks

`tasks` is the only lightweight task persistence relation. It stores creator/assignee, status, priority, start/due/completion dates and optional links to operational objects. It does not become a second workflow engine.

## Calendar

`calendar_events` stores only manual office events. The operational Calendar derives task dates, workflow-run/step deadlines and signing expiries directly from their canonical modules instead of duplicating state.

## Global Search

`search_workspace_objects` is the canonical server-side workspace search boundary. It is membership checked, restricted-search-path `SECURITY DEFINER`, executable only by authenticated application users, and covers Documents/Sheets, Templates, Workflows, E-signatures, Tasks and workspace members.

No search-copy table/index was introduced.

## Notifications

`notifications` remains the canonical event record.

### Direct notifications

Rows with `user_id` set continue to use their own `read_at` state.

### Workspace-broadcast notifications

Phase 8 adds `notification_receipts` because one broadcast row cannot safely store a single read state for many users.

`notification_receipts` is keyed by `(notification_id,user_id)`, RLS protected, and stores the current user's broadcast read state without copying the notification payload.

Canonical RPCs:

- `list_workspace_notifications`
- `count_unread_workspace_notifications`
- `mark_notification_read`
- `mark_all_workspace_notifications_read`

Anonymous execution is revoked. Membership remains checked inside the read RPCs.

The shell notification bell and `/dashboard/notifications` consume this same contract.

## Activity and audit

OfficeKonnect does not maintain a duplicate consolidated activity table.

`list_workspace_activity` normalizes canonical ledgers at read time:

- `activity_logs`
- `workflow_events`
- `signing_events`

Phase 8 extends existing `log_activity()` triggers to tasks, manual calendar events, templates, workspace memberships, workspaces and workspace invitations.

For `workspaces`, `log_activity()` explicitly uses the row `id` as the workspace/tenant id. This prevents workspace-identity edits from becoming unscoped audit rows.

Owner/admin users can view workspace-level activity; ordinary members receive their own actor-scoped consolidated activity. Signing audit event hashes are preserved.

## Team and workspace invitations

`workspace_members` remains the only actual membership relation. Phase 8 adds `workspace_invitations` solely for pending invitations.

Invitation rows contain:

- workspace;
- normalized invited email;
- non-owner requested role;
- inviter;
- SHA-256 bearer-token hash;
- expiry/accept/revoke metadata.

Raw invitation tokens are generated server-side, returned only when an invitation is created and **never persisted in Postgres**.

Invitation continuation across authentication is held in browser `sessionStorage` only and removed after successful acceptance.

Authorization rules:

- owner/admin may invite;
- admin cannot invite/promote/manage another admin;
- owner cannot be invited through the ordinary invite flow;
- owner membership cannot be changed or removed through member-management RPCs;
- acceptance verifies authenticated profile email against invited email;
- revoked/expired/accepted invites are terminal.

Canonical administrative RPCs:

- `create_workspace_invitation`
- `list_workspace_invitations`
- `list_my_workspace_invitations`
- `accept_workspace_invitation_by_id`
- `accept_workspace_invitation`
- `revoke_workspace_invitation`
- `update_workspace_member_role`
- `remove_workspace_member`

## Workspace tenancy

Existing `workspaces`, `workspace_members`, `profiles.default_workspace_id` and `subscriptions` remain canonical.

`create_workspace` is an atomic authenticated RPC that creates the workspace, owner membership, free active subscription and default-workspace selection together.

`/dashboard/workspace` edits identity under existing RLS, switches memberships and exposes real subscription state.

## Settings architecture

Settings may persist a value only when the product actually consumes/enforces it.

Real Phase 8 Settings surfaces use existing canonical data/actions:

- profile/avatar → `profiles` + avatars Storage;
- workspace → `workspaces` / Team;
- documents/PDF → current deterministic module behavior, not fake unused preferences;
- notifications → canonical notification RPCs;
- signatures → `user_signatures` + signatures Storage;
- templates → `document_templates`;
- security → Supabase Auth password/session operations;
- appearance → `profiles.preferences.theme`;
- integrations → `user_integrations`;
- billing → `subscriptions`;
- account export → current user's RLS-visible data.

No fake Connect, checkout/upgrade or destructive account-deletion action is advertised when the corresponding production workflow does not exist.

## SECURITY DEFINER application boundary

Selected public RPCs are intentionally `SECURITY DEFINER` because they implement controlled cross-table operations that cannot be expressed safely as independent client writes.

Rules for these RPCs:

1. restricted `search_path`;
2. anonymous `EXECUTE` revoked unless an explicit custom public protocol requires otherwise;
3. authenticated `EXECUTE` granted only for application RPCs;
4. `auth.uid()`, membership, role and/or invited-email verification inside the function;
5. client cannot supply arbitrary privileged identity.

Supabase's generic advisor may report authenticated SECURITY DEFINER executability. That warning is reviewed function-by-function; authenticated execution is intentional for the Phase 7/8 application RPCs that enforce the above checks.

## Security boundaries

- Browser uses publishable Supabase credentials only.
- Service-role credentials remain server/Edge Function only.
- Application tables remain RLS protected.
- Workflow/signing lifecycle transitions use approved RPC/Edge Function paths.
- Development mode never fakes `auth.uid()`.
- Workflow reviews use immutable submitted versions.
- Raw signing invitation tokens are exchange-only and post-exchange sessions use `sessionStorage`.
- Raw workspace invitation tokens are hash-only server-side and pending-browser state uses `sessionStorage`.
- Calendar derives operational deadlines rather than duplicating them.
- Search checks workspace membership server-side.
- Private binary storage stays private/workspace-first.
- `signing_tokens` intentionally has no direct browser-access policy.

## Performance/advisor policy

Advisor output is reviewed regularly, but low/no-traffic `unused_index` notices do not justify deleting integrity, relationship or future-scale indexes. Inherited RLS init-plan and multiple-permissive-policy warnings are Phase 10 hardening candidates and must be changed only with regression/security verification.

## Repository parity

The repository must continue to contain:

1. every applied migration required to reproduce live schema;
2. source for every deployed Edge Function;
3. generated types matching live schema;
4. application helpers matching current RLS/storage/RPC contracts;
5. permanent phase documentation;
6. no temporary write/autofix workflow after its one-shot purpose is complete.

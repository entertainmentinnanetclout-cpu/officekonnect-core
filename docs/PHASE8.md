# OfficeKonnect Phase 8 — Notifications, Activity, Team, Workspace and Settings

Status: **Completed and validated**

Date: 2026-08-18

## Objective

Complete the operational administration layer without creating duplicate identity, role, notification, audit, workspace, subscription or settings engines.

Phase 8 reuses the existing Supabase foundation and adds only the narrowly required persistence/RPC boundaries for per-user broadcast notification state and secure pending workspace invitations.

## Live migrations

Applied to Supabase and checked into GitHub:

- `20260818082337_phase_8_notifications_team_workspace_activity`
- `20260818082454_phase_8_workspace_invitation_directory`
- `20260818084738_phase_8_activity_workspace_identity_hardening`

## Notifications

### Canonical model

`notifications` remains the canonical notification event table.

Phase 8 adds `notification_receipts` only for the missing per-user state of workspace-broadcast notifications (`notifications.user_id IS NULL`). Direct notifications continue to use `notifications.read_at`; broadcast notifications use the current user's receipt row.

RLS protects receipt rows so users can manage only their own read state.

### RPC boundary

Authenticated-only RPCs:

- `list_workspace_notifications`
- `count_unread_workspace_notifications`
- `mark_notification_read`
- `mark_all_workspace_notifications_read`

Anonymous execution is revoked. Each read operation verifies active-workspace membership.

### Product surfaces

- live header notification bell with unread badge and recent events;
- `/dashboard/notifications` full notification center;
- unread-only filtering;
- mark-one / mark-all read behavior;
- entity-aware navigation to documents, workflows, signing requests, tasks and Team.

Task assignment now creates a real in-app notification through a database trigger.

## Activity

Phase 8 does **not** add a duplicate workspace-activity table.

`list_workspace_activity` normalizes existing canonical event sources:

- `activity_logs`;
- `workflow_events`;
- `signing_events`.

Owner/admin users can inspect workspace-level activity. Other workspace members receive their own actor-scoped activity. Signing event hashes remain visible on the Activity surface.

Audit triggers were added to:

- tasks;
- calendar events;
- document templates;
- workspace members;
- workspaces;
- workspace invitations.

The final hardening migration updates the inherited `log_activity()` trigger function so rows from `workspaces` use their own `id` as the tenant/workspace scope instead of producing an unscoped audit row.

Surface: `/dashboard/activity`.

## Team and secure workspace invitations

### Canonical membership model retained

- `workspace_members` remains the only membership relation.
- `workspace_role` remains `owner`, `admin`, `member`, `viewer`.
- existing `private.has_workspace_role` remains the role hierarchy primitive.

### Pending invitation model

`workspace_invitations` stores only:

- workspace;
- normalized invited email;
- requested non-owner role;
- inviter;
- SHA-256 bearer-token hash;
- expiry;
- accepted/revoked metadata.

The raw bearer token is returned only when an invitation is created and is **never persisted in Postgres**.

Browser invite continuation uses `sessionStorage`, not persistent `localStorage`, and the pending token is removed after successful acceptance.

### Authorization invariants

- owner/admin may invite;
- admins cannot invite/promote/manage another admin;
- owner role cannot be invited through the normal invitation flow;
- workspace owner role cannot be changed or removed through member-management RPCs;
- assignees/invitees must resolve through authenticated user/workspace rules;
- invitation acceptance verifies the authenticated profile email against the invitation email;
- expired/revoked/accepted invitations cannot be reused.

Authenticated-only RPCs:

- `create_workspace_invitation`
- `list_workspace_invitations`
- `list_my_workspace_invitations`
- `accept_workspace_invitation_by_id`
- `accept_workspace_invitation`
- `revoke_workspace_invitation`
- `update_workspace_member_role`
- `remove_workspace_member`

Product surfaces:

- `/dashboard/team`
- `/invite/$token`

## Workspace administration

`workspaces`, `workspace_members`, `profiles.default_workspace_id` and `subscriptions` remain canonical.

Phase 8 adds `create_workspace(p_name)` as an atomic authenticated RPC that creates:

1. workspace;
2. owner membership;
3. free active subscription;
4. current user's default workspace.

`/dashboard/workspace` provides:

- workspace identity editing under existing RLS;
- company/logo/address fields;
- plan/subscription readout;
- workspace switching;
- workspace creation;
- direct Team administration link.

No replacement tenancy model was introduced.

## Settings

The former placeholder-heavy Settings page was replaced with production behavior.

### Real persisted/actionable settings

- General — profile identity and avatar.
- Workspace — real workspace summary and administration routes.
- Documents — canonical document/version behavior and live counts.
- PDF & Printing — actual deterministic document/Sheet export behavior rather than unused fake preferences.
- Notifications — real unread state and notification-center link.
- Signatures — create, default and delete reusable signatures.
- Templates — live template count and management route.
- Security — password update and sign-out-other-sessions.
- Appearance — persisted `profiles.preferences.theme` with system/light/dark application.
- Integrations — only real `user_integrations` records; real disconnect action; no fake Connect button.
- Billing — real `subscriptions` record; no fake upgrade/checkout action when no provider checkout exists.
- Developer — non-secret user/workspace/project identifiers only.
- Account — authenticated RLS-scoped personal-data export.

The old disabled **Delete Account** control is removed. Account deletion requires an explicit production retention/ownership/audit policy before a destructive workflow can be advertised.

## Shell and routes

Canonical shell administration links are active:

- `/dashboard/notifications`
- `/dashboard/team`
- `/dashboard/activity`
- `/dashboard/workspace`
- `/dashboard/settings`

The header bell is live rather than a Phase 8 placeholder.

The root authentication boundary allows `/invite/*` to preserve a pending invitation across sign-in while keeping normal protected routes and the existing dashboard development-session boundary intact.

## Generated types and parity

Live Supabase TypeScript generation was re-run after Phase 8 and the repository types were reconciled with:

- `notification_receipts`;
- `workspace_invitations`;
- all Phase 8 RPC signatures.

Temporary route-tree, formatting and type-reconciliation write workflows were removed after use. No one-shot mutation workflow remains in the repository.

## Live security verification

Phase 8 tables retain RLS:

- `notification_receipts` — RLS enabled;
- `workspace_invitations` — RLS enabled;
- existing `notifications`, `activity_logs`, `workspace_members`, `workspaces`, `user_integrations` and `subscriptions` remain RLS-protected.

All new public application RPCs have anonymous `EXECUTE` revoked and authenticated execution explicitly granted.

Supabase's generic advisor warns when authenticated users can invoke a `SECURITY DEFINER` RPC. For these Phase 8 application RPCs this is intentional: the functions are the explicit authenticated application boundary and each performs the relevant `auth.uid()`, workspace membership, role or invited-email verification before privileged work.

The existing `signing_tokens` no-direct-policy advisor remains intentional because client access to signing tokens is prohibited by design. Leaked-password protection remains a later auth/security hardening item.

Low-traffic `unused_index` advisor output is not used as justification to remove protective or relationship indexes before meaningful production query statistics exist.

## No fabricated production data

After implementation verification:

- `notification_receipts`: 0 rows;
- `workspace_invitations`: 0 rows;
- `notifications`: 0 rows.

No sample users, invitations, notification receipts or fake operational metrics were inserted.

## Regression coverage

Phase 8 adds six contract tests covering:

1. per-user broadcast notification receipts and RLS;
2. hash-only expiring invitation tokens plus browser session scoping;
3. authenticated-only RPC ACLs;
4. owner/admin hierarchy protections;
5. canonical activity aggregation and workspace tenant-scope hardening;
6. active Phase 8 routes plus removal of Coming Soon/dead/fake Settings actions.

Combined suite: **39 tests / 0 failures** at the completed implementation checkpoint.

## Phase boundary

Phase 8 completes the requested operational administration layer. Phase 9 is product-wide UX/action/route hardening: eliminate remaining dead actions, broken links, poor states, responsive/accessibility defects and product-wide consistency issues without replacing the architecture completed in Phases 0–8.

# OfficeKonnect Changelog

## 2026-08-18 — Phase 8 completed

### Notifications

- Added RLS-protected `notification_receipts` so workspace-broadcast notifications have independent per-user read state.
- Added authenticated notification list/unread-count/mark-read/mark-all-read RPCs.
- Activated the live shell notification bell and `/dashboard/notifications` notification center.
- Added task-assignment notification production.

### Activity

- Activated `/dashboard/activity` over canonical `activity_logs`, `workflow_events` and `signing_events`.
- Added audit triggers for tasks, manual calendar events, document templates, workspace members, workspaces and workspace invitations.
- Hardened inherited `log_activity()` so `workspaces` rows use their own id as tenant/workspace scope.
- Preserved signing audit hashes and avoided a duplicate consolidated activity table.

### Team

- Added RLS-protected `workspace_invitations` pending-invitation model.
- Invitation bearer tokens are generated server-side, stored only as SHA-256 hashes and expire/revoke/accept terminally.
- Browser continuation uses `sessionStorage`; raw invite tokens are removed after acceptance.
- Added authenticated invitation create/list/accept/revoke RPCs.
- Added controlled member-role update and member-removal RPCs with owner/admin hierarchy protections.
- Activated `/dashboard/team` and public-auth-boundary `/invite/$token`.

### Workspace

- Activated `/dashboard/workspace` for identity, plan/subscription view, workspace switching and Team handoff.
- Added atomic authenticated `create_workspace` RPC: workspace + owner membership + free subscription + default workspace.
- Existing `workspaces`, `workspace_members`, `profiles.default_workspace_id` and `subscriptions` remain canonical.

### Settings

- Replaced Phase 8 placeholders with production General, Workspace, Documents, PDF & Printing, Notifications, Signatures, Templates, Security, Appearance, Integrations, Billing, Developer and Account surfaces.
- Appearance persists `profiles.preferences.theme`.
- Integrations show only real `user_integrations` records and real disconnect; no fake Connect action.
- Billing reflects the actual `subscriptions` record and exposes no fake checkout/upgrade action.
- Account provides authenticated RLS-scoped personal-data export.
- Removed the disabled account-deletion control until a real ownership/retention/audit deletion contract exists.

### Shell / route integration

- Activated Notifications, Team, Activity and Workspace administration navigation.
- Replaced disabled notification bell with live unread-count UI.
- Preserved dashboard development-session and external-signing auth boundaries while allowing secure workspace invite continuation through sign-in.

### Live migrations

- `20260818082337_phase_8_notifications_team_workspace_activity`
- `20260818082454_phase_8_workspace_invitation_directory`
- `20260818084738_phase_8_activity_workspace_identity_hardening`

### Generated types / parity

- Regenerated live Supabase TypeScript contract after Phase 8.
- Reconciled `notification_receipts`, `workspace_invitations` and Phase 8 RPC signatures into repository types.
- Removed all temporary route-tree, formatting and generated-type write workflows after one-shot use.

### Security / architecture

- No duplicate identity, membership, notification, audit or tenancy engine was created.
- New public application RPCs revoke anonymous execution and explicitly grant authenticated execution.
- Authenticated SECURITY DEFINER application RPCs retain explicit `auth.uid()`, membership, role and/or invited-email checks.
- `notification_receipts` and `workspace_invitations` retain RLS.
- No fake Phase 8 rows were inserted; verification showed zero notifications, invitation rows and notification receipts.
- Low-traffic unused-index advisor output is retained for later evidence-based Phase 10 performance work rather than used for premature index deletion.

### Regression coverage

- Added six Phase 8 operational/security contract tests.
- Combined substantive checkpoint: **39 tests / 0 failures**.

### Validation

The substantive Phase 8 implementation checkpoint passed:

- Repository parity ✅
- Frozen `bun ci` ✅
- ESLint ✅ — 0 errors
- TypeScript ✅
- **39 tests / 0 failures** ✅
- Production client/SSR/Nitro build ✅

The final hardening/documentation head receives the same read-only gate before Phase 8 is formally closed.

Vercel/deployment-platform validation remains intentionally deferred until Phase 11.

## 2026-08-18 — Phases 6 and 7 completed

### Phase 6 — Production E-Signatures

- Added production signing dashboard, PDF preparation workspace, authenticated internal signing and external short-lived-session signing.
- Added participant roles/order, normalized signing fields, consent, cancellation, invitation rotation, finalization retry, audit timeline, final PDF and certificate access.
- Native Documents and Sheets now use **Send for signature** through deterministic immutable PDF signing copies.
- Removed obsolete privileged `signing-public.functions.ts`.
- Live `signing-finalize` is version 2 with generic `OfficeKonnect Signing Certificate` branding and JWT enforcement.

### Phase 7 — Tasks, Calendar and Global Search

- Applied `20260818062157_phase_7_tasks_calendar_search` and `20260818080155_phase_7_rpc_execute_acl_hardening`.
- Added RLS-protected Tasks and manual Calendar persistence.
- Activated aggregate Calendar using derived task/workflow/signing dates.
- Added membership-checked global search, `/dashboard/search` and Ctrl/Cmd+K command search.
- Revoked anonymous execution from `search_workspace_objects` and `list_workspace_member_directory`.

### Validation

Final Phase 6/7 checkpoint passed repository parity, frozen install, ESLint, TypeScript, **33 tests / 0 failures**, and production build.

## 2026-08-18 — Phase 5 completed

- Activated production Workflows, immutable review, Approvals work queue, template builder, decisions, comments, reassignment, cancellation, Request Changes and optimistic-concurrency resubmission.
- Reused the recovered server-authoritative workflow backend; no replacement workflow engine or fake production data.
- Clean validation passed with **24 tests / 0 failures**.

## 2026-08-18 — Phase 4 completed

- Activated Files and Templates over canonical `documents`, private Storage and `document_templates`.
- Added nested folders, favourites, workspace-internal shares, upload/move/duplicate/lifecycle operations and hierarchy-cycle protection.
- Applied live Phase 4 organization migrations.
- Clean validation passed with **19 tests / 0 failures**.

## 2026-08-18 — Phase 3 completed

- Activated production OfficeKonnect Sheets over the canonical workbook JSON model.
- Added deterministic formulas, multi-sheet editing, XLSX/XLS/CSV interoperability, PDF/Print and signing-copy integration.

## 2026-08-17 — Phase 0 started

- Created the canonical upgrade branch, architecture/status/roadmap/handoff documentation and live-backend reconciliation workstream.
- Identified/recovered missing migrations, deployed signing sources, generated types, Storage path mismatch and stale signing helper contracts.

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
- pdf-lib for deterministic PDF work
- xlsx for XLSX/XLS/CSV interoperability

### Server application layer

TanStack Start server functions and authenticated Supabase RPCs provide application operations. Browser code never receives a service-role credential and never replaces `auth.uid()` or live RLS with a fabricated identity.

### Supabase

- Auth identity/JWT
- Postgres persistence
- RLS
- private helper schema for state-machine internals
- workspace-partitioned private Storage
- authenticated RPCs for controlled transitions/administration/search
- Edge Functions for signing actions, external signing sessions and finalization

## Workspace isolation

Canonical private-resource path:

```text
{workspace_id}/{user_id}/{resource...}
```

Workspace membership remains canonical in `workspace_members`; `workspace_role` remains owner/admin/member/viewer and the existing role hierarchy remains authoritative.

## Documents and Sheets

`documents` is the canonical current-state record for uploaded files, native documents and spreadsheets. `document_versions` stores immutable snapshots. Structured native content uses JSONB and optimistic `editor_version` concurrency.

Spreadsheet records remain normal `documents` rows with `document_kind='spreadsheet'` and authoritative workbook content `{ "kind": "workbook", "schemaVersion": 1, ... }`. XLSX/CSV are interoperability formats, not persistence.

Native Documents/Sheets use deterministic PDF output. Static signing copies become normal private PDF document/version identities before entering signing.

## Files and Templates

Files organize `documents`; they do not create a second binary store:

- `workspace_folders`
- `document_folder_items`
- `document_favorites`
- `document_shares`

Folder moves are relational and keep Storage paths stable. `document_templates` remains the canonical native document/spreadsheet template system; Mail Center email templates remain separate.

Phase 10 adds composite-FK covering indexes only; it does not change file identity/storage semantics.

## Workflows and Approvals

Canonical workflow relations remain:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_runs`
- `workflow_steps`
- `workflow_step_assignees`
- `workflow_decisions`
- `workflow_comments`
- `workflow_events`
- `workflow_work_queue`

Lifecycle transitions remain server-authoritative. Workflow start snapshots an immutable `document_versions` submission. Review renders that snapshot; Request Changes returns to mutable working content and re-enters review only through controlled resubmission.

## Production E-Signatures

Canonical signing backend remains:

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

Internal completion validates authenticated participant identity, eligibility/order, locked hashes, required fields and consent. External raw invitation tokens are exchange-only; `/sign/active` uses a short-lived session token stored in `sessionStorage`.

### Finalization renderer

`supabase/functions/_shared/signing-pdf.ts` is the shared signing-field PDF renderer used by both automated integration tests and production finalization.

It validates:

- finite normalized geometry;
- 0..1 page bounds;
- valid immutable source-page references;
- required signature/initial image presence.

It renders signature/initial images and text/date values into the immutable source PDF.

`signing-finalize` remains the only completed-PDF/certificate generator. **Live version 3 is ACTIVE and JWT protected**. It preserves the existing claim/complete/fail RPC state machine, source/final SHA-256 hashes, private `exports` storage and generic `OfficeKonnect Signing Certificate`.

A deterministic real three-page PDF integration test exercises the same renderer before deployment.

## Tasks / Calendar / Search

- `tasks` remains the only lightweight task persistence relation and does not replace Workflows.
- `calendar_events` stores only manual office events; task/workflow/signing dates are derived read-only from canonical source modules.
- `search_workspace_objects` remains the server-side membership-checked global-search boundary over the active workspace.
- no search-copy table/index exists.

## Notifications

`notifications` remains the canonical event row.

Direct notification rows use their own `read_at`. Workspace-broadcast rows use RLS-protected `notification_receipts` keyed by `(notification_id,user_id)` so each member gets independent read state without copying notification payloads.

Canonical notification RPCs remain:

- `list_workspace_notifications`
- `count_unread_workspace_notifications`
- `mark_notification_read`
- `mark_all_workspace_notifications_read`

## Activity and audit

OfficeKonnect does not maintain a duplicate consolidated activity table.

`list_workspace_activity` normalizes canonical ledgers at read time:

- `activity_logs`
- `workflow_events`
- `signing_events`

Audit triggers cover tasks, manual calendar events, templates, memberships, workspaces and invitations. Workspace-row audit entries explicitly use the workspace row id as tenant scope.

## Team and workspace invitations

`workspace_members` remains the actual membership relation. `workspace_invitations` stores pending invitations only.

Invitation rows contain normalized invited email, requested non-owner role, inviter, SHA-256 token hash and expiry/accept/revoke state. Raw tokens are generated server-side, returned once, never persisted in Postgres, retained across sign-in only in browser `sessionStorage`, and removed after acceptance.

Owner/admin hierarchy rules remain enforced by the authenticated invitation/member-management RPCs.

## Workspace tenancy and Settings

Existing `workspaces`, `workspace_members`, `profiles.default_workspace_id` and `subscriptions` remain canonical. `create_workspace` atomically creates workspace, owner membership, free subscription and default-workspace selection.

Settings persists only real enforced state. Current real surfaces use:

- `profiles` + avatar Storage;
- `workspaces` / Team;
- deterministic document/PDF behavior;
- notification RPCs;
- `user_signatures` + signatures Storage;
- `document_templates`;
- Supabase Auth password/session operations;
- `profiles.preferences.theme`;
- `user_integrations`;
- `subscriptions`;
- authenticated RLS-visible account export.

## Phase 9 product-hardening contract

`scripts/check-product-hardening.mjs` is a permanent release gate. It rejects internal upgrade/PR wording in source, user-visible implementation/debug residue, V1 residue, raw debug logging, native `alert()` usage, exact dead links, dashboard hard reload anchors, browser-exposed service-role patterns and persistent token/secret storage.

Dashboard KPIs are active-workspace scoped and based on real records only. Cross-module internal navigation uses TanStack routing rather than hard reloads where appropriate.

## Phase 10 security boundary contract

`scripts/check-security-boundaries.mjs` is a permanent gate.

It distinguishes `.server.*` modules from browser-capable source and verifies:

- no service-role reference in browser-capable application code;
- server-only admin client reads service-role key server-side with `persistSession:false`;
- no secret-shaped public/Vite environment variable;
- no credential-like `localStorage` persistence;
- `.env` hygiene;
- development-session production guards;
- workspace-invitation `sessionStorage` boundary;
- external signing exchange/session RPC markers and HMAC behavior;
- absence of obsolete `signing-public.functions.ts`.

`signing-external` remains the intentional exception to Edge Function JWT verification because it performs its own one-time invitation exchange and short-lived session authentication. This exception must not be generalized.

## Automated test and CI architecture

Unit/integration tests are isolated from browser specs:

```text
bun test src tests
```

Current suite: **42 tests**.

Browser E2E uses `playwright.config.ts` + `e2e/` and a pinned Playwright 1.62.1 CI runner. Chromium coverage currently validates landing metadata/runtime, login controls, mobile auth usability and public Privacy/Terms routes.

Permanent Upgrade Validation is read-only (`contents: read`) and runs:

1. repository parity;
2. frozen `bun ci`;
3. ESLint;
4. product-hardening audit;
5. security-boundary audit;
6. TypeScript;
7. 42 unit/integration tests;
8. production client/SSR/Nitro build;
9. production asset budget;
10. pinned Playwright + Chromium setup;
11. browser E2E.

No temporary write/autofix workflow remains permanent CI.

## Performance policy

`scripts/check-build-budget.mjs` enforces per-asset budgets:

- JavaScript <= 640 KiB;
- CSS <= 150 KiB.

Live Phase 10 migration `20260818101750_phase_10_files_fk_covering_indexes` adds covering indexes for Phase 4 composite foreign keys. The Supabase advisor no longer reports unindexed foreign keys.

Advisor output remains evidence, not an automatic deletion/change instruction. Inherited RLS init-plan warnings, multiple-permissive-policy warnings and low-traffic unused-index INFO notices require targeted regression/security review before modification.

## SECURITY DEFINER application boundary

Selected public RPCs intentionally use `SECURITY DEFINER` for controlled cross-table operations.

Required rules:

1. restricted `search_path`;
2. anonymous `EXECUTE` revoked unless an explicit custom public protocol requires otherwise;
3. authenticated execution only for intended application RPCs;
4. `auth.uid()`, membership, role and/or invited-email verification inside the function;
5. client cannot supply arbitrary privileged identity.

Supabase's generic authenticated-SECURITY-DEFINER warning is therefore reviewed function-by-function rather than removed by weakening or disabling the application boundary.

## Security/advisor residuals

- `signing_tokens` intentionally has RLS enabled with no direct client policy.
- Authenticated SECURITY DEFINER warnings remain for reviewed controlled RPCs.
- Supabase leaked-password protection remains disabled pending a safe Auth-configuration mutation path.
- inherited RLS init-plan and multiple-permissive-policy warnings remain for targeted future optimization.
- unused-index INFO notices are not evidence to delete integrity/relationship/future-scale indexes prematurely.

## Repository parity

The repository must continue to contain:

1. every applied migration required to reproduce live schema;
2. source for every deployed Edge Function;
3. generated types matching live schema;
4. application helpers matching current RLS/storage/RPC contracts;
5. permanent phase documentation;
6. read-only permanent CI and no temporary write workflow after one-shot reconciliation is complete.

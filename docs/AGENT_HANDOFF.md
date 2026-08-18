# OfficeKonnect Agent Handoff

## Active branch

`phase-0-canonical-reconciliation`

## Long-running PR

Draft PR #2 carries the complete OfficeKonnect Phases 0–11 upgrade. **Do not merge yet.** `main` must remain unchanged until Phase 11 release-candidate, deployment-platform, security and end-to-end QA all pass.

Vercel/deployment-platform validation is intentionally deferred until Phase 11.

## Current status

- Phase 0 — Canonical reconciliation: completed.
- Phase 1 — Development identity/application shell: completed.
- Phase 2 — Documents/native editor/PDF: completed.
- Phase 3 — OfficeKonnect Sheets: completed.
- Phase 4 — Files/Templates: completed.
- Phase 5 — Workflows/Approvals: completed.
- Phase 6 — Production E-Signatures: completed.
- Phase 7 — Tasks/Calendar/Global Search: completed.
- Phase 8 — Notifications/Activity/Team/Workspace/Settings: completed and validated.
- Phase 9 — Product-wide UX/route hardening: completed and validated.
- Phase 10 — Security/performance/automated testing/CI: completed, live-backend reconciled and validated.
- **Next: Phase 11 — Release Candidate and Documentation.**

## Do not do

- Do not reset production.
- Do not merge Draft PR #2 before Phase 11 passes.
- Do not create replacement document, spreadsheet, file, template, workflow, signing, task, calendar, search, role, notification, audit, tenancy or storage engines.
- Do not weaken RLS to make client code work.
- Do not expose service-role credentials to browser-capable source.
- Do not delete Mail, Contacts or Voice.
- Do not mutate/squash historical applied migrations.
- Do not replace workbook JSON persistence with XLSX-native persistence.
- Do not physically relocate private Storage binaries during ordinary folder moves.
- Do not directly write workflow/signing lifecycle states owned by RPCs/Edge Functions.
- Do not review mutable document content as a submitted workflow version.
- Do not reintroduce `signing-public.functions.ts`.
- Do not retain raw external-signing invitations after exchange.
- Do not store raw workspace invitation tokens in Postgres or persistent browser storage.
- Do not duplicate derived task/workflow/signing dates into `calendar_events`.
- Do not create a duplicate search-copy database/index.
- Do not grant anonymous execution to authenticated application RPCs.
- Do not introduce fake Connect/checkout/account-delete/preferences or fabricated KPIs.
- Do not remove integrity/relationship/future-scale indexes solely because low-traffic advisor statistics mark them unused.
- Do not leave temporary write/autofix workflows in permanent CI.

## Live backend

Supabase project: `ydgsmnzcwkrlghlhtpgq`.

Private resource Storage remains workspace-first.

### Applied upgrade migrations of note

Phase 4:

- `20260818051912_phase_4_files_templates_workspace_organization`
- `20260818052526_phase_4_folder_hierarchy_cycle_guard`

Phase 7:

- `20260818062157_phase_7_tasks_calendar_search`
- `20260818080155_phase_7_rpc_execute_acl_hardening`

Phase 8:

- `20260818082337_phase_8_notifications_team_workspace_activity`
- `20260818082454_phase_8_workspace_invitation_directory`
- `20260818084738_phase_8_activity_workspace_identity_hardening`

Phase 10:

- `20260818101750_phase_10_files_fk_covering_indexes`

### Live signing Edge Functions

- `signing-actions` — ACTIVE, JWT required.
- `signing-external` — ACTIVE, JWT intentionally disabled for its custom invitation/session exchange contract.
- `signing-finalize` — **ACTIVE version 3, JWT required**.

The version 3 finalizer consumes the same `supabase/functions/_shared/signing-pdf.ts` renderer exercised by Phase 10's deterministic real three-page PDF integration tests.

## Canonical product contracts

### Documents / Sheets / Files / Templates

- `documents` — current native/uploaded/Sheet state.
- `document_versions` — immutable version ledger and workflow/signing snapshots.
- `document_templates` — native document/spreadsheet templates.
- `workspace_folders` + `document_folder_items` — relational organization only.
- `document_favorites` — user-specific.
- `document_shares` — workspace-internal view markers.
- workbook persistence remains `{kind:"workbook",schemaVersion:1,...}`.

### Workflows

Canonical relations remain `workflow_templates`, `workflow_template_steps`, `workflow_runs`, `workflow_steps`, `workflow_step_assignees`, `workflow_decisions`, `workflow_comments`, `workflow_events` and `workflow_work_queue`.

Lifecycle/comment/reassignment/cancellation/resubmission RPCs remain authoritative. Submitted review content is an immutable document version.

### Signing

Canonical relations remain `signing_requests`, `signing_participants`, `signing_fields`, `signing_tokens`, `signing_events`, `signing_certificates` and private signing sessions.

External raw tokens are exchange-only. Active external signing uses short-lived `sessionStorage` sessions. `signing-finalize` remains the only completed-PDF/certificate generator.

### Tasks / Calendar / Search

- `tasks` remains the lightweight task table.
- `calendar_events` stores manual events only; operational dates are derived.
- `search_workspace_objects` remains the membership-checked Global Search RPC.

### Notifications / Activity / Team / Workspace

- `notifications` remains canonical; `notification_receipts` stores per-user broadcast read state only.
- `list_workspace_activity` aggregates `activity_logs`, `workflow_events`, `signing_events`; no duplicate consolidated activity table.
- `workspace_members` remains actual membership; `workspace_invitations` is pending invitation state only.
- workspace invitation raw tokens are hash-only server-side and session-scoped in browser continuation.
- `workspaces`, `profiles.default_workspace_id` and `subscriptions` remain canonical tenancy/subscription state.

## Phase 9 hardening checkpoint

Code checkpoint:

`42c4dbd3e4c66f0570ec19c5ad6246bc39e3bb64`

Upgrade Validation:

`32125480383`

Phase 9 removed fabricated dashboard metrics/dead controls/internal release language, hardened internal navigation and accessibility, and established permanent `scripts/check-product-hardening.mjs`.

See `docs/PHASE9.md`.

## Phase 10 security/performance/testing contract

### Permanent audits

- `scripts/check-product-hardening.mjs`
- `scripts/check-security-boundaries.mjs`
- `scripts/check-build-budget.mjs`

The security audit separates server-only `.server.*` code from browser-capable source and verifies service-role, environment, session-token, development-session and external-signing boundaries.

### Tests

Unit/integration command:

```text
bun test src tests
```

Current result: **42/42 pass**.

`tests/signing-finalization-pdf.integration.test.ts` creates a deterministic real three-page PDF and exercises the same shared renderer used by production finalization.

Browser E2E:

- `playwright.config.ts`
- `e2e/public-routes.spec.ts`
- pinned Playwright 1.62.1 CI runner
- Chromium

Current result: **4/4 pass** covering landing/runtime, login, mobile auth and public Privacy/Terms routes.

### Performance

Per-asset budgets:

- JavaScript <= 640 KiB;
- CSS <= 150 KiB.

The Phase 10 FK covering-index migration clears the Supabase `unindexed_foreign_keys` advisor category.

### Permanent Upgrade Validation

`.github/workflows/phase0-deterministic-validation.yml` is read-only (`contents: read`) and must stay that way unless the user explicitly authorizes another scoped reconciliation.

It gates:

- parity;
- frozen `bun ci`;
- lint;
- product audit;
- security audit;
- TypeScript;
- 42 unit/integration tests;
- production client/SSR/Nitro build;
- asset budget;
- pinned Playwright/Chromium setup;
- 4 browser E2E tests.

Validated Phase 10 source checkpoint:

`ddb2edf65ef07da6d4ae5bcaa2a6129966a46c3d`

Upgrade Validation:

`32129565222`

## Supabase advisor interpretation after Phase 10

Do not claim zero warnings.

Security residuals:

- `signing_tokens` RLS/no-policy notice is intentional; direct client access remains prohibited.
- authenticated `SECURITY DEFINER` warnings remain for controlled application RPCs that perform internal authentication/membership/role/invited-email checks.
- leaked-password protection remains disabled; changing it requires a safe Auth-configuration mutation path.

Performance residuals:

- inherited RLS init-plan warnings remain;
- multiple-permissive SELECT warnings remain on older tables;
- unused-index INFO notices remain, including newly added covering indexes before meaningful production traffic exists.

Do not weaken RLS or drop indexes merely to make advisor counts look cleaner.

## Phase 11 focus

Phase 11 should now be the release-candidate phase, not another broad feature build:

1. run Vercel/deployment-platform validation;
2. validate the canonical create → review → changes → resubmit → approve → sign → finalize journey;
3. verify all public/auth/dashboard routes and deployment environment boundaries;
4. recheck live Supabase migrations, Edge Functions, RLS/advisor state and generated types;
5. complete release/handoff documentation;
6. run the full permanent read-only CI gate on the final release head;
7. only then decide whether Draft PR #2 can be marked ready and merged.

Keep PR #2 Draft/open/unmerged until every Phase 11 release condition passes.

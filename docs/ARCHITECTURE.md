# OfficeKonnect Architecture

## Architectural rule

Preserve and extend the existing Supabase data model and server-authoritative state machines. Do not create parallel document-version, spreadsheet, file, template, workflow, signing, task, calendar, search, role, notification, audit, tenancy or storage systems unless a demonstrated gap requires a narrowly additive model.

## Runtime layers

### Client

- React 19
- TanStack Router / Start / Query
- TypeScript
- Tailwind / Radix UI
- PDF.js/react-pdf
- `react-rnd` for normalized signing-field preparation
- `react-signature-canvas` for signature capture
- `pdf-lib` for deterministic PDF work
- `xlsx` for XLSX/XLS/CSV interoperability

### Server application layer

TanStack Start server functions and authenticated Supabase RPCs provide application operations. Browser code never receives service-role credentials and never replaces `auth.uid()` or live RLS with fabricated identity.

### Supabase

- Auth identity/JWT
- Postgres persistence and RLS
- private helper schema for state-machine internals
- workspace-partitioned private Storage
- authenticated RPCs for controlled transitions/administration/search
- Edge Functions for signing actions, external signing sessions and finalization

## Workspace isolation

Canonical private-resource path:

```text
{workspace_id}/{user_id}/{resource...}
```

`workspace_members` is the canonical membership relation. The owner/admin/member/viewer hierarchy remains authoritative.

## Documents and Sheets

`documents` is canonical current state for uploaded files, native documents and spreadsheets. `document_versions` stores immutable snapshots. Structured content uses JSONB and optimistic `editor_version` concurrency.

Spreadsheets remain `documents` rows with `document_kind='spreadsheet'` and workbook content `{ "kind": "workbook", "schemaVersion": 1, ... }`. XLSX/CSV are interoperability formats, not persistence.

Native Documents/Sheets produce deterministic PDF. Signing copies become private immutable PDF document/version identities before signing.

## Files and Templates

Files organize `documents`; they do not create a second binary store:

- `workspace_folders`
- `document_folder_items`
- `document_favorites`
- `document_shares`

Folder moves remain relational and keep Storage paths stable. `document_templates` remains canonical for native document/spreadsheet templates. Mail Center email templates remain separate.

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

Lifecycle transitions remain server-authoritative. Workflow start snapshots an immutable `document_versions` submission. Request Changes returns to mutable working content, then re-enters review only through `resubmit_document_workflow` with optimistic editor-version concurrency.

Release-critical RPCs verified live in Phase 11:

- `start_document_workflow`
- `submit_workflow_decision`
- `resubmit_document_workflow`

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
→ normalized field preparation
→ secure send
→ participant completion
→ signing-finalize
→ final PDF + certificate
```

Internal completion validates authenticated participant identity, eligibility/order, locked hashes, required fields and consent. External raw invitations are exchange-only; active external signing uses a short-lived session token in `sessionStorage`.

`supabase/functions/_shared/signing-pdf.ts` is the shared signing-field renderer used by deterministic integration tests and production finalization. It validates normalized geometry/source-page references and renders signature/initial images plus text/date values into the immutable source PDF.

`signing-finalize` is the only completed-PDF/certificate generator. **Live version 3 is ACTIVE and JWT protected**. It preserves claim/complete/fail finalization state, source/final SHA-256 hashes, private exports and the generic `OfficeKonnect Signing Certificate`.

`signing-external` intentionally does not use Edge JWT verification because it implements one-time invitation exchange and short-lived session authentication itself. This exception must not be generalized.

Release-critical signing RPCs verified live in Phase 11:

- `exchange_signing_token`
- `get_signing_session_payload`
- `complete_external_signing_session`
- `claim_signing_finalization`
- `complete_signing_finalization`
- `fail_signing_finalization`

## Tasks / Calendar / Search

- `tasks` remains lightweight task persistence and does not replace Workflows.
- `calendar_events` stores manual office events only; task/workflow/signing dates are derived from canonical modules.
- `search_workspace_objects` remains the membership-checked workspace search boundary.
- no search-copy table/index exists.

## Notifications / Activity / Team / Workspace / Settings

- `notifications` remains canonical; `notification_receipts` stores per-user broadcast read state only.
- `list_workspace_activity` normalizes `activity_logs`, `workflow_events` and `signing_events`; no duplicate activity ledger exists.
- `workspace_members` remains actual membership; `workspace_invitations` stores pending invitation state only.
- invitation raw tokens are generated once, hashed in Postgres and only session-scoped in browser continuation.
- `workspaces`, `profiles.default_workspace_id` and `subscriptions` remain canonical tenancy/subscription state.
- Settings persists only real enforced state through existing profile/workspace/auth/signature/template/integration/subscription infrastructure.

## Permanent release audits

### Phase 9 product hardening

`scripts/check-product-hardening.mjs` rejects internal upgrade/PR wording, user-visible implementation/debug residue, V1 residue, raw debug logging/native alert use, exact dead links, dashboard hard reload anchors, browser service-role patterns and persistent token/secret storage.

### Phase 10 security boundary

`scripts/check-security-boundaries.mjs` distinguishes server-only `.server.*` code from browser-capable source and verifies service-role/environment/session/development-signing boundaries and absence of obsolete privileged signing paths.

### Phase 11 release candidate

`scripts/check-release-candidate.mjs` verifies:

- required release docs and product-route modules;
- generated route-tree coverage;
- canonical workflow start/decision/resubmit source chain;
- immutable PDF signing-copy path;
- signing draft/actions/external exchange/finalizer source chain;
- shared production signing renderer;
- environment hygiene;
- exactly one permanent workflow;
- no `contents: write` CI;
- the complete permanent validation command set.

## Automated tests and CI

Unit/integration command:

```text
bun test src tests
```

Current Phase 11 technical RC suite: **45 tests / 0 failures**.

The suite includes deterministic real three-page signing-PDF integration plus Phase 11 release-journey/state/route-registry contract tests.

Browser E2E uses `playwright.config.ts` + `e2e/` and pinned Playwright 1.62.1 with the Chrome/Chromium executable provisioned by the GitHub runner. Current result: **4/4 browser tests pass**.

Permanent Upgrade Validation is PR-driven, read-only (`contents: read`) and runs:

1. repository parity;
2. frozen `bun ci`;
3. ESLint;
4. product-hardening audit;
5. security-boundary audit;
6. release-candidate audit;
7. TypeScript;
8. 45 unit/integration tests;
9. production client/SSR/Nitro build;
10. production asset budget;
11. pinned Playwright runner + runner Chrome;
12. browser E2E.

The obsolete write-capable `phase0-record-validation.yml` was removed in Phase 11. No permanent write/autofix workflow remains.

## Performance policy

`scripts/check-build-budget.mjs` enforces:

- JavaScript <= 640 KiB per client asset;
- CSS <= 150 KiB per client asset.

Live migration `20260818101750_phase_10_files_fk_covering_indexes` adds covering indexes for Phase 4 composite foreign keys. Advisor output remains evidence, not an automatic deletion/change instruction.

## Live release posture

Phase 11 non-mutating verification confirms:

- 51 public application tables;
- 51/51 public application tables have RLS enabled;
- 48 live migrations;
- latest live migration `20260818101750`;
- all nine release-critical workflow/signing RPCs listed above are present;
- `signing-actions`, `signing-external`, and `signing-finalize` are ACTIVE; finalizer is version 3.

## Advisor interpretation

Do not claim zero warnings.

- `signing_tokens` intentionally has RLS enabled with no direct client policy.
- authenticated `SECURITY DEFINER` warnings remain for controlled RPCs that perform internal auth/membership/role/email verification.
- Supabase leaked-password protection remains disabled pending an Auth configuration change.
- inherited RLS init-plan and a small number of multiple-permissive-policy warnings remain for targeted optimization.
- unused-index INFO notices do not justify deleting integrity/relationship/future-scale indexes without workload evidence.

## Repository parity / release governance

The repository must continue to contain applied migration history, deployed Edge Function source, generated types, RLS/storage/RPC-aligned helpers, permanent phase documentation and **one read-only validation workflow only**.

Phase 11 technical RC checkpoint: `1b7ee8bc4536eab418c7114df38f4e1e7775c76f` — Upgrade Validation `32153427170`, Vercel success.

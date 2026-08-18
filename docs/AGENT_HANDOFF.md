# OfficeKonnect Agent Handoff

## Active branch / PR

- Branch: `phase-0-canonical-reconciliation`
- Long-running release PR: Draft PR #2
- Base: `main`
- `main` remains unchanged at `7417834652de380100f24a93ac78f48f8787f89b` during the release-candidate process.

## Status

**Phases 0–11 are implemented.**

Phase 11 technical RC checkpoint:

- SHA `1b7ee8bc4536eab418c7114df38f4e1e7775c76f`
- Upgrade Validation `32153427170`
- Vercel `success`
- 45/45 unit/integration tests
- 4/4 browser E2E tests
- release/product/security audits, TypeScript, production build and asset budget all green

The final documentation-only head must pass the same permanent gate. Its exact SHA/run should be recorded in PR #2 rather than creating a self-referential docs commit.

## Do not do

- Do not reset production.
- Do not auto-merge PR #2.
- Do not create replacement document, spreadsheet, file, template, workflow, signing, task, calendar, search, role, notification, audit, tenancy or storage engines.
- Do not weaken RLS to make client code work.
- Do not expose service-role credentials to browser-capable source.
- Do not mutate/squash historical applied migrations.
- Do not directly write workflow/signing lifecycle states owned by RPCs/Edge Functions.
- Do not review mutable document content as a submitted workflow version.
- Do not reintroduce obsolete privileged signing paths.
- Do not retain raw external-signing invitations after exchange.
- Do not store workspace invitation tokens in Postgres or persistent browser storage.
- Do not duplicate derived task/workflow/signing dates into manual calendar persistence.
- Do not create duplicate search/activity/notification systems.
- Do not remove indexes solely because low-traffic advisor data marks them unused.
- Do not add write-capable CI to permanent validation without explicit authorization.

## Live backend release posture

Supabase project: `ydgsmnzcwkrlghlhtpgq`.

Phase 11 non-mutating verification:

- 51 public application tables
- 51/51 RLS enabled
- 48 live migrations
- latest migration `20260818101750`

Live signing functions:

- `signing-actions` — ACTIVE, JWT required
- `signing-external` — ACTIVE, custom invitation/session authentication
- `signing-finalize` — ACTIVE version 3, JWT required

Live release-critical workflow/signing RPCs confirmed:

- `start_document_workflow`
- `submit_workflow_decision`
- `resubmit_document_workflow`
- `exchange_signing_token`
- `get_signing_session_payload`
- `complete_external_signing_session`
- `claim_signing_finalization`
- `complete_signing_finalization`
- `fail_signing_finalization`

## Canonical release journey

```text
native document/workbook
→ immutable document version
→ workflow review
→ changes_requested when needed
→ optimistic-concurrency resubmit
→ workflow approval
→ immutable PDF Signing Copy
→ signing draft / participants / normalized fields
→ secure send
→ internal signer action or external token→session exchange
→ participant completion
→ signing-finalize
→ final PDF + certificate
```

Do not bypass any stage with direct status writes or a second engine.

## Permanent release controls

- `scripts/check-product-hardening.mjs`
- `scripts/check-security-boundaries.mjs`
- `scripts/check-release-candidate.mjs`
- `scripts/check-build-budget.mjs`
- `tests/signing-finalization-pdf.integration.test.ts`
- `tests/phase11.release-candidate.test.ts`
- `playwright.config.ts`
- `e2e/public-routes.spec.ts`

Permanent CI:

`.github/workflows/phase0-deterministic-validation.yml`

It is the **only** workflow and remains PR-driven with `contents: read`. It gates parity, frozen Bun install, lint, product/security/release audits, TypeScript, 45 unit/integration tests, production build, asset budget and 4 browser E2E tests.

## Advisor residuals

Do not claim zero warnings.

- `signing_tokens` has no direct client RLS policy intentionally.
- reviewed authenticated `SECURITY DEFINER` warnings remain for controlled app RPCs.
- leaked-password protection remains disabled pending Supabase Auth configuration.
- inherited RLS init-plan / small multiple-permissive-policy warnings remain.
- unused-index INFO notices are not automatic deletion instructions.

## Next action after final docs-head validation

No feature phase remains. The next step is a **human/reviewer release decision for Draft PR #2**. Keep it Draft/open/unmerged unless explicitly instructed to mark ready or merge.

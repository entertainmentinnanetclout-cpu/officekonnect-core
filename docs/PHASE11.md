# Phase 11 — Release Candidate and Documentation

Date: 2026-08-18

## Objective

Freeze OfficeKonnect as a release candidate after Phases 0–10, validate deployment and live Supabase contracts, prove the canonical document/workflow/signing journey remains wired end to end, remove release-governance residue and leave a complete handoff for Draft PR #2.

## Release-candidate rules

- Upgrade branch: `phase-0-canonical-reconciliation`.
- Release PR: Draft PR #2.
- `main` remains unchanged during validation.
- No destructive production reset, RLS weakening, duplicate engines or client-side service-role exposure.
- The technical RC and final documentation head must pass the full read-only Upgrade Validation gate and Vercel.

## Release governance completed

The obsolete `.github/workflows/phase0-record-validation.yml` was removed because it retained `contents: write`, old npm-based Phase 0 assumptions and branch write-back behavior.

The only permanent workflow is now `.github/workflows/phase0-deterministic-validation.yml`, PR-driven with `contents: read`.

Phase 11 added `scripts/check-release-candidate.mjs`, which fails CI if required docs/routes disappear, canonical workflow/signing source wiring drifts, environment hygiene regresses, a second workflow appears or write-capable permanent CI returns.

## Canonical journey QA

The release contract preserves one authoritative chain:

1. create/edit a native document or workbook through the existing engines;
2. submit an immutable document version into the existing workflow state machine;
3. review through `submit_workflow_decision`;
4. request changes through `changes_requested`;
5. resubmit through `resubmit_document_workflow` with optimistic editor-version concurrency;
6. approve through the same state machine;
7. create an immutable PDF `— Signing Copy`;
8. create/prepare/send the existing signing request with normalized fields;
9. use authenticated internal signer actions or exchange external invitation tokens into short-lived sessions;
10. complete participants through the existing signing state machine;
11. finalize through the single `signing-finalize` path and shared production renderer.

`tests/phase11.release-candidate.test.ts` locks this state/source/route contract. The existing deterministic three-page signing-PDF integration continues to exercise the same renderer used by the live finalizer.

## Live Supabase release reconciliation

Non-mutating release inspection confirms:

- 51 public application tables;
- 51/51 public application tables have RLS enabled;
- 48 recorded migrations;
- latest live migration `20260818101750`;
- `signing-actions` ACTIVE, JWT required;
- `signing-external` ACTIVE with its custom invitation-token/session authentication contract;
- `signing-finalize` ACTIVE version 3, JWT required.

The following required RPCs are installed live:

- `start_document_workflow`
- `submit_workflow_decision`
- `resubmit_document_workflow`
- `exchange_signing_token`
- `get_signing_session_payload`
- `complete_external_signing_session`
- `claim_signing_finalization`
- `complete_signing_finalization`
- `fail_signing_finalization`

## Advisor review

The release candidate intentionally does not claim a zero-warning Supabase advisor state.

Security residuals:

- `signing_tokens` has RLS with no direct policies by design because direct browser access is prohibited;
- authenticated `SECURITY DEFINER` warnings remain for controlled application RPCs that perform internal auth/membership/role/email checks;
- leaked-password protection remains disabled pending an Auth configuration change.

Performance residuals:

- inherited RLS init-plan warnings remain;
- a small number of multiple-permissive SELECT warnings remain;
- low-traffic unused-index INFO notices remain and are not used as justification to delete relationship/integrity/future-scale indexes without workload evidence.

## Technical release-candidate checkpoint

Authoritative technical RC source head:

`1b7ee8bc4536eab418c7114df38f4e1e7775c76f`

Upgrade Validation:

`32153427170`

Result:

- repository parity ✅
- frozen `bun ci` ✅
- ESLint ✅ — 0 errors, 7 inherited Fast Refresh warnings
- Phase 9 product-hardening audit ✅
- Phase 10 security-boundary audit ✅
- Phase 11 release-candidate audit ✅
- TypeScript ✅
- **45/45 unit/integration tests** ✅
- production client/SSR/Nitro build ✅
- production asset budget ✅
- pinned Playwright 1.62.1 + GitHub runner Chrome ✅
- **4/4 browser E2E tests** ✅
- Vercel ✅

## Final documentation-head rule

This file records the non-self-referential technical RC checkpoint. The exact final documentation-head SHA, final Upgrade Validation run and final Vercel status are recorded in Draft PR #2 after that docs-only head passes.

Until then PR #2 remains Draft/open/unmerged. After it passes, Phase 11 is complete and the PR is a release candidate awaiting an explicit reviewer/merge decision; it must not auto-merge.

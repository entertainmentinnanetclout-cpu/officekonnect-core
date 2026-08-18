# Phase 11 — Release Candidate and Documentation

Date: 2026-08-18

## Objective

Freeze OfficeKonnect as a release candidate after Phases 0–10, validate the deployment platform and live Supabase contract, prove the canonical document/workflow/signing journey remains wired end to end, remove release-governance residue, and leave a complete handoff record for the eventual merge of Draft PR #2.

## Release-candidate rules

- The upgrade remains on `phase-0-canonical-reconciliation` and Draft PR #2.
- `main` stays unchanged during Phase 11 validation.
- No destructive production reset, RLS weakening, duplicate engines or client-side service-role exposure is permitted.
- Vercel validation must succeed on the final release-candidate head.
- The final release-candidate head must pass the complete read-only Upgrade Validation workflow.

## Phase 11 work completed before final freeze

### Release governance

The obsolete `.github/workflows/phase0-record-validation.yml` workflow was removed. It retained `contents: write`, npm-based Phase 0 assumptions and branch write-back behavior that no longer belongs in the release architecture.

The permanent validation workflow is the only GitHub Actions release gate and remains `contents: read`.

### Live Supabase reconciliation

Non-mutating release inspection confirms:

- 51 public application tables;
- 51/51 public application tables have RLS enabled;
- 48 recorded migrations;
- latest live migration `20260818101750`;
- `signing-finalize` ACTIVE version 3 with JWT required;
- `signing-actions` ACTIVE with JWT required;
- `signing-external` ACTIVE with JWT intentionally disabled because the function implements the external invitation-token exchange and short-lived signing-session protocol itself.

The live `signing-external` implementation hashes invitation/session tokens, calls `exchange_signing_token` and `get_signing_session_payload`, completes through `complete_external_signing_session`, and invokes `signing-finalize` only after completion queues finalization.

### Deployment platform

GitHub's Vercel integration reports successful deployment status for the Phase 10 closure head and subsequent Phase 11 heads. The final release-candidate head must also report Vercel success before Phase 11 is closed.

### Canonical release journey

The release-candidate contract preserves one authoritative chain:

1. create/edit a native document or workbook using the existing document/workbook engines;
2. submit the immutable document version into the existing workflow state machine;
3. review through `submit_workflow_decision`;
4. request changes using the canonical `changes_requested` decision;
5. resubmit through `resubmit_document_workflow` with optimistic editor-version concurrency;
6. approve through the same workflow state machine;
7. generate an immutable PDF signing copy rather than signing mutable editor state;
8. create/prepare/send the existing signing request and normalized fields;
9. exchange external invitation tokens into short-lived sessions, or use authenticated internal signer actions;
10. complete participants and finalize through the single `signing-finalize` path;
11. produce the final PDF/certificate using the shared renderer already covered by the deterministic three-page integration test.

Phase 11 adds a permanent release-candidate source/route/governance audit and a release contract test so drift in this chain fails CI.

## Advisor review

The final release review intentionally does not claim a zero-warning Supabase advisor state.

### Security residuals

- `signing_tokens` has RLS with no direct policies by design because browser access is prohibited.
- Several authenticated `SECURITY DEFINER` RPCs remain callable by `authenticated`; these functions are intentional application APIs and perform their own authentication, workspace membership, role or invited-email checks.
- Supabase Auth leaked-password protection remains disabled; enabling it requires Auth project configuration rather than a database migration.

### Performance residuals

- inherited RLS init-plan warnings remain on older policies;
- a small set of multiple-permissive SELECT policy warnings remain;
- low-traffic unused-index INFO notices remain and are not used as justification to remove relationship/integrity/future-scale indexes without workload evidence.

These are documented residuals, not hidden release claims.

## Final closure gate

The authoritative Phase 11 release-candidate SHA, Upgrade Validation run and Vercel result are recorded here after the final documentation head passes. Until that entry is present, Draft PR #2 remains Draft/open/unmerged.

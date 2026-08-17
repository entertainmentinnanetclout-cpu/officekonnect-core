# OfficeKonnect Project Status

Last audited: 2026-08-17

## Current phase

Phase 0 — Canonical Repository ↔ Supabase Reconciliation.

## Source of truth policy

During Phase 0, the live Supabase project is treated as the authoritative description of already-deployed database behavior. GitHub must be brought forward to represent that behavior without destructive production changes. After reconciliation, GitHub migrations and checked-in Edge Function source become the reproducible source of truth for future changes.

## Confirmed architecture

- Frontend: React 19, TanStack Start/Router/Query, TypeScript, Tailwind, Radix UI.
- Backend: Supabase Auth, Postgres, RLS, Storage, RPCs and Edge Functions.
- Public application tables: 43; RLS enabled on all 43 at audit time.
- Private storage buckets include documents, document-versions, exports, letterheads, signatures and voice-notes.
- Existing backend foundations: native documents, structured versions, spreadsheets, workflows/review/approval, secure e-signing, notifications, activity logs and workspace membership.

## Phase 0 critical findings and disposition

1. GitHub migration history was behind the live database. The repo originally stopped at the early-July migration set while the live project contained 31 additional named migrations from 2026-07-25 through 2026-07-28. **Resolved on the Phase 0 branch: 31/31 recovered.**
2. The deployed signing Edge Functions were not represented in the repository. **Resolved: all three are checked in.**
3. Generated Supabase TypeScript types were stale relative to the live schema. **Resolved in source: the checked-in types were regenerated from the live project. CI compilation is the remaining verification step.**
4. Storage path conventions had drifted. Live Storage RLS expects `workspace_id` as the first path segment. **Resolved for Documents; Documents, saved signatures and Voice Notes are confirmed workspace-first. Remaining upload surfaces stay under audit.**
5. The frontend signing helper predated the hardened signing state machine. **Resolved: it now creates only unlocked drafts; send/cancel lifecycle transitions route through the controlled signing action layer.**
6. The deployed signing certificate contains a stale CCSF branding string. **Checked-in finalizer source now uses generic OfficeKonnect branding; production deployment remains intentionally deferred until branch validation is green.**
7. A local `.env` file was tracked by Git. It contained browser-publishable Supabase configuration only, not a service-role secret. **Resolved on the branch: `.env` removed, environment files ignored, `.env.example` added.**
8. The repository had no executable reconciliation gate. **Resolved structurally: Phase 0 CI now checks canonical source parity, lint, TypeScript and production build.**
9. The repository currently has no committed npm lockfile. **Open reproducibility item:** CI uses `npm install` rather than deterministic `npm ci` until a canonical lockfile is generated and committed.
10. The current frontend shell remains V1 product framing and auth UI. **Intentionally deferred to Phase 1.**

## Reconciliation progress

- **31/31 missing live migrations recovered** with their original version numbers, names and applied SQL.
- All three deployed signing Edge Functions are represented in repository source.
- Live Supabase TypeScript types are committed, including workflow/signing tables, view, RPCs and enums.
- `src/lib/documents.functions.ts` uses the workspace-first storage contract required by live Storage RLS.
- Document upload, saved-signature upload and Voice Note upload paths are confirmed workspace-first.
- `src/lib/signing.functions.ts` no longer creates requests directly as `sent` or directly forces cancellation state.
- The legacy signing dialog correctly reports draft creation rather than claiming the request was sent.
- `.env` is no longer tracked and `.env.example` documents safe configuration names.
- `scripts/check-phase0-parity.mjs` asserts the recovered migration/function/documentation source remains present.
- `.github/workflows/phase0-validation.yml` provides an executable Phase 0 gate.
- Vercel successfully deployed an earlier reconciled head after the major schema/type changes; the latest head is revalidating after CI/parity additions.
- Draft PR #2 tracks the Phase 0 reconciliation against `main`.

## Phase 0 completion checklist

- [x] Create dedicated reconciliation branch.
- [x] Audit live migration ledger.
- [x] Audit live tables, RLS, storage, RPCs and deployed signing Edge Functions.
- [x] Recover all missing live migration SQL into `supabase/migrations/` with original versions/names. **31/31 recovered.**
- [x] Check in all deployed Edge Function source.
- [x] Remove stale non-OfficeKonnect branding from checked-in signing finalizer source. **Production deployment intentionally deferred until validation is green.**
- [x] Replace checked-in Supabase TypeScript types with freshly generated live-schema types.
- [ ] Obtain a green TypeScript/build verification run against those generated types.
- [x] Normalize document signed-upload storage helper to `{workspace_id}/{user_id}/...`.
- [ ] Finish audit of all remaining storage/upload helpers for the same canonical convention.
- [x] Replace obsolete frontend signing lifecycle mutations with draft creation plus hardened send/cancel action contracts.
- [x] Add repository parity checks for recovered migrations, Edge Functions and canonical documentation.
- [x] Remove tracked `.env` and add safe environment-file hygiene.
- [ ] Generate and commit a deterministic npm lockfile so CI can use `npm ci`.
- [ ] Obtain green parity, lint, TypeScript and production-build CI before Phase 0 merge.
- [ ] Re-run Supabase security/performance advisors at the final Phase 0 checkpoint and document intentional warnings.

## Non-goals for Phase 0

- No new product modules.
- No destructive production resets.
- No replacement workflow or signing engines.
- No removal of existing Mail, Contacts or Voice capabilities.

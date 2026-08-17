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

## Phase 0 critical findings

1. GitHub migration history is behind the live database. The repo originally stopped at the early-July migration set while the live project contains 31 additional named migrations from 2026-07-25 through 2026-07-28.
2. The deployed signing Edge Functions were not represented in the repository.
3. Generated Supabase TypeScript types are stale relative to the live schema.
4. Storage path conventions had drifted. Live storage RLS expects workspace_id as the first path segment; an older server helper assumed user_id first.
5. The current frontend signing helper predates the hardened signing state machine and must be replaced with the current RPC/Edge Function contract.
6. The deployed signing certificate contains a stale CCSF branding string; checked-in finalizer source now uses generic OfficeKonnect branding, but production has not been redeployed yet.
7. The current frontend shell remains V1 product framing and auth UI; development-identity shell work belongs to Phase 1 after reconciliation.

## Reconciliation progress

- 10 of the 31 missing live migrations have been recovered into GitHub: Phase 0 hardening, Phase 2 native documents, and all Phase 3 spreadsheet/reconciliation/hardening migrations.
- All three deployed signing Edge Functions are now represented in repository source.
- `src/lib/documents.functions.ts` now uses the workspace-first storage contract required by live Storage RLS.
- Canonical TypeScript types have been generated from the live project and are awaiting repository replacement/build verification.

## Phase 0 completion checklist

- [x] Create dedicated reconciliation branch.
- [x] Audit live migration ledger.
- [x] Audit live tables, RLS, storage, RPCs and deployed signing Edge Functions.
- [ ] Recover all missing live migration SQL into `supabase/migrations/` with original versions/names. **10/31 recovered.**
- [x] Check in all deployed Edge Function source.
- [x] Remove stale non-OfficeKonnect branding from checked-in signing finalizer source. **Production deployment intentionally deferred until parity review.**
- [ ] Replace checked-in Supabase TypeScript types with the freshly generated live-schema types and build-check them.
- [x] Normalize document signed-upload storage helper to `{workspace_id}/{user_id}/...`.
- [ ] Audit remaining storage helpers for the same canonical convention.
- [ ] Replace obsolete frontend signing mutation path with hardened send/cancel/action contracts.
- [ ] Add parity checks/documentation for migration ledger and Edge Functions.
- [ ] Run build, lint and schema/security checks before Phase 0 merge.

## Non-goals for Phase 0

- No new product modules.
- No destructive production resets.
- No replacement workflow or signing engines.
- No removal of existing Mail, Contacts or Voice capabilities.

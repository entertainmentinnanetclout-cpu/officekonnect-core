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

1. GitHub migration history is behind the live database. The repo currently stops at the early-July migration set while the live project contains 31 additional named migrations from 2026-07-25 through 2026-07-28.
2. Deployed signing Edge Functions are not represented in the repository and must be checked in.
3. Generated Supabase TypeScript types are stale relative to the live schema.
4. Storage path conventions have drifted. Live storage RLS expects workspace_id as the first path segment; an older server helper still assumes user_id first.
5. The current frontend signing helper predates the hardened signing state machine and must be replaced with the current RPC/Edge Function contract.
6. The live signing certificate contains a stale CCSF branding string that must be generic OfficeKonnect branding.
7. The current frontend shell remains V1 product framing and auth UI; development-identity shell work belongs to Phase 1 after reconciliation.

## Phase 0 completion checklist

- [x] Create dedicated reconciliation branch.
- [x] Audit live migration ledger.
- [x] Audit live tables, RLS, storage, RPCs and deployed signing Edge Functions.
- [ ] Recover all missing live migration SQL into `supabase/migrations/` with original versions/names.
- [ ] Check in all deployed Edge Function source.
- [ ] Remove stale non-OfficeKonnect branding from checked-in signing finalizer source and deploy only after parity review.
- [ ] Regenerate Supabase TypeScript types from the reconciled schema.
- [ ] Normalize storage path helpers to `{workspace_id}/{user_id}/...`.
- [ ] Replace obsolete frontend signing mutation path with hardened send/cancel/action contracts.
- [ ] Add parity checks/documentation for migration ledger and Edge Functions.
- [ ] Run build, lint and schema/security checks before Phase 0 merge.

## Non-goals for Phase 0

- No new product modules.
- No destructive production resets.
- No replacement workflow or signing engines.
- No removal of existing Mail, Contacts or Voice capabilities.

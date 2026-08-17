# OfficeKonnect Agent Handoff

## Active branch

`phase-0-canonical-reconciliation`

## Current objective

Make GitHub reproduce and accurately describe the live Supabase backend before feature development continues.

## Do not do

- Do not reset production.
- Do not create replacement workflow/signing engines.
- Do not weaken RLS to make stale frontend helpers work.
- Do not expose service-role credentials to the browser.
- Do not delete Mail, Contacts or Voice merely because they are not core navigation targets.
- Do not compress missing historical migrations into a misleading fake history when the original migration statements can be recovered from `supabase_migrations.schema_migrations`.

## Live backend facts verified 2026-08-17

- Supabase project: `ydgsmnzcwkrlghlhtpgq`.
- 43 public application tables; RLS enabled on all 43.
- Private storage buckets: documents, document-versions, exports, letterheads, signatures, voice-notes. Avatars is public.
- Deployed Edge Functions: signing-actions, signing-external, signing-finalize.
- Workflow RPCs include start, decision, resubmit, reassign, comment resolve/update and cancel.
- Signing RPCs include secure send, rotate invitation, complete/decline participant, external token exchange/session payload, finalization and cancellation.
- Live migration ledger extends through `20260728101556_phase_5_signing_rls_initplan_optimization`.

## Phase 0 next actions

1. Recover the 31 missing migration statements from `supabase_migrations.schema_migrations` and check them into `supabase/migrations/` using the original version and migration name.
2. Check in exact deployed Edge Function source, preserving runtime behavior except separately reviewed generic-brand cleanup.
3. Regenerate live Supabase TypeScript types.
4. Normalize storage helpers to workspace-first paths.
5. Replace obsolete signing frontend mutations with the hardened state-machine entry points.
6. Compare branch vs main, run lint/build, re-run Supabase advisors, and produce a Phase 0 parity report.

## Important drift examples

### Storage

Live Storage RLS resolves the first folder segment as `workspace_id`. An older `createSignedUploadUrl` helper still namespaces with `userId` first. Do not change RLS to accommodate the stale helper; fix the helper.

### Signing

`src/lib/signing.functions.ts` directly creates requests as sent and directly changes lifecycle state. This predates the secure send/cancel/completion state machine. Replace that integration rather than bypassing backend locks.

### Branding

The deployed signing certificate currently contains `CCSF / OfficeKonnect Signing Certificate`. The generic product must use OfficeKonnect-only branding.

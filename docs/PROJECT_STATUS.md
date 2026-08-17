# OfficeKonnect Project Status

Last audited: 2026-08-17

## Current phase

Phase 1 — Development Identity and Application Shell.

## Upgrade branch policy

Draft PR #2 is the single long-running upgrade PR for Phases 0–11. All phase work is committed to `phase-0-canonical-reconciliation`. The PR must remain draft and must not merge to `main` until the Phase 11 release-candidate gate is complete.

## Source of truth policy

The live Supabase project was treated as the authoritative description of already-deployed database behavior during Phase 0. GitHub has now been brought forward to represent that behavior without destructive production changes. GitHub migrations and checked-in Edge Function source are the reproducible source of truth for future changes.

## Confirmed architecture

- Frontend: React 19, TanStack Start/Router/Query, TypeScript, Tailwind, Radix UI.
- Backend: Supabase Auth, Postgres, RLS, Storage, RPCs and Edge Functions.
- Public application tables: 43; RLS enabled on all 43 at Phase 0 audit time.
- Private storage buckets include documents, document-versions, exports, letterheads, signatures and voice-notes.
- Existing backend foundations: native documents, structured versions, spreadsheets, workflows/review/approval, secure e-signing, notifications, activity logs and workspace membership.

## Phase 0 reconciliation result

1. GitHub migration history was behind the live database. **Resolved: 31/31 missing live migrations recovered.**
2. Deployed signing Edge Functions were absent from source control. **Resolved: all three are checked in.**
3. Generated Supabase TypeScript types were stale. **Resolved in source with live-generated types.**
4. Storage path conventions had drifted. **Documents, saved signatures and Voice Notes are confirmed workspace-first.**
5. The frontend signing helper predated the hardened signing state machine. **Resolved: draft creation plus controlled lifecycle actions.**
6. Signing certificate source contained stale CCSF branding. **Checked-in finalizer source now uses OfficeKonnect-only branding; production deployment remains deferred.**
7. `.env` was tracked. **Resolved: removed from version control, `.env.example` added.**
8. Repository parity/validation gates were absent. **Resolved structurally with Phase 0 parity and CI workflows.**
9. A deterministic npm lockfile has now been generated on the upgrade branch. **Validation still needs a fully green deterministic run.**
10. Supabase advisor findings were documented without weakening intentional signing-token isolation.

## Phase 1 implementation

- Added server-only development identity bootstrap using a real Supabase sign-in.
- Development bootstrap cannot run on Vercel production deployments.
- Browser code never receives development email/password credentials.
- Existing Supabase JWT identity, `auth.uid()`, workspace membership and RLS remain authoritative.
- Replaced the V1 dashboard chrome with the canonical OfficeKonnect shell.
- Added authenticated workspace discovery and workspace switching through `profiles.default_workspace_id`.
- Added grouped canonical navigation for Workspace, Operations, Communication and Administration.
- Existing routes remain live: Home, Documents, Mail Center, Contacts, Voice Notes and Settings.
- Later-phase modules are visible but disabled until implemented, preventing broken/dead routes.
- Added responsive mobile drawer and bottom navigation.
- Added a production-safe unauthenticated workspace state and secure sign-in path.
- Added `docs/PHASE1.md` with the security invariants and Phase 1 validation checklist.

## Current validation status

- Repository parity: implemented and previously green.
- Deterministic npm install: requires revalidation on the current Phase 1 head.
- ESLint: requires revalidation on the current Phase 1 head.
- TypeScript: requires revalidation on the current Phase 1 head.
- Production build: requires revalidation on the current Phase 1 head.
- Vercel preview: should be smoke-tested after preview-only development credentials are configured.

## Non-negotiable release rule

Do not merge draft PR #2 after an individual phase. Continue Phases 2–11 on the same branch/PR. Merge to `main` only when the complete Phase 11 upgrade passes release-candidate validation.

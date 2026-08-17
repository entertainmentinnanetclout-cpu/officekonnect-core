# Phase 1 — Development Identity and Application Shell

## Goal

Provide an authless-feeling development experience without weakening the production identity or workspace security model, and replace the V1 dashboard chrome with the canonical OfficeKonnect workspace shell.

## Security invariant

Development UX must never fabricate `auth.uid()`, workspace membership, roles or RLS outcomes.

The Phase 1 bootstrap uses server-only development credentials to obtain a normal Supabase session. The browser receives only the resulting access/refresh session tokens, exactly as it would after an ordinary successful sign-in. The bootstrap is forcibly disabled on Vercel production deployments.

## Implemented

- Server-only development session bootstrap behind `OFFICEKONNECT_DEV_ACCESS=true`.
- Development credentials remain server-only (`OFFICEKONNECT_DEV_EMAIL`, `OFFICEKONNECT_DEV_PASSWORD`).
- Production deployments cannot invoke development bootstrap even if the flag is accidentally present.
- Dashboard boot flow first resolves an existing Supabase session, then attempts development bootstrap only for an unauthenticated user.
- Production-safe unauthenticated fallback links to the existing secure sign-in flow.
- Canonical OfficeKonnect shell replaces the V1 sidebar/header.
- Real workspace memberships are loaded through the authenticated Supabase client under RLS.
- Workspace switching writes `profiles.default_workspace_id`, matching the server-side active workspace resolver.
- Navigation is grouped into Workspace, Operations, Communication and Administration.
- Modules scheduled for later phases are visible but disabled, preventing dead routes while keeping the full OfficeKonnect information architecture visible.
- Responsive mobile drawer and bottom navigation are included.

## Phase 1 validation checklist

- [x] No fake identity or fake workspace model introduced.
- [x] Development credentials are never browser environment variables.
- [x] Production deployment guard exists.
- [x] Existing authenticated sessions open the workspace directly.
- [x] Development bootstrap returns a real Supabase session.
- [x] Workspace selector uses real memberships and `default_workspace_id`.
- [x] Existing live modules remain routable: Home, Documents, Mail Center, Contacts, Voice Notes, Settings.
- [x] Future phase modules cannot navigate to nonexistent routes.
- [ ] Repository lint/type/build gate green on the Phase 1 head.
- [ ] Preview smoke test confirms development-session bootstrap after preview-only credentials are configured.

## PR strategy

Phase 1 remains on draft PR #2 together with Phase 0. Phases 2–11 will continue on the same PR and branch. The PR must not be merged to `main` until the Phase 11 release-candidate gate is complete.

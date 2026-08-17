# OfficeKonnect Changelog

## 2026-08-17 — Phase 0 started

### Added

- Dedicated `phase-0-canonical-reconciliation` workstream.
- Canonical project status, architecture, roadmap and handoff documentation.

### Audit findings recorded

- Live Supabase has 31 named migrations not yet present in GitHub.
- Deployed signing Edge Functions are absent from repository source.
- Generated Supabase TypeScript types are stale.
- An older storage upload helper conflicts with live workspace-first Storage RLS.
- The current frontend signing helper predates the hardened signing RPC/Edge Function state machine.
- Signing certificate finalizer contains stale CCSF branding.

### Production changes

None. Phase 0 began as a repository reconciliation exercise; production data/schema was not reset or destructively altered.

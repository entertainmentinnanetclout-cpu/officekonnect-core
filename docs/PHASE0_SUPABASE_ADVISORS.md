# Phase 0 Supabase Advisor Disposition

Recorded: 2026-08-17

This file records the Phase 0 disposition of Supabase security/performance advisor findings. It does not replace recurring advisor checks after future DDL or auth changes.

## Security

### `public.signing_tokens`: RLS enabled with no client policies

**Disposition: intentional. Do not add ordinary client policies.**

`signing_tokens` stores hashes and lifecycle metadata for guest signing invitations. The external signer path is intentionally brokered through server-authoritative RPCs and the `signing-external` Edge Function. Normal browser clients must not enumerate or directly mutate token rows. RLS-with-no-client-policy is therefore part of the isolation model, not an omitted CRUD policy.

Any future change that exposes `signing_tokens` directly to `anon` or `authenticated` must receive a dedicated security review.

### Supabase Auth leaked-password protection disabled

**Disposition: production-auth prerequisite, not a Phase 0 development-mode blocker.**

The OfficeKonnect development stage keeps the real Supabase auth/RLS architecture but Phase 1 will introduce a development identity bootstrap rather than production login UI. Before production password authentication is restored/enabled for end users, leaked-password protection and the complete password/MFA policy must be reviewed and enabled as appropriate.

## Performance

### Auth/RLS init-plan warnings

**Disposition: backlog for targeted optimization, not a schema-parity blocker.**

Several legacy RLS policies call `auth.*` expressions in a form that Supabase flags for per-row re-evaluation. Future optimization should use init-plan-safe forms such as `(select auth.uid())` where semantically equivalent. Phase 5 signing policies already contain several such corrections.

Do not bulk-rewrite all RLS policies without regression tests; permission semantics take priority over cosmetic advisor cleanliness.

### Unused-index notices

**Disposition: retain during current low-volume development.**

The database currently has very little production workload, so index-usage statistics are not representative. Workflow/signing/document indexes were intentionally added for expected joins, state transitions, foreign-key maintenance and queue access. Do not remove them solely because the advisor currently reports them as unused.

Re-evaluate index usage only after representative production-like traffic and query plans exist.

### Multiple permissive-policy notices

**Disposition: optimize later if query-plan evidence warrants it.**

Multiple permissive policies can add evaluation overhead, but they are not a correctness defect by themselves. Consolidation must preserve the exact authorization union. Treat this as a performance-hardening task after Phase 0 rather than changing access semantics during canonical reconciliation.

## Phase 0 security invariants

- All public application tables remain protected by RLS.
- Service-role credentials must never be exposed to browser/client bundles.
- External signing tokens are exchanged server-side and stored only as hashes in the database.
- External signing sessions remain short-lived and hashed.
- Sent signing request structure remains immutable outside controlled signing operations.
- Private document/signature/export storage remains workspace scoped.
- No advisor warning should be silenced by weakening RLS or exposing privileged tables.

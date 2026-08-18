# OfficeKonnect Phase 10 — Security, Performance, Automated Testing and CI

Status: **Completed, live-backend reconciled and validated**

Validated source checkpoint: `ddb2edf65ef07da6d4ae5bcaa2a6129966a46c3d`

Upgrade Validation run: `32129565222`

## Security hardening

Phase 10 adds a permanent browser/server security-boundary audit in `scripts/check-security-boundaries.mjs`.

The gate verifies that:

- browser-capable application source cannot reference Supabase service-role credentials;
- the server-only Supabase admin client remains `.server.*`, reads `SUPABASE_SERVICE_ROLE_KEY` only on the server and does not persist a session;
- no public/browser environment variable is secret-shaped;
- credential-like values are not persisted in `localStorage`;
- local `.env` files remain ignored;
- development-session bootstrap remains disabled in production through both Vercel and `NODE_ENV` guards;
- workspace invitation bearer tokens remain session-scoped in the browser;
- external signing retains the one-time exchange + short-lived session RPC contract;
- obsolete privileged `signing-public.functions.ts` remains absent.

The existing product-hardening audit from Phase 9 also remains a permanent CI gate.

## Deterministic three-page signing PDF integration

Phase 10 extracts the completed-PDF field renderer into:

- `supabase/functions/_shared/signing-pdf.ts`

`signing-finalize` consumes this same renderer.

`tests/signing-finalization-pdf.integration.test.ts` creates a real deterministic three-page PDF and verifies:

- a signature image on page 1;
- a text value on page 2;
- a date value on page 3;
- source and final SHA-256 values differ;
- repeated finalization of the same immutable source/field values is deterministic;
- out-of-page normalized geometry is rejected;
- fields referencing pages outside the immutable source are rejected.

The source test suite contains **42 unit/integration tests**, all passing.

## Live signing finalizer

The exact tested shared renderer is deployed through the existing finalization state machine.

Live state:

- `signing-finalize` — **ACTIVE version 3**, JWT required;
- `signing-actions` — ACTIVE, JWT required;
- `signing-external` — ACTIVE, JWT intentionally disabled because it enforces the custom invitation/session protocol in-function.

The finalizer remains the only completed-PDF/audit-certificate generator. Existing claim/complete/fail RPCs, immutable source hashes and `OfficeKonnect Signing Certificate` behavior remain authoritative.

## Performance hardening

Applied and checked in live migration:

- `20260818101750_phase_10_files_fk_covering_indexes`

It adds covering indexes for the Phase 4 composite foreign keys on:

- `document_favorites(document_id, workspace_id)`;
- `document_folder_items(document_id, workspace_id)`;
- `document_folder_items(folder_id, workspace_id)`;
- `document_shares(document_id, workspace_id)`;
- `workspace_folders(parent_id, workspace_id)` when parent is present.

After the migration the Supabase performance advisor no longer reports unindexed foreign keys.

Phase 10 deliberately does **not** delete indexes merely because low-traffic statistics mark them unused.

## Production asset budget

`scripts/check-build-budget.mjs` is a permanent post-build gate.

Current budgets:

- JavaScript: **<= 640 KiB per production asset**;
- CSS: **<= 150 KiB per production asset**.

The Phase 10 production build passes these budgets.

## Chromium E2E

Added:

- `playwright.config.ts`;
- `e2e/public-routes.spec.ts`.

The Playwright test runner is pinned to `@playwright/test@1.62.1`. Permanent CI resolves the Chrome/Chromium executable already provisioned on the GitHub Ubuntu runner and passes that executable to Playwright rather than downloading a second browser runtime on every validation.

Four Chromium-family E2E tests pass:

1. current OfficeKonnect landing page/title/section navigation with no browser runtime errors;
2. real login controls with no runtime errors;
3. mobile authentication usability;
4. real public Privacy and Terms routes.

No fake authenticated Supabase user is introduced for E2E.

## Public route hardening discovered by E2E

Browser QA exposed and fixed two real public-route gaps:

- stale landing metadata/title;
- missing `/privacy` and `/terms` routes that the root auth boundary already treated as public.

The TanStack generated route registry is synchronized with both legal routes.

## Permanent CI gate

`.github/workflows/phase0-deterministic-validation.yml` is read-only (`contents: read`) and PR-driven for Draft PR #2.

Concurrency is scoped to the PR number with `cancel-in-progress: true`, so newer branch heads cancel stale validation runs rather than consuming the runner on obsolete commits.

The gate runs:

1. repository parity;
2. frozen `bun ci`;
3. ESLint;
4. Phase 9 product-hardening audit;
5. Phase 10 security-boundary audit;
6. TypeScript;
7. unit/integration tests;
8. production client/SSR/Nitro build;
9. production asset budget;
10. pinned Playwright runner installation;
11. runner-provisioned Chrome/Chromium resolution/version check;
12. browser E2E.

All temporary/write-capable reconciliation workflows used during implementation were removed.

## Validated source checkpoint

Upgrade Validation run `32129565222` passed on `ddb2edf65ef07da6d4ae5bcaa2a6129966a46c3d`:

- Repository parity — PASS
- Frozen `bun ci` — PASS
- ESLint — PASS, 0 errors (7 inherited Fast Refresh warnings)
- Product hardening audit — PASS
- Security boundary audit — PASS
- TypeScript — PASS
- Unit/integration tests — **42/42 PASS**
- Production build — PASS
- Production asset budget — PASS
- Playwright/Chromium setup — PASS
- Browser E2E — **4/4 PASS**

The final documentation/CI head must clear the same substantive gate with the optimized runner-provisioned browser path before Phase 10 is formally frozen.

## Reviewed residual advisor findings

Phase 10 does not claim a zero-warning Supabase advisor state.

Security residuals:

- `signing_tokens` RLS/no-policy notice remains intentional because direct browser access is prohibited;
- authenticated `SECURITY DEFINER` warnings remain for controlled application RPCs that enforce authentication/membership/role/invited-email checks internally;
- Supabase Auth leaked-password protection is still disabled and requires a safe Auth configuration change outside the currently exposed project-mutation tools.

Performance residuals:

- inherited RLS init-plan warnings remain on older policies;
- several multiple-permissive SELECT-policy warnings remain;
- low-traffic unused-index INFO notices remain and are not grounds for premature index deletion.

These are explicitly carried into the Phase 11 release review/future targeted optimization rather than hidden or weakened around.

## Release rule

Phase 10 does not merge Draft PR #2. Vercel/deployment-platform validation remains intentionally deferred until **Phase 11 — Release Candidate and Documentation**.

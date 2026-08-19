# OfficeKonnect — Corrective CI & Stabilisation Pass

Goal: get the existing repository fully green (lint, typecheck, tests, build, audits) without redesigning anything, weakening quality gates, or touching the Supabase schema unless a real mismatch is proven.

## What I verified locally (same commands CI runs)

| Stage                                              | Result                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Install                                            | PASS                                                                                                                     |
| Lint (`eslint .`)                                  | FAIL — 3464 errors, all `prettier/prettier`, across 22 files                                                             |
| Typecheck (`tsc --noEmit`)                         | FAIL — 1 error                                                                                                           |
| Tests (`bun test`)                                 | FAIL — 1 of 49 (`signing.test.ts`)                                                                                       |
| Production build (`vite build`)                    | PASS                                                                                                                     |
| `audit:product`                                    | PASS                                                                                                                     |
| `phase0:parity`, `audit:security`, `audit:release` | FAIL locally only — they reject a tracked `.env`; `.env` is gitignored, so this is a sandbox artifact, not a repo defect |
| `audit:performance`                                | FAIL — the script scans `.output/public/assets`, but the build emits `dist/`                                             |

## Fixes

### 1. Lint — formatting drift only

Every lint error is Prettier drift (no rule violations of substance; the two `react-hooks/exhaustive-deps` and seven `react-refresh` items are warnings and do not fail CI). Affected files include the signing routes, PDF workspace/viewer, field palette, several `ui/*` components, `src/start.ts`, `src/server.ts`, `src/lib/errors.ts` and the generated `src/integrations/supabase/types.ts`.

Fix: run the project's own `bun run format` (Prettier 3.7.3, existing `.prettierrc`) so formatting matches the config. No rule disabling, no config changes. Purely whitespace — zero behaviour change.

### 2. Typecheck — `src/lib/signing-account.functions.ts`

`completeDraftSenderSigning` returns the untyped `unknown` result of an RPC call, which TanStack Start rejects as non-serializable.

Fix: give the RPC result a declared return shape (a small exported result type matching what `complete_draft_sender_participant` returns) instead of `unknown`, so the handler's return type is serializable. No `any`, no `@ts-ignore`.

### 3. Test — stale fixture in `src/lib/signing.test.ts`

"prevents CC recipients from owning fields" builds a CC participant with `user_id: null`. Since the product rule "every signing participant must have an active OfficeKonnect account" was added, validation now returns that message first, so the assertion never reaches the CC rule.

Fix: give the CC fixture a `user_id` so the test isolates the CC-fields rule it was written for. The production rule is correct and stays untouched.

### 4. Asset-budget audit

`scripts/check-build-budget.mjs` reads `.output/public/assets`, which the current Nitro/Vite build no longer produces (output is `dist/client`). Fix: point the script at the real output directory, keeping the same budget thresholds. If CI is currently passing this step against a different output layout, I will confirm before changing it.

## Regression protection (no rewrites)

After the fixes, I re-run the full pipeline in order (install → format check → lint → typecheck → tests → production build → audits) and smoke-test the preview: dashboard shell, documents list, PDF workspace open/zoom/page nav, signing prepare (field place/move/resize/save), signing index, sheets renderer, settings, and the auth/guest session path. Console and network errors are checked on each. Signing, PDF and spreadsheet implementations are not modified beyond the fixes above.

## Supabase

No schema change planned. I will verify that the frontend queries, RPC names and enums used by the signing/document/spreadsheet code exist in the live project, and report any mismatch rather than silently migrating.

## Scope limits I want to flag

- I cannot read GitHub Actions logs or run git operations (branch, commit, push, merge) from here — git is managed by the Lovable/GitHub sync. I reproduced the CI pipeline locally command-for-command instead; merging PR #10 stays your action once checks go green.
- Playwright E2E (`test:e2e`) runs in CI against a clone-safe build; I will run it locally if the runtime allows and mark it UNVERIFIED otherwise.
- I will report every stage as PASS/FAIL/UNVERIFIED in a final engineering report, with no success claims for anything I did not actually run.

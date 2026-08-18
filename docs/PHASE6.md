# OfficeKonnect Phase 6 — Production E-Signatures

Status: **Completed and validated**

Date: 2026-08-18

## Objective

Expose the already hardened OfficeKonnect signing backend as a complete production application flow without creating a second signing state machine or weakening the existing token/session/hash/finalization security contracts.

## Canonical backend retained

Phase 6 reuses:

- `signing_requests`
- `signing_participants`
- `signing_fields`
- `signing_tokens`
- `signing_events`
- `signing_certificates`
- private external signing sessions
- `signing-actions`
- `signing-external`
- `signing-finalize`

Lifecycle operations remain server-authoritative through the existing signing RPCs and Edge Functions. Browser code may configure an unlocked draft under RLS, but it does not force sent/completed/declined/cancelled/finalized lifecycle states directly.

## Product surfaces

### `/dashboard/signing`

Production signing dashboard with:

- Draft, Sent, In progress, Completed, Declined and Cancelled views.
- Real request counts and current-user pending assignment count.
- Search and participant summaries.
- PDF-only signing-request creation.
- Parallel or sequential signing order.
- Workspace identities and external email participants.
- Signer, approver and CC roles.
- Direct handoff into the preparation workspace.

### `/dashboard/signing/$requestId/prepare`

Three-column immutable preparation workflow with:

- participant add/remove/reorder;
- workspace/external identities;
- signer/approver/CC roles;
- PDF page navigation and zoom;
- signature, initial, text and date fields;
- normalized 0..1 PDF coordinates;
- drag/resize through `react-rnd`;
- participant assignment/reassignment;
- required fields and field labels;
- request title/order settings;
- strict send-time configuration validation;
- bounded expiry configuration;
- secure send through `signing-actions` / `send_signing_request`;
- one-time external invitation-token display and secure link copy.

After send, participant/field configuration and the source PDF are locked by the backend contract.

### `/dashboard/signing/$requestId`

Authenticated signing/request workspace with:

- request status, order, active turn, expiry and finalization state;
- participant status and external invitation rotation;
- sender cancellation;
- manual finalization retry when queued/failed;
- signed PDF access;
- signing certificate access;
- signing-event timeline with event hashes;
- internal signer eligibility checks;
- saved signatures;
- drawn signatures;
- typed signatures;
- workspace-first signature image storage;
- text/date field completion;
- explicit electronic-signing consent;
- sequential order enforcement;
- complete and decline actions through the hardened signing gateway.

### External signer flow

`/sign/$token` accepts the raw invitation token only for the one-time exchange.

Flow:

1. Raw 64-hex invitation token is sent to `signing-external` action `exchange`.
2. Backend hashes the raw token and creates a short-lived private signing session.
3. Browser stores only the returned short-lived session token in `sessionStorage`.
4. Navigation immediately moves to `/sign/active`; the raw invitation token no longer remains the active route/session identifier.
5. `/sign/active` loads only session-scoped payload/fields/source PDF.
6. Signature images are uploaded through `signing-external`, not direct privileged database writes.
7. Completion or decline uses the external-session RPC contract.
8. Session state is removed after terminal action.
9. If finalization completes synchronously, the completed PDF and certificate URLs are returned as short-lived private asset links.

The obsolete `src/lib/signing-public.functions.ts` admin-backed bypass was removed and must not be reintroduced.

## Document and Sheets integration

The previous disconnected static-signing-copy action is now the real Phase 6 bridge:

1. Native document / Sheet flushes the latest saved state.
2. Canonical deterministic renderer creates the immutable PDF signing copy.
3. UI routes to `/dashboard/signing` with that PDF preselected.
4. User configures participants and fields.
5. Request is sent through the hardened signing backend.

The user-facing action is **Send for signature**, not merely “Create signing copy”.

## Field integrity

`src/lib/signing.ts` owns the application signing contract.

Field geometry is normalized and clamped before persistence:

- `page >= 1`
- `x/y` normalized to page space
- `w/h` normalized and bounded
- rotation bounded
- required state retained

Send-time application validation mirrors backend requirements:

- at least one signer/approver;
- every participant has an account or email identity;
- CC participants own no signable fields;
- each signer owns a required signature or initial field.

The backend remains authoritative and revalidates these constraints while locking the request.

## Internal signing integrity

Authenticated completion uses `complete_signing_participant` through `signing-actions`.

The backend verifies:

- current authenticated user owns the internal participant;
- participant/request are eligible;
- sequential turn when applicable;
- locked participant/field configuration hashes;
- required field values;
- required consent-text version.

## Finalization

`signing-finalize` remains the only PDF finalizer.

Phase 6 synchronized the live function to **version 2** while preserving `verify_jwt = true`.

The certificate title is now generic:

`OfficeKonnect Signing Certificate`

The function:

- loads the immutable source PDF;
- embeds completed text/date/signature/initial fields;
- computes source/final SHA-256 hashes;
- uploads the final PDF to private exports;
- creates a PDF audit certificate and certificate hash;
- completes the database finalization contract;
- records failure through the canonical failure RPC if finalization cannot complete.

`signing-actions` remains JWT-enabled. `signing-external` remains JWT-disabled intentionally because it implements custom hashed invitation/session authentication.

## Live security verification

RLS remains enabled on:

- `signing_requests` — 4 policies
- `signing_participants` — 2 policies
- `signing_fields` — 2 policies
- `signing_events` — 1 policy
- `signing_certificates` — 1 policy

No service-role secret is exposed to browser code.

## No fake production data

After Phase 6 completion work:

- `signing_requests`: 0 rows
- `signing_participants`: 0 rows
- `signing_fields`: 0 rows
- `signing_certificates`: 0 rows

No sample/demo signing transaction was inserted into production.

## Regression coverage

Phase 6 added five signing-contract tests covering:

- normalized field geometry;
- required signer signature/initial configuration;
- CC field prohibition;
- sequential participant eligibility;
- expired/revoked/terminal participant ineligibility.

These run inside the permanent Upgrade Validation suite.

## Validation

The clean read-only Phase 6/7 source checkpoint passed:

- repository parity;
- frozen `bun ci`;
- ESLint with 0 errors;
- TypeScript;
- **33 Bun tests / 0 failures**;
- production build.

Vercel/deployment-platform validation is intentionally deferred until Phase 11 by project instruction.

## Phase boundary

Phase 6 completes the production signing application layer. Phase 10 will add deeper deterministic real-PDF end-to-end signing automation/security/performance validation; it does not replace this signing architecture.

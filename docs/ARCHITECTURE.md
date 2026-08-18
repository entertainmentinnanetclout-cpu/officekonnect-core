# OfficeKonnect Architecture

## Architectural rule

Preserve and extend the existing Supabase data model and server-authoritative state machines. Do not create parallel document-version, spreadsheet, file, template, workflow, signing, role, notification or storage systems unless a demonstrated gap requires a narrowly additive model.

## Runtime layers

### Client

- React 19
- TanStack Router
- TanStack Query
- Tailwind/Radix component system
- PDF.js/react-pdf for viewing
- `react-rnd` for normalized PDF field preparation
- `react-signature-canvas` for signature capture
- pdf-lib for deterministic PDF manipulation/finalization where appropriate
- xlsx for XLSX/XLS/CSV interoperability at the application boundary

### Server application layer

TanStack Start server functions provide authenticated application operations. They resolve the active workspace from the authenticated Supabase identity and do not bypass live RLS or server state-machine contracts.

### Supabase

- Auth identity and JWT claims
- Postgres persistence
- Row Level Security
- private helper schema for privileged state-machine internals
- Storage buckets partitioned by workspace
- RPCs for sensitive transitions/search
- Edge Functions for signing actions, external signing sessions and PDF finalization

## Workspace isolation

Canonical storage path convention:

```text
{workspace_id}/{user_id}/{resource...}
```

The first path segment remains the workspace id because live Storage RLS resolves workspace membership from that segment.

## Documents

`documents` is the canonical current-state record for uploaded files, native documents and spreadsheets. Structured content is stored in JSONB and guarded by `editor_version` optimistic concurrency. `document_versions` stores immutable snapshots.

No second native-document or spreadsheet persistence table exists.

## OfficeKonnect Sheets

Spreadsheet documents remain normal `documents` rows with `document_kind = 'spreadsheet'`. The authoritative workbook is `documents.content` using `kind: "workbook"` and `schemaVersion: 1`.

`src/lib/spreadsheet.ts` is the canonical workbook model/calculation engine. Imported Office files are normalized into this model; XLSX is an interoperability format, not persistence.

Spreadsheet saves use `save_structured_document`; restores use `restore_structured_document_version`. The server recomputes workbook metrics before save.

`src/lib/spreadsheet-pdf.server.ts` is the spreadsheet PDF renderer. Static signing copies become normal private PDF `documents` rows plus version 1 and now feed directly into the Phase 6 signing workflow.

## Files organization

The Files layer organizes `documents`; it does not create a second file store.

- `workspace_folders` — nested folders.
- `document_folder_items` — current folder assignment.
- `document_favorites` — user-specific favourites.
- `document_shares` — workspace-internal view-share markers.

Folder moves change relational organization only and keep private Storage paths stable. Uploaded-file duplication copies the actual private binary to a fresh document-owned path and creates a new document/version identity.

Folder hierarchy cycles are rejected in PostgreSQL.

## Templates

`document_templates` remains the canonical document/spreadsheet template system. Template content uses the same native-document/workbook JSON as the source editor. Mail Center email templates remain separate.

## Workflows and approvals

The workflow state machine remains server-authoritative.

Canonical relations:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_runs`
- `workflow_steps`
- `workflow_step_assignees`
- `workflow_decisions`
- `workflow_comments`
- `workflow_events`
- `workflow_work_queue`

Canonical lifecycle/comment RPCs:

- `start_document_workflow`
- `submit_workflow_decision`
- `resubmit_document_workflow`
- `reassign_workflow_assignment`
- `cancel_document_workflow`
- `resolve_workflow_comment`
- `update_workflow_comment`

Starting a workflow creates an immutable `document_versions` submission. Review always renders that version, not mutable working content. Request Changes edits the working document separately and re-enters review only through controlled optimistic-concurrency resubmission.

`workflow_work_queue` is already scoped to the current authenticated pending assignment and is consumed directly by `/dashboard/approvals`.

## Production E-Signatures

### Canonical data model

Signing uses the existing hardened backend:

- `signing_requests`
- `signing_participants`
- `signing_fields`
- `signing_tokens`
- `signing_events`
- `signing_certificates`
- private signing sessions

Request/participant lifecycle transitions are server-authoritative. Browser code may configure unlocked drafts under RLS but does not directly force sent/completed/declined/cancelled/finalized states.

### Request creation and preparation

Native Documents and Sheets use this canonical bridge:

```text
flush save
→ deterministic PDF signing copy
→ normal private PDF document/version
→ signing draft
→ participant configuration
→ normalized PDF field preparation
→ secure send
```

Preparation persists `signing_fields` using normalized 0..1 page geometry. `src/lib/signing.ts` provides application-side normalization/config validation, while the backend remains authoritative on send.

Participant roles:

- signer;
- approver;
- CC.

Signing order:

- parallel;
- sequential.

Required signing fields:

- signature;
- initial;
- text;
- date.

CC recipients cannot own signable fields.

### Sending and immutable lock

`send_signing_request` locks:

- immutable source document version;
- participant configuration/hash;
- field configuration/hash;
- expiry;
- signing order/current turn.

The UI sends through `signing-actions`, never by writing request lifecycle state directly.

### Authenticated/internal signing

Internal participants complete through `complete_signing_participant` via `signing-actions`.

The backend validates:

- authenticated user ↔ participant identity;
- request/participant eligibility;
- sequential turn;
- locked configuration hashes;
- required values/signatures;
- consent text version.

Saved, drawn and typed signatures are stored under the authenticated workspace/user identity and referenced by ID during completion.

### External signing

The raw invitation token is **exchange-only**.

`/sign/$token`:

1. sends the raw 64-hex token to `signing-external` action `exchange`;
2. backend hashes/verifies the invitation and creates a short-lived private session;
3. browser stores only the returned session token in `sessionStorage`;
4. browser immediately moves to `/sign/active`.

`/sign/active` uses only the short-lived session token for payload, signature upload, completion and decline.

The deployed `signing-external` function remains `verify_jwt = false` intentionally because it implements custom token/session authentication, HMAC fingerprints and server-side session verification. This exception must not be generalized to other functions.

The obsolete admin-backed `signing-public.functions.ts` path was removed and must not be restored.

### Audit and integrity

`signing_events` is an append-only audit surface with event-chain hashes. Requests retain source/final hashes, participant/field hashes, finalization state and certificate references.

### Finalization

`signing-finalize` is the only final PDF generator. Live version 2 remains JWT-protected.

It:

- loads the immutable source PDF;
- embeds completed field values/signature images;
- computes source/final SHA-256 hashes;
- stores completed PDF in private `exports`;
- creates an `OfficeKonnect Signing Certificate` PDF;
- hashes/stores the certificate;
- completes/fails finalization through the canonical database RPC contract.

`signing-actions` remains JWT-protected. Service-role credentials remain Edge Function/server only.

## Tasks

`tasks` is the canonical lightweight task table added in migration `20260818062157_phase_7_tasks_calendar_search`.

It stores status, priority, assignment, creator, start/due/completed dates and optional links to existing operational objects.

RLS rules:

- workspace members read;
- members create under their own identity;
- creator/assignee/admin update;
- creator/admin delete;
- assignees must already belong to the workspace.

Tasks deliberately do not become a second workflow engine.

## Calendar

`calendar_events` stores only **manual office events**.

The operational Calendar derives the following read-only dates directly from canonical source tables:

- task starts/due dates;
- workflow-run deadlines;
- workflow-step deadlines;
- active signing-request expiries.

These dates are not copied into `calendar_events`, preventing state drift.

Manual events remain workspace scoped with RLS; creator/admin can edit/delete them.

## Global Search and Command Navigation

`search_workspace_objects(p_workspace_id, p_query, p_limit)` is the canonical Phase 7 search boundary.

It is:

- server-side;
- membership checked;
- `security definer` with restricted `search_path`;
- executable only by authenticated users;
- scoped to the active workspace.

Current coverage:

- Documents and Sheets;
- document/spreadsheet templates;
- workflow runs;
- e-signature requests;
- tasks;
- workspace members.

No second search-copy table/index exists. `/dashboard/search` and the Ctrl/Cmd+K dialog consume the same RPC contract.

## Security boundaries

- Browser uses publishable Supabase credentials only.
- Service-role credentials are server/Edge Function only.
- RLS remains enabled on application tables.
- State-machine lifecycle transitions use approved RPC/Edge Function paths.
- No development mode replaces `auth.uid()` or workspace RLS with fake client identity.
- Workflow reviews use immutable submitted versions.
- Signing sends/completions/finalization are server-authoritative.
- Raw external signing invitation tokens are never retained as the post-exchange browser session identifier.
- Signing session tokens are short lived and held only in `sessionStorage`.
- Calendar derives operational deadlines instead of duplicating them.
- Global search checks active-workspace membership server-side.
- Files organization never makes private binary storage public.

## Repository parity

The repository must continue to contain:

1. Every applied migration required to reproduce the live schema.
2. Source for every deployed Edge Function.
3. Database types matching the live schema.
4. Application helpers matching current RLS/storage/RPC contracts.
5. Phase documentation recording source-of-truth and release boundaries.

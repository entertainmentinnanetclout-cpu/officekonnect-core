# OfficeKonnect Architecture

## Architectural rule

Preserve and extend the existing Supabase data model and state machines. Do not create parallel workflow, signing, document-version, spreadsheet, role or storage systems unless a demonstrated gap requires an additive model.

## Runtime layers

### Client

- React 19
- TanStack Router
- TanStack Query
- Tailwind/Radix component system
- PDF.js/react-pdf for viewing
- pdf-lib for deterministic PDF manipulation where appropriate
- xlsx for XLSX/XLS/CSV interoperability at the application boundary

### Server application layer

TanStack Start server functions provide authenticated application operations. They use the active workspace resolved from the authenticated Supabase identity and must not bypass live RLS/state-machine contracts.

### Supabase

- Auth identity and JWT claims
- Postgres persistence
- Row Level Security
- private helper schema for privileged state-machine internals
- Storage buckets partitioned by workspace
- RPCs for sensitive transitions
- Edge Functions for external signing and PDF finalization

## Workspace isolation

Canonical storage path convention:

```text
{workspace_id}/{user_id}/{resource...}
```

The first path segment remains the workspace id because live Storage RLS resolves workspace membership from that segment.

## Documents

`documents` is the canonical current-state record for uploaded files, native documents and spreadsheets. Structured content is stored in JSONB and guarded by `editor_version` optimistic concurrency. `document_versions` stores immutable snapshots.

Do not create a second native-document or spreadsheet table.

## OfficeKonnect Sheets

Spreadsheet documents remain normal rows in `documents` with `document_kind = 'spreadsheet'`. The authoritative workbook is `documents.content` using `kind: "workbook"` and `schemaVersion: 1`.

`src/lib/spreadsheet.ts` is the canonical application workbook model and calculation engine. Imported XLSX/CSV structures are normalized into this model; the application does not keep a second XLSX-native persistence format.

Spreadsheet saves use `save_structured_document` and restores use `restore_structured_document_version`. Server functions recompute workbook metrics before save rather than trusting browser-provided metadata.

`src/lib/spreadsheet-pdf.server.ts` is the spreadsheet PDF renderer. Static spreadsheet signing copies create a private PDF `documents` row plus version 1 without bypassing the signing request state machine.

## Files organization

Phase 4 adds an organizational layer over `documents`; it does not create a second file store.

- `workspace_folders` stores nested workspace folders.
- `document_folder_items` stores a document's current folder assignment.
- `document_favorites` stores user-specific favourites.
- `document_shares` stores explicit workspace-internal, view-only share markers.

Moving a document between folders updates relational organization metadata only. Existing private Storage paths remain stable. Uploaded-file duplication is the one Files operation that creates a new binary: it copies the actual private object to a fresh document-owned path and creates a fresh document plus version 1.

Folder hierarchy integrity is enforced in PostgreSQL as well as in the application. Self-parenting and descendant cycles are rejected.

### Controlled sharing

`document_shares.permission` is restricted to `view`, and recipients must already be members of the same workspace. `list_workspace_member_directory` is a membership-checked security-definer RPC used by controlled pickers.

The pre-existing document SELECT policy already grants workspace members access to workspace documents. Explicit shares power the **Shared with me** organizational surface and do not claim to replace the existing workspace visibility boundary.

## Document and spreadsheet templates

`document_templates` remains the canonical reusable-template table. Template content stores the same native-document or canonical workbook JSON used by the source editor. Creating from a template produces a normal new `documents` row and records `template_id`.

Mail Center email templates remain separate.

## Workflows and approvals

Phase 5 exposes the existing server-authoritative workflow state machine rather than creating a new approval engine.

Canonical workflow relations:

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

### Template definitions and revisions

Workflow templates are managed by workspace owners/admins. Steps are ordered and may be review, approval or acknowledgement actions. Assignment resolution is delegated to the existing backend contract: specific user, workspace role, document creator or workflow starter.

A design change creates a **new versioned template revision** rather than mutating the definition already referenced by historical/running workflows. The previous revision is retired only after the new template row and ordered step set are successfully created.

### Immutable submission contract

Starting a workflow is performed through `start_document_workflow`. The RPC creates an immutable `document_versions` snapshot and stores its id on `workflow_runs.document_version_id` together with the editor version at submission.

The workflow review UI must always render this submitted version. The normal `documents` row remains the mutable working document and is opened separately only when changes are requested.

For workflow review:

- native documents render the submitted structured content;
- Sheets render the submitted canonical workbook as read-only;
- PDFs render the exact submitted private Storage binary via a short-lived signed URL;
- other uploaded file types remain downloadable as the exact submitted binary.

### Decisions and state transitions

The browser must not directly update lifecycle columns on runs, steps or assignments.

An authenticated user gets decision controls only for their pending assignment on the active step. The action set is derived from the step configuration and submitted through `submit_workflow_decision`:

- approve;
- changes requested;
- reject; or
- acknowledge.

The RPC validates assignment ownership, active step status, action eligibility, required-decision counts and progression/termination.

### Request changes and resubmission

A `changes_requested` workflow keeps the current submitted version immutable. The authorised user edits the canonical working document or spreadsheet, then calls `resubmit_document_workflow` with the current expected `documents.editor_version`.

The backend creates the next immutable document version, increments `workflow_revision` and reopens the workflow sequence. This preserves optimistic concurrency and a complete revision/decision audit trail.

### Work queue

`workflow_work_queue` is already scoped to `auth.uid()`, pending assignments and the active step. `/dashboard/approvals` consumes the view directly instead of rebuilding access filtering client-side.

Pending work is grouped by due date as Overdue, Due soon, Upcoming or No deadline. Completed user history comes from immutable `workflow_decisions`, not from a fabricated queue state.

### Comments, reassignment and cancellation

Workflow comments remain RLS-protected rows. Update/resolve operations use the existing RPCs. Active assignment reassignment and workflow cancellation also use their existing auditable RPCs and require reasons in the OfficeKonnect UX.

## E-signatures

Canonical signing tables include:

- signing_requests
- signing_participants
- signing_fields
- signing_tokens
- signing_events
- signing_certificates
- private signing sessions

The signing state machine is server-authoritative. Frontend code must not directly force request/participant lifecycle states controlled by hardened RPCs.

### External signing

A raw invitation token is exchanged once for a short-lived session. The raw token must not remain the long-lived browser session identifier. External signing uses the deployed `signing-external` Edge Function and server-side hashed token/session material.

### Finalization

`signing-finalize` is the canonical server-side PDF finalizer. It embeds completed fields into the immutable source PDF, calculates hashes, stores the completed PDF and certificate in private exports, and completes the database finalization contract.

## Security boundaries

- Browser uses publishable Supabase credentials only.
- Service-role credentials are server/Edge Function only.
- RLS remains enabled.
- State-machine tables are mutated through approved RPCs/Edge Functions where structural locks require it.
- No development-mode work may replace `auth.uid()` or workspace RLS with fake client identity.
- Spreadsheet imports/exports do not weaken document ownership or create public workbook storage.
- Files organization metadata remains workspace-scoped and does not move binaries outside private Storage.
- Explicit file shares are workspace-internal and view-only.
- Workflow submissions are immutable versions; workflow status is never a browser-authored source of truth.
- `workflow_work_queue` is consumed as an auth-scoped database view, not broadened in client code.

## Phase 0 repository parity

The repository must contain:

1. Every applied migration required to reproduce the live schema.
2. Source for every deployed Edge Function.
3. Generated database types matching the live schema.
4. Application helpers matching the current RLS/storage/RPC contracts.

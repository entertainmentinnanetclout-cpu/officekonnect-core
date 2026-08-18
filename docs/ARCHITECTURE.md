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

TanStack Start server functions provide authenticated application operations. They must use the active workspace resolved from the authenticated Supabase identity and must not bypass live RLS/state-machine contracts.

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

The first path segment must remain the workspace id because live Storage RLS resolves workspace membership from that segment.

## Documents

`documents` is the canonical document record for uploaded files, native documents and spreadsheets. Structured content is stored in JSONB and guarded by `editor_version` optimistic concurrency. `document_versions` stores immutable snapshots.

Do not create a second native-document or spreadsheet table.

## OfficeKonnect Sheets

Spreadsheet documents remain normal rows in `documents` with `document_kind = 'spreadsheet'`. The authoritative workbook is `documents.content` using `kind: "workbook"` and `schemaVersion: 1`.

`src/lib/spreadsheet.ts` is the canonical application workbook model and calculation engine. It owns normalization, sparse A1-addressed cells, worksheet layout/print state, workbook metrics, clipboard/fill helpers and formula evaluation. Imported XLSX/CSV structures are converted into this model; the application does not keep a second XLSX-native persistence format.

Spreadsheet saves use the existing `save_structured_document` RPC and restores use `restore_structured_document_version`. Server functions recompute sheet/cell/formula metrics before save rather than trusting browser-provided metadata. The existing Phase 3 database constraints, ACLs, RLS and calculation metadata remain authoritative.

`src/lib/spreadsheet-pdf.server.ts` is the canonical spreadsheet PDF renderer. It consumes the same persisted workbook and formula evaluator as the editor, then writes private export/signing-copy artifacts through the existing Storage/document-version architecture.

The static spreadsheet signing bridge creates a PDF `documents` row plus version 1. It does not create or bypass the signing request state machine; full signing preparation/finalization remains owned by the Phase 6 signing architecture.

## Workflows

Canonical tables:

- workflow_templates
- workflow_template_steps
- workflow_runs
- workflow_steps
- workflow_step_assignees
- workflow_decisions
- workflow_comments
- workflow_events

Sensitive transitions use the existing workflow RPCs. A workflow operates against an immutable submitted document version rather than mutable working content.

## E-signatures

Canonical tables include:

- signing_requests
- signing_participants
- signing_fields
- signing_tokens
- signing_events
- signing_certificates
- private signing sessions

The signing state machine is server-authoritative. Frontend code must not directly force request/participant lifecycle states that are controlled by hardened RPCs.

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

## Phase 0 repository parity

The repository must contain:

1. Every applied migration required to reproduce the live schema.
2. Source for every deployed Edge Function.
3. Generated database types matching the live schema.
4. Application helpers matching the current RLS/storage/RPC contracts.

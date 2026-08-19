# OfficeKonnect Phase 5 — Workflows and Approvals

Completed: 2026-08-18

## Objective

Expose the existing Supabase workflow/review/approval state machine as a production OfficeKonnect experience without introducing a second workflow engine, weakening RLS or allowing browser code to force lifecycle states.

## Canonical backend reused

Phase 5 required **no new database migration during the completion pass**. The reconciled repository already contains the live workflow foundation:

- `20260727073944_phase_4_workflow_review_approval_foundation.sql`
- `20260727074025_phase_4_workflow_foreign_key_indexes.sql`
- `20260727074211_phase_4_workflow_snapshot_hardening.sql`
- `20260727074343_phase_4_workflow_comment_integrity.sql`
- `20260727074545_phase_4_workflow_composite_indexes.sql`

Canonical workflow relations remain:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_runs`
- `workflow_steps`
- `workflow_step_assignees`
- `workflow_decisions`
- `workflow_comments`
- `workflow_events`
- `workflow_work_queue` — authenticated pending-assignment view

Canonical transition/comment RPCs reused:

- `start_document_workflow`
- `submit_workflow_decision`
- `resubmit_document_workflow`
- `reassign_workflow_assignment`
- `cancel_document_workflow`
- `resolve_workflow_comment`
- `update_workflow_comment`

## Workflow templates

`/dashboard/workflows` now includes production template management for workspace owners/admins.

A template defines ordered review, approval or acknowledgement steps. Each step may resolve its assignees from:

- a specific workspace member;
- a workspace role;
- the document creator; or
- the workflow starter.

Each step may define required decisions, optional step due hours and whether review/approval participants may request changes or reject. Acknowledgement steps are constrained to acknowledgement semantics.

### Immutable template revision policy

Existing template definitions are not rewritten in place when their workflow design changes. Creating a revision produces a new versioned `workflow_templates` row and a fresh ordered set of `workflow_template_steps`, then retires the previous revision after the new revision is complete.

Running workflows are unaffected because the existing start RPC copies the chosen template version and step definitions into the workflow run.

## Starting a workflow

The Workflows surface can start a real workflow for an existing OfficeKonnect document, spreadsheet or uploaded file using an active workflow template and optional overall due date.

`start_document_workflow` remains authoritative. It:

1. verifies the authenticated user and workspace/document/template rules;
2. creates an immutable `document_versions` submission snapshot;
3. creates the workflow run against that exact document version;
4. copies ordered workflow steps and assignees into the run;
5. activates the first step; and
6. writes the workflow event/notification/activity records required by the existing backend contract.

The browser never fabricates a submitted snapshot or directly activates a step.

## Immutable review workspace

`/dashboard/workflows/$runId` is the production review workspace.

The centre panel renders the exact `document_versions` row referenced by the workflow run:

- native documents render from submitted structured content;
- OfficeKonnect Sheets render a read-only canonical workbook snapshot;
- submitted PDFs render from the submitted private Storage binary using a short-lived signed URL;
- other uploaded office files remain downloadable as the exact submitted binary.

The working document is deliberately separate. Review decisions apply to the immutable submitted version until a controlled resubmission creates another version and increments `workflow_revision`.

## Decisions and active assignments

A user receives decision controls only when they own a pending assignment for the active workflow step.

The UI derives the available actions from the canonical step type/configuration:

- Approve
- Request changes
- Reject
- Acknowledge

Request Changes and Reject require an explanatory note in the application UX. Every decision is submitted through `submit_workflow_decision`; the frontend does not directly update run, step or assignment lifecycle columns.

## Request changes and resubmission

When a workflow enters `changes_requested`:

- the previous submitted version remains immutable and reviewable;
- authorised users may open the normal working document/sheet editor;
- the resubmission action passes the current `documents.editor_version` into `resubmit_document_workflow`;
- the RPC creates a new immutable document version, increments workflow revision and reopens the workflow sequence according to the existing backend contract.

This preserves optimistic concurrency and an auditable revision history.

## Comments, reassignment and cancellation

The review workspace exposes:

- workflow-level or step-level comments;
- comment editing by the author/admin under existing rules;
- resolve/reopen through `resolve_workflow_comment`;
- active-assignment reassignment by owners/admins through `reassign_workflow_assignment`, with a required reason;
- workflow cancellation by an authorised starter/admin through `cancel_document_workflow`, with a required reason;
- immutable workflow events and decision history for review context.

## Approvals work queue

`/dashboard/approvals` is built directly on `workflow_work_queue`.

The view already filters to the authenticated user's pending assignment on the active workflow step. The application therefore does not recreate access filtering in JavaScript.

Current work is grouped into:

- Overdue
- Due soon — within 48 hours
- Upcoming
- No deadline

A separate **Recently completed by you** section reads immutable `workflow_decisions` where the current user is the actor. Pending work and historical decisions remain separate concepts.

## Live RLS verification

RLS remains enabled on all eight workflow state tables. Phase 5 verified the live policy surface:

| Relation                  |     RLS | Policies |
| ------------------------- | ------: | -------: |
| `workflow_templates`      | enabled |        4 |
| `workflow_template_steps` | enabled |        4 |
| `workflow_runs`           | enabled |        1 |
| `workflow_steps`          | enabled |        1 |
| `workflow_step_assignees` | enabled |        1 |
| `workflow_decisions`      | enabled |        1 |
| `workflow_comments`       | enabled |        2 |
| `workflow_events`         | enabled |        1 |

No RLS rule was weakened for Phase 5.

## Production data integrity

The Phase 5 completion pass deliberately seeded no demo workflows. Live verification after implementation showed:

- `workflow_templates`: 0 rows
- `workflow_runs`: 0 rows
- `workflow_decisions`: 0 rows
- `workflow_comments`: 0 rows

Real workflow data will be created only through normal user actions.

## Application surfaces

- `/dashboard/workflows`
- `/dashboard/workflows/$runId`
- `/dashboard/approvals`
- `src/lib/workflows.ts`
- `src/lib/workflows.functions.ts`
- `src/components/workflow/workflow-snapshot.tsx`
- `src/lib/workflows.test.ts`

The generated TanStack route tree contains all three Phase 5 routes.

## Validation

Clean source checkpoint before documentation: `556a605457f7f6a033e2f2d89fc50a7b2c18a993`.

Upgrade Validation run `32105437719` passed:

- repository parity — PASS;
- frozen dependency install (`bun ci`) — PASS;
- ESLint — PASS, 0 errors;
- TypeScript (`tsc --noEmit`) — PASS;
- Bun regression tests — **24 passed / 0 failed**, 83 expectations across 6 files;
- production build — PASS.

Vercel deployment validation is intentionally deferred until the Phase 11 release-candidate gate.

## Known limitations carried forward

- Workflow template management is restricted to workspace owners/admins.
- The existing workflow state machine is ordered/sequential; Phase 5 does not invent parallel branching outside the backend contract.
- Non-PDF uploaded office documents are reviewed by downloading the exact immutable submitted binary rather than by an in-browser Office renderer.
- Native document and spreadsheet workflow snapshots are read-only review representations; editing happens only in the canonical working editor.
- Full production e-signature preparation, participants, fields, external signing sessions, finalization, audit and certificates remain Phase 6.
- Tasks, calendar and global search remain Phase 7.

## Next phase

**Phase 6 — Production E-Signatures.** Reuse the hardened signing request/participant/field/token/session/finalization backend and replace the remaining obsolete frontend signing path with the production signing dashboard, preparation workspace, internal/external signer UX, audit timeline and certificate/final PDF access.

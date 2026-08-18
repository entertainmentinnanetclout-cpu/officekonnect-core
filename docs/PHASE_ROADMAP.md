# OfficeKonnect Phase Roadmap

## Phase 0 — Canonical reconciliation — **Completed**

Reconcile GitHub with live Supabase: migrations, Edge Functions, generated types, storage contracts, signing contracts and architecture documentation.

## Phase 1 — Development identity and application shell — **Completed**

Implement the authless development UX while preserving real Supabase identity/RLS. Replace the V1 shell with the canonical OfficeKonnect navigation and workspace shell.

## Phase 2 — Documents, native editor and PDF engine — **Completed**

Complete the document library, native editing, autosave/version history, printing and canonical PDF export.

## Phase 3 — OfficeKonnect Sheets — **Completed**

Expose the existing workbook backend through a production spreadsheet UI, deterministic formula engine, XLSX/CSV interoperability, print/PDF and static signing-copy conversion.

## Phase 4 — Files and templates — **Next**

Add folders, favourites, controlled sharing and complete document/spreadsheet templates.

## Phase 5 — Workflows and approvals

Build template management, work queue, immutable review UI, decisions, comments, changes and resubmission over the existing workflow state machine.

## Phase 6 — Production e-signatures

Replace obsolete frontend signing mutations with the hardened signing request/participant/field/session/finalization system. Build internal/external signer UX, audit timeline and certificate access.

## Phase 7 — Tasks, calendar and global search

Add the minimal missing task/event persistence and aggregate operational deadlines. Implement command/search navigation.

## Phase 8 — Notifications, activity, team, workspace and settings

Expose existing platform infrastructure through complete user-facing management surfaces.

## Phase 9 — Product-wide UX and route hardening

Eliminate dead actions, mocks, placeholders, fake metrics, broken links and unhandled states. Complete responsive/accessibility work.

## Phase 10 — Security, performance, automated testing and CI

Add unit/integration/E2E testing, deterministic real-PDF signing tests, CI gates, security checks and performance hardening.

## Phase 11 — Release candidate and documentation

Complete handoff documentation, release QA and the canonical create→review→approve→sign→finalize product journey.

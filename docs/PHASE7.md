# OfficeKonnect Phase 7 — Tasks, Calendar and Global Search

Status: **Completed and validated**

Date: 2026-08-18

## Objective

Complete the operational coordination layer with real workspace persistence and RLS: Tasks, an aggregate operational Calendar, and permission-scoped global Search/command navigation.

Phase 7 does not use fake browser state, duplicate workflow/signing dates into another database, or introduce a second search index.

## Live migrations

Applied to Supabase and checked into GitHub under their exact live versions:

- `20260818062157_phase_7_tasks_calendar_search`
- `20260818080155_phase_7_rpc_execute_acl_hardening`

Migration files:

- `supabase/migrations/20260818062157_phase_7_tasks_calendar_search.sql`
- `supabase/migrations/20260818080155_phase_7_rpc_execute_acl_hardening.sql`

The ACL-hardening migration revokes anonymous `EXECUTE` from both `search_workspace_objects` and `list_workspace_member_directory` while retaining the authenticated application contract. This closes the unnecessary public execution surface without weakening the membership checks or changing application semantics.

## Tasks

### Persistence

New canonical `public.tasks` table stores:

- workspace id;
- title/description;
- status: `todo`, `in_progress`, `blocked`, `done`, `cancelled`;
- priority: `low`, `medium`, `high`, `urgent`;
- assignee;
- creator;
- start/due/completed timestamps;
- optional operational object link via `entity_type` + `entity_id`;
- timestamps.

Database constraints enforce:

- non-empty bounded titles;
- valid status/priority;
- start not after due date;
- completed timestamp for `done` tasks.

Indexes cover workspace/status/due, assignee/workspace/status/due and linked operational objects.

### Security

RLS is enabled with four policies:

- workspace members read;
- members create under their own identity;
- creator/assignee/admin update;
- creator/admin delete.

Assigned users must already be workspace members.

### `/dashboard/tasks`

Production Tasks includes:

- Board and list views.
- To do, In progress, Blocked and Done lanes.
- All tasks / Assigned to me / Created by me filters.
- Priority filtering.
- Search.
- Open, Mine, Overdue and Completed counters.
- Create/edit/delete.
- Assignment.
- Priority/status changes.
- Start and due times.
- Direct status movement.
- Links to a document/sheet, workflow or signing request.
- Direct `?task=<id>` opening for search/calendar navigation.

## Calendar

### Persistence model

Only manual office calendar entries are stored in the new `public.calendar_events` table.

Fields include:

- workspace/creator;
- title/description;
- start/end;
- all-day state;
- location;
- optional operational object link;
- timestamps.

Database range constraints prevent an end time before the start.

RLS is enabled with four policies:

- members read;
- members create under their own identity;
- creator/admin update;
- creator/admin delete.

### Derived operational dates

The Calendar deliberately **does not duplicate operational deadlines**. The UI derives read-only entries at query time from their canonical modules:

- task start dates;
- task due dates;
- workflow-run due dates;
- workflow-step due dates;
- active signing-request expiry dates.

This keeps each state machine/source table authoritative.

### `/dashboard/calendar`

Production Calendar includes:

- month navigation;
- current-day navigation;
- month grid;
- selected-day agenda;
- source filters;
- manual event create/edit/delete;
- all-day support;
- location/description;
- operational source links;
- distinct source treatments for Manual / Tasks / Workflows / Workflow steps / E-signatures.

## Global Search

### Backend contract

RPC:

`search_workspace_objects(p_workspace_id, p_query, p_limit)`

Properties:

- `security definer` with restricted `search_path`;
- explicitly verifies current-user workspace membership;
- anonymous `EXECUTE` revoked;
- executable by authenticated application users only;
- no public search table/index containing copied application data.

Current search coverage:

- native documents and Sheets;
- document/spreadsheet templates;
- workflow runs;
- signing requests;
- tasks;
- workspace members.

Results return a common navigable contract:

- object type/id;
- title/subtitle;
- application route;
- relevant timestamp;
- typed JSON metadata.

The existing `list_workspace_member_directory` security-definer RPC is hardened to the same authenticated-only execution boundary.

### Global command palette

The OfficeKonnect shell now provides a real search control and **Ctrl/Cmd+K** shortcut.

`src/components/search/global-search-dialog.tsx`:

- debounced live workspace search;
- grouped result types;
- direct navigation;
- permission-scoped results;
- no fake/static command data.

### `/dashboard/search`

Full-page search includes:

- larger live search result set;
- type filters;
- result counts;
- direct operational navigation;
- empty/loading/error states.

## Navigation

Phase 7 activates Tasks and Calendar in the canonical desktop/mobile shell and adds Search as a real page/command surface.

## Live security and data verification

After Phase 7 implementation and ACL hardening:

- `tasks`: RLS enabled, 4 policies, 0 fabricated rows.
- `calendar_events`: RLS enabled, 4 policies, 0 fabricated rows.
- `search_workspace_objects`: membership checked; anonymous `EXECUTE` revoked; authenticated execution retained.
- `list_workspace_member_directory`: membership checked; anonymous `EXECUTE` revoked; authenticated execution retained.

Supabase's anonymous SECURITY DEFINER execution warnings for these two RPCs are cleared. The remaining authenticated SECURITY DEFINER advisor notices are intentional because the application calls these membership-checked RPCs as signed-in users.

No sample tasks or calendar events were inserted into production.

## Regression coverage

Phase 7 adds migration-contract tests that ensure:

- task and calendar persistence remains present;
- both operational tables keep RLS;
- global search remains server-side and membership checked;
- the core OfficeKonnect object categories remain covered by search.

## Validation

The completed Phase 6/7 implementation passed the canonical read-only gate with:

- repository parity;
- frozen `bun ci`;
- ESLint with 0 errors;
- TypeScript;
- **33 Bun tests / 0 failures**;
- production build.

The final ACL-hardening/documentation head is revalidated with the same read-only gate before Phase 7 is closed.

Vercel/deployment-platform validation remains intentionally deferred until Phase 11.

## Phase boundary

Phase 7 completes Tasks, Calendar and Global Search. Notifications, Activity, Team, Workspace and complete Settings management remain Phase 8.

# OfficeKonnect Phase 4 — Files and Templates

Status: **Completed and validated**

## Objective

Complete the generic OfficeKonnect file-organization and reusable-template surfaces without creating a parallel document store, changing private Storage conventions, or weakening workspace/RLS boundaries.

## Canonical architecture retained

- `documents` remains the canonical record for native documents, spreadsheets and uploaded files.
- `document_versions` remains the immutable version ledger.
- Uploaded binaries remain in the private `documents` Storage bucket using the established workspace-first path convention.
- `document_templates` remains the canonical reusable document/spreadsheet template table.
- Native document and workbook JSON contracts from Phases 2 and 3 are reused unchanged.

## Files

Phase 4 activates `/dashboard/files` and adds real workspace-scoped organization over the existing document records.

### Added backend relations

- `workspace_folders` — nested workspace folder hierarchy.
- `document_folder_items` — one current folder assignment per document.
- `document_favorites` — personal favourites per user.
- `document_shares` — explicit view-only share records between members of the same workspace.

These are organization/access metadata only. They do not duplicate document content or uploaded binaries.

### Folder invariants

- folder names are required and unique among siblings;
- folder ownership/admin policies control rename/delete;
- a database trigger prevents self-parenting and descendant cycles;
- moving a document between folders changes only its folder assignment, not its private Storage path;
- deleting a folder removes the organizational assignment/hierarchy but does not delete the underlying document.

### File actions

The Files workspace supports:

- real upload and drag/drop to private Storage;
- root and nested folder navigation;
- breadcrumbs;
- search and sorting;
- Favourites;
- Shared with me;
- Archive;
- Trash and restore;
- rename;
- move to folder/root;
- duplicate;
- download/export;
- controlled explicit sharing to workspace members.

Uploaded-file duplication copies the actual private Storage object to a fresh document-owned path and creates a fresh `documents` row plus version 1. Native documents and spreadsheets use their existing canonical duplicate functions.

## Controlled sharing

`document_shares` is intentionally restricted to `permission = 'view'` and to members of the same workspace. The `list_workspace_member_directory` security-definer RPC exposes only the member directory required by the share picker and verifies the caller is a member of the target workspace.

Important: the pre-existing document SELECT policy already allows workspace members to read workspace documents. Phase 4 therefore uses explicit shares as a controlled **Shared with me** organizational marker; it does not pretend to create a new privacy boundary or weaken existing RLS. External/public-link sharing is not introduced in this phase.

## Templates

Phase 4 activates `/dashboard/templates` over the existing `document_templates` table.

Canonical categories:

- General
- Letters
- Reports
- Meeting Notes
- Agreements
- Forms
- Policies
- Proposals
- Internal Memos
- Spreadsheets

Functional template actions:

- search/filter by category and document/spreadsheet kind;
- preview persisted structured content;
- save an existing native document or spreadsheet as a template;
- create a new document or spreadsheet from a template;
- duplicate a template;
- edit name, description and category;
- archive and restore.

No sample or fabricated templates are injected into production.

Normal workspace members may create templates they own. Template owners and workspace admins may update/archive them. This extends the existing table rather than introducing a second template system. Mail Center email templates remain a separate existing feature and were not repurposed.

## Migrations

Phase 4 adds two additive live migrations:

1. `20260818051912_phase_4_files_templates_workspace_organization`
2. `20260818052526_phase_4_folder_hierarchy_cycle_guard`

Both are applied to the live Supabase project and checked into `supabase/migrations/` with their live version numbers.

## Security verification

Live Supabase verification confirms RLS is enabled on all four Phase 4 organization tables:

- `workspace_folders` — 4 policies
- `document_folder_items` — 2 policies
- `document_favorites` — 3 policies
- `document_shares` — 3 policies

`list_workspace_member_directory` is a security-definer function with membership enforcement and a restricted search path.

No service-role secret was added to browser code. Existing `auth.uid()`, workspace membership and document ownership/admin policies remain authoritative.

## Validation

Clean source checkpoint validation includes:

- repository parity;
- frozen `bun ci` install;
- ESLint;
- TypeScript;
- Bun regression tests;
- production build.

Phase 4 adds four template-contract tests. The clean source suite is **19 passed / 0 failed** across five files.

## Known limitations carried forward

- Explicit sharing is workspace-internal and view-only in Phase 4.
- Existing workspace-wide document read visibility remains unchanged; explicit shares are not a replacement ACL system.
- External/public link sharing is intentionally not introduced.
- Folder moves do not physically relocate Storage binaries; stable private object paths are deliberate.
- Template previews are structured summaries rather than rendered image thumbnails.
- Version-history rendering remains available through the document/spreadsheet surfaces rather than duplicated inside Files.

## Next phase

**Phase 5 — Workflows and Approvals**: expose the existing hardened workflow state machine through production template management, work queue, immutable review, decisions, comments, changes and resubmission UX.

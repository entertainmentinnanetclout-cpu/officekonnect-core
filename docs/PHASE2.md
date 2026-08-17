# Phase 2 — Documents, Native Editor and PDF Engine

## Goal

Complete the OfficeKonnect document library, native structured-document editing, autosave/version history, printing, and canonical PDF export without creating a competing persistence or security model.

## Canonical backend contract

Phase 2 uses the existing live Supabase document architecture:

- `documents` is the canonical current-state row.
- `document_versions` stores immutable structured snapshots and binary versions.
- `save_structured_document` is the atomic save RPC with optimistic concurrency.
- `restore_structured_document_version` restores a snapshot after first creating a pre-restore backup.
- Workspace membership, `auth.uid()`, ownership and RLS remain authoritative.
- Uploaded binaries remain in private Supabase Storage.

No document table, version table, ownership model or bypass API was added for Phase 2.

## Native document contract

Native documents use `schemaVersion: 1` and a structured block model covering:

- paragraphs;
- headings 1–3;
- quotes;
- bullet and ordered lists;
- tables;
- horizontal rules;
- explicit page breaks;
- page size and orientation;
- margins;
- header/footer text;
- page-number preference.

Legacy structured blocks are normalized into this contract when opened so existing content is preserved rather than discarded.

## Editor

The native editor provides:

- title rename;
- autosave with visible saved/dirty/saving/error states;
- Ctrl/Cmd+S;
- optimistic-concurrency conflict detection;
- undo/redo;
- headings and paragraph formatting;
- bold, italic, underline and strikethrough;
- text and highlight color;
- alignment and indentation;
- links;
- quotes;
- bullet and numbered lists;
- tables;
- rules and page breaks;
- find and replace;
- zoom;
- A4/Letter and portrait/landscape page setup;
- margins, headers, footers and page numbers;
- workspace letterhead selection;
- immutable version snapshots and restore.

## PDF engine

PDF generation is server-side and deterministic using the same structured JSON that is persisted by autosave. It supports:

- A4 and Letter;
- portrait and landscape;
- configured margins;
- multi-page content;
- headings, paragraphs, quotes and lists;
- tables;
- rules and explicit page breaks;
- letterhead header/footer/company information;
- optional letterhead logo;
- page numbers;
- OfficeKonnect PDF metadata.

Generated exports are written to the private `exports` bucket under the active workspace and returned using an expiring signed URL.

## Document library

The Phase 2 library provides:

- new native document creation;
- private signed file uploads;
- drag-and-drop upload;
- title search;
- kind filtering;
- updated/created/title sorting;
- table and grid views;
- rename;
- native-document duplication;
- archive;
- recoverable Trash;
- restore to Documents;
- uploaded-file download;
- native PDF export.

Folders, favourites, advanced sharing and the production spreadsheet editor remain later-phase responsibilities and are not duplicated here.

## Storage compatibility

Document-file resolution checks the canonical `documents`, `document-versions`, and `exports` buckets so generated or flattened versions do not become unreadable when the stored path moves between approved private buckets.

## Backend synchronization

A new additive migration updates stale product-era comments to the generic OfficeKonnect document contract. It changes no rows, permissions, RLS policies, RPC behavior, or historical migration files.

## Validation checklist

- [x] Existing Supabase document/version architecture reused.
- [x] No RLS or ownership weakening.
- [x] Native editor implemented.
- [x] Autosave uses optimistic concurrency.
- [x] Immutable version snapshots and restore implemented.
- [x] Deterministic server PDF renderer implemented.
- [x] Document library lifecycle uses archive/trash/restore rather than destructive hard delete.
- [x] Live backend comment migration applied and source migration recorded.
- [ ] Repository parity, frozen install, ESLint, TypeScript and production build green on the final Phase 2 head.
- [ ] Vercel deployment status green on the final Phase 2 head.

## PR strategy

Phase 2 remains on draft PR #2 with Phases 0–1. Phases 3–11 continue on the same branch and PR. Do not merge to `main` until the Phase 11 release-candidate gate is complete.

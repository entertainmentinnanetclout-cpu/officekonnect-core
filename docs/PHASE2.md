# Phase 2 — Documents, Native Editor and PDF Engine

## Status

Phase 2 source implementation and validation are complete on draft PR #2. Phase 3 — OfficeKonnect Sheets — is next. The upgrade PR remains draft and must not merge to `main` until the complete Phase 11 release-candidate gate passes.

## Canonical architecture

Phase 2 extends the existing OfficeKonnect document architecture. It does not introduce a competing document model.

- `documents` remains the canonical current document/file record.
- `document_versions` remains the canonical version history and immutable file-version record.
- Native structured content continues to use the existing `documents.content` JSON contract.
- `save_structured_document` and the existing editor-version contract remain the save/concurrency authority.
- Existing workspace membership, `auth.uid()`, ownership and RLS remain authoritative.
- Existing private document, document-version, export and letterhead storage contracts are reused.
- No new Phase 2 table or security model was introduced. The required native-document/version schema was already present in the live Supabase project and reconciled migration ledger.

## Document library

The existing real document library is retained rather than rebuilt. It supports:

- native document creation;
- private signed file uploads and drag-and-drop upload;
- search, sort, kind and lifecycle-status filters;
- table and grid views;
- rename;
- native duplication;
- archive, recoverable Trash and restore;
- native PDF export;
- uploaded-file download.

Folders, favourites and broader controlled-sharing surfaces remain Phase 4 work and are not claimed as Phase 2 completion.

## Native document editor

The editor retains the OfficeKonnect structured-document contract and supports:

- paragraphs and H1/H2/H3 headings;
- bold, italic, underline and strikethrough;
- text colour and highlight colour;
- left/centre/right/justify alignment;
- bullet and ordered lists;
- links;
- block quotes;
- tables;
- horizontal rules and page breaks;
- undo/redo;
- find and replace;
- A4 and Letter page sizes;
- portrait and landscape orientation;
- configurable margins;
- headers, footers and page numbers;
- workspace letterheads;
- zoom;
- autosave, explicit save, optimistic editor-version concurrency and version snapshots/history/restore.

Phase 2 hardening additionally:

- persists block indentation in the canonical JSON instead of relying on transient browser-only formatting;
- writes generated block IDs back into the editor DOM so block identity remains stable across saves;
- prevents ordinary autosave prop refreshes from unnecessarily rehydrating `innerHTML` and disturbing the active cursor/selection;
- forces the latest editor state through the save barrier before PDF export, print preparation or signing-copy generation;
- disables export/signing-copy actions while the document is saving or in an edit conflict.

## Deterministic PDF engine

The server-side `pdf-lib` renderer consumes the same normalized structured content used by the editor and supports:

- A4 and Letter output;
- portrait and landscape orientation;
- document margins;
- multi-page layout and explicit page breaks;
- paragraph, heading, quote, list, table and rule rendering;
- alignment and persisted indentation;
- bold, italic, underline and strikethrough;
- text colour and highlight backgrounds;
- letterhead/logo/header/footer regions;
- page numbering;
- deterministic PDF metadata using the persisted source update timestamp rather than a fresh render-time timestamp.

PDF export updates `page_count`, writes the generated PDF to the existing private `exports` bucket and returns a short-lived signed URL.

## Static signing-copy preparation

Phase 2 adds `createNativeDocumentSigningCopy` as the document-to-static-PDF bridge required by the later production signing phase.

For a native document it:

1. resolves the authenticated user's active workspace;
2. verifies that the source belongs to that workspace and is not deleted;
3. renders the current saved structured document through the canonical PDF engine;
4. stores the PDF under the existing private document storage contract;
5. creates a normal derived `documents` row named `<Original> — Signing Copy` with `document_kind = file` and `file_type = application/pdf`;
6. creates version 1 in the existing `document_versions` table;
7. rolls back the stored asset/document record if the derived document/version write fails.

This does **not** claim Phase 6 e-signature completion. Signing-request preparation, participant/field UX, external sessions, finalization, audit and certificates remain Phase 6 and continue to use the existing hardened signing architecture.

## Regression validation

Phase 2 adds Bun regression tests for the native document normalization contract and real PDF generation. The PDF tests load actual `pdf-lib` output and verify multi-page output, deterministic metadata and Letter landscape dimensions.

The permanent Upgrade Validation gate now runs:

- repository parity;
- frozen `bun ci` dependency installation;
- ESLint;
- TypeScript;
- Bun tests;
- production build.

The clean Phase 2 source checkpoint `7d6a9e39df6003637e01746571378eaa1305cc27` passed Upgrade Validation run `32093695102`, and Vercel reported a successful deployment for the same checkpoint.

## Known limitations carried forward

- The native PDF renderer currently uses PDF Standard Fonts/WinAnsi. Unsupported Unicode glyphs are safely replaced rather than crashing export; arbitrary embedded-font coverage remains future hardening work.
- The current native structured-document schema does not claim arbitrary inline/native image blocks. Letterhead/logo imagery is supported through the existing letterhead contract.
- Folder/favourite/general sharing completion is Phase 4.
- Spreadsheet editing/export is Phase 3.
- Full production e-signature request and signing UX is Phase 6.

## Database change record

No new database migration was required for this Phase 2 completion pass. The live Supabase project already contained the canonical native-document, document-version, storage and signing-source-version foundations required here, including the previously reconciled generic OfficeKonnect document-contract migration.

## PR strategy

Phase 2 remains on draft PR #2 with Phases 0–1. Phases 3–11 continue on the same branch and PR. Do not merge to `main` until the Phase 11 release-candidate gate is complete.

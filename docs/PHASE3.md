# Phase 3 — OfficeKonnect Sheets

## Goal

Complete the production OfficeKonnect spreadsheet surface over the existing Phase 3 Supabase workbook contract without introducing a second spreadsheet table, persistence model or security boundary.

## Canonical backend contract

Phase 3 reuses the reconciled live Supabase spreadsheet foundation already present in the migration ledger:

- `documents.document_kind = 'spreadsheet'` identifies workbook documents.
- `documents.content` remains the authoritative JSONB workbook state.
- workbook JSON uses `kind: "workbook"` and `schemaVersion: 1`.
- `document_versions` stores immutable workbook milestones.
- `save_structured_document` remains the atomic optimistic-concurrency save RPC.
- `restore_structured_document_version` remains the controlled restore RPC and creates a pre-restore backup.
- authoritative `sheet_count`, `cell_count`, `formula_count`, `calculation_version` and `last_calculated_at` metadata stay synchronized by the existing structured-document backend.
- Supabase Auth, workspace membership and RLS remain authoritative.

No new Phase 3 database table or migration was required during this completion pass because the recovered/live schema already contained the required workbook, version, ACL and RPC hardening.

## Workbook model

The client/server workbook implementation is centralized in `src/lib/spreadsheet.ts`.

The canonical persisted shape is:

```json
{
  "kind": "workbook",
  "schemaVersion": 1,
  "activeSheetId": "sheet-id",
  "sheets": []
}
```

Each worksheet stores sparse A1-addressed cells plus worksheet layout/print configuration. Legacy two-dimensional sheet `data` arrays are accepted only as an import/normalization compatibility path and are converted into the canonical sparse cell model; they are not maintained as a competing persistence format.

Supported persisted worksheet state includes:

- multiple worksheets and active worksheet;
- sparse cell values and formulas;
- bold/italic/underline/strikethrough;
- text and fill colour;
- alignment;
- general, number, currency, percent, date and text formats;
- borders;
- merged ranges;
- row heights and column widths;
- frozen row/column counts;
- PDF orientation, scaling, fit-to-width, margins, print area, repeated top rows and gridline preference.

## Formula engine

Phase 3 uses one deterministic parser/evaluator implemented in the canonical spreadsheet module. It does not use JavaScript `eval` and does not create a parallel calculation state store.

Supported syntax includes:

- A1 cell references;
- cross-sheet references, including quoted worksheet names;
- A1 ranges;
- arithmetic and exponentiation;
- comparisons;
- string concatenation;
- unary operations;
- cycle detection;
- spreadsheet errors: `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#CYCLE!`.

Current built-in functions include `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `ABS`, `INT`, `SQRT`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `POWER`, `MOD`, `IF`, `AND`, `OR`, `NOT`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `CONCAT` and `CONCATENATE`.

## Sheets library

`/dashboard/sheets` is the canonical spreadsheet library. It provides:

- blank spreadsheet creation;
- XLSX/XLS/CSV import;
- real workspace-scoped spreadsheet listing;
- title search;
- recently updated/recently created/title sorting;
- active/archive/Trash scopes;
- duplicate;
- archive;
- recoverable Trash;
- restore.

No sample production spreadsheets are generated.

## Spreadsheet editor

`/dashboard/sheets/<documentId>` opens the production editor. The shared `/dashboard/documents/<documentId>` route also renders the same editor for spreadsheet records, eliminating the previous Phase 3 placeholder.

The editor provides:

- cell editing and formula bar;
- row/column headers;
- mouse and keyboard range selection;
- copy/paste using tab/newline clipboard matrices;
- fill down/right;
- cell formatting;
- merged cells;
- sorting;
- active-column filtering;
- visibly frozen rows and columns;
- persisted selected row height and column width controls;
- worksheet add/delete/rename/reorder;
- large-sheet viewport expansion without rendering the full 10,000 × 256 safety ceiling at once;
- autosave with optimistic concurrency and visible save state;
- Ctrl/Cmd+S;
- immutable milestone versions and controlled restore.

Non-functional placeholder undo/redo buttons were removed rather than left as fake controls. Saved version history remains the durable rollback mechanism in this phase.

## XLSX and CSV interoperability

The locked `xlsx` dependency is used for office-file interoperability.

Import supports:

- `.xlsx`;
- `.xls`;
- `.csv`;
- multiple worksheets;
- values;
- formulas where provided by the source workbook;
- worksheet used-range expansion.

Export supports:

- whole-workbook XLSX;
- active-sheet CSV;
- formula preservation in XLSX output;
- column width export where supported by the library.

OfficeKonnect's canonical JSON workbook remains authoritative after import; imported XLSX structures are translated into that model rather than stored as a second workbook representation.

## PDF and print

`src/lib/spreadsheet-pdf.server.ts` is the server-side spreadsheet PDF renderer. It uses the same persisted workbook and formula evaluator as the editor.

Supported PDF behavior includes:

- worksheet selection;
- A4 output;
- portrait/landscape per worksheet;
- margins;
- print area;
- scale;
- fit-to-width;
- horizontal and vertical pagination;
- repeated top rows;
- gridlines;
- formatted text, fill and borders;
- merged-cell rendering where feasible;
- deterministic metadata using the persisted source update timestamp;
- page numbering;
- a 500-page safety limit.

PDF/Print always crosses a save barrier first so the server cannot render stale workbook state.

## Static signing-copy bridge

A spreadsheet can generate `<Original> — Signing Copy` as an immutable PDF in the existing private document/storage architecture.

The bridge:

1. flushes the latest workbook through the canonical save RPC;
2. renders the selected worksheets with the spreadsheet PDF engine;
3. uploads the PDF to the existing private `documents` bucket;
4. creates a normal PDF `documents` row;
5. creates version 1 in `document_versions`;
6. cleans up partial writes on failure.

It does **not** create a competing signing request engine. Participant preparation, fields, external signing sessions, audit and finalization remain Phase 6 and continue to use the existing hardened signing architecture.

## Security invariants

- no service-role credentials in browser code;
- no RLS weakening;
- no fake workspace/user identity;
- no spreadsheet-specific public tables;
- server functions resolve the active workspace and continue to rely on RLS/RPC authorization;
- static PDF derivatives remain in private Storage and are accessed with signed URLs.

## Automated regression coverage

Phase 3 adds Bun tests for:

- canonical workbook normalization;
- legacy data-array normalization;
- A1 address/range handling;
- authoritative sheet/cell/formula metrics;
- arithmetic/range/IF formulas;
- cross-sheet formulas;
- cycle detection;
- paste/fill behavior;
- merge/unmerge behavior;
- real `pdf-lib` spreadsheet output;
- portrait/landscape page geometry;
- worksheet-selection PDF export;
- PDF metadata.

## Known limitations carried forward

- the current formula set is deliberately focused rather than claiming full Microsoft Excel function parity;
- advanced Excel-only constructs such as macros, pivot tables, charts, conditional formatting and external workbook links are not represented as native OfficeKonnect workbook features in Phase 3;
- XLSX round-trip focuses on values/formulas/core worksheet geometry rather than perfect preservation of every Excel-specific style/feature;
- spreadsheet PDF uses PDF Standard Fonts/WinAnsi-safe fallback, consistent with the current document PDF engine;
- full approval/workflow submission is Phase 5;
- full e-signature request preparation and finalization is Phase 6;
- folders, favourites, controlled sharing and richer template management are Phase 4.

## PR strategy

Phase 3 remains on Draft PR #2 with Phases 0–2. Phase 4 continues on the same branch and PR. Do not merge to `main` until the Phase 11 release-candidate gate is complete.

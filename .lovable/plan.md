
# SignKonnect Document Engine — Phased Rebuild

We'll rebuild the document pipeline in **5 phases**, shipping a working, testable slice at the end of each. Original PDFs stay immutable; everything is done as an overlay that's flattened on export (industry-standard, matches DocuSign/Adobe Sign).

---

## Phase 1 — Rock-solid PDF workspace (this sprint)

Goal: opening any uploaded PDF Just Works, and signing works end-to-end.

**Viewer rebuild** (`src/components/document/pdf-workspace.tsx`, replaces `pdf-viewer.tsx`)
- Render ALL pages in a scrollable canvas (not one page at a time) — this is why signing feels broken today.
- Left rail: page thumbnails (click to jump, active highlight).
- Top toolbar: zoom in/out + % input, fit-width, fit-page, rotate page, fullscreen, page number jump, text search.
- Mobile: thumbnails collapse into a drawer; toolbar wraps.
- Proper error state with retry + download fallback when a PDF fails to render (bad MIME, corrupt file, expired signed URL).
- Refresh signed URL automatically when it nears expiry.

**Upload → preview reliability**
- Fix upload to always set correct `contentType` (many current uploads store as `application/octet-stream`, which is why previews fail).
- Backfill server fn to re-stamp `file_type` from actual file MIME on the row.
- Verify storage RLS path convention (`{workspace_id}/{user_id}/...`) is used everywhere.

**Signing UX rewrite** (Adobe Sign / DocuSign style, no popup)
- "Sign" button opens the right-side Signature Toolbox (already scaffolded, cleaned up).
- Pick saved signature OR draw/type a new one inline.
- Cursor attaches to a ghost signature; click anywhere on any page to drop it.
- Placed signature is a draggable + resizable + deletable overlay box (react-rnd), snap-to-page bounds.
- "Confirm & Save" flattens the placements into a new PDF version via `signature_apply` job (pdf-lib on the worker), stores as a new `document_versions` row, and updates status. Download returns the flattened PDF.

**Voice notes fix** (small, since it's blocking users today)
- Refresh signed URL before each playback so audio actually plays after recording.
- Retry transcription button wired to `enqueueTranscribe`.
- Verify MediaRecorder MIME is one Whisper accepts (`audio/webm;codecs=opus` → uploaded as `.webm`).

**Backend verification pass**
- Confirm buckets: `documents`, `document-versions`, `voice-notes`, `signatures` exist with correct public/private flags and RLS.
- Confirm `signature_apply` worker handler flattens and writes a new version.
- Confirm `pg_cron` job is hitting the correct env URL.

**Deliverable:** Upload a PDF → see every page → open toolbox → drop signature → confirm → download flattened signed PDF. Same for voice: record → playback → transcribe.

---

## Phase 2 — Overlay editor (fields + formatting)

Goal: sender can place fillable fields and visual elements on the PDF before sending.

- Reuse the Phase 1 workspace; add a left "Fields" palette:
  - Text, Multi-line text, Number, Email, Phone, Address, Date, Time, Currency
  - Checkbox, Radio, Dropdown
  - Signature, Initials, Signature date, Printed name
  - Shapes (rect, circle, line), Highlight, Freehand
- Selecting an element opens a **right-side Properties panel**:
  - Font family / size / color / bold / italic / underline / alignment (text elements)
  - Placeholder, default value, required flag, validation (email/phone/number)
  - Recipient assignment (populated in Phase 3)
- Canvas interactions: drag, resize, rotate, align guides, duplicate, lock, delete, undo/redo (Zustand history stack).
- Persist all elements as JSON in `signing_fields` (schema already exists) tied to the document.
- "Save as template" writes to a new `document_templates` table (fields JSON, name, thumbnail).

---

## Phase 3 — Send to recipient (registered users + guest email links)

- "Send" flow: pick recipients (existing users OR type an email → guest), assign each to specific fields, add message.
- Creates `signing_request` + `signing_participants` rows.
- Registered users: notification + dashboard "Waiting for you" list.
- Guests: Brevo email with a signed tokenized URL (JWT, expiring) → opens a public `/sign/{token}` route with the same workspace but locked to their assigned fields only.
- Recipient view: read-only for everything except their assigned fields; submit → server validates all required fields → status advances → notifies next participant or completes.
- Audit trail rows in `signing_events` for every action (view/fill/sign/complete) with IP + UA.

## Phase 4 — Final PDF generation + delivery

- On completion, worker flattens all overlays + filled values into a signed PDF, uploads to `document-versions`, updates `documents.document_status = 'completed'`.
- Emails both parties a copy + link.
- Adds "Certificate of completion" page (audit trail) — foundation for future notarization/witness.

## Phase 5 — Voice notes hardening + polish

- Pause/resume in MediaRecorder, waveform visualiser, rename inline, delete with confirm, transcript inline edit, export as `.txt`/`.docx`.
- Mobile mic permission prompts, background upload progress.

---

## Technical notes

- **Rendering**: keep `react-pdf` (pdfjs), switch to virtualized multi-page scroll. Worker stays on CDN.
- **Overlay canvas**: HTML overlay positioned over each rendered page using normalized (0..1) coords → survives zoom/rotate. Interactions via `react-rnd`. No Konva/Fabric — kept lean.
- **State**: Zustand store per document for elements + history (undo/redo).
- **Flatten**: `pdf-lib` inside the Cloudflare Worker job handler (Workers-compatible, no native deps). Signature images fetched via signed URL, drawn at the same normalized coords.
- **Templates**: new `document_templates(workspace_id, name, source_document_id, fields jsonb, thumbnail_path)` table + RLS in Phase 2.
- **Guest signing**: new `signing_tokens(token_hash, request_id, participant_id, expires_at)` + public route `/sign/$token` in Phase 3.
- **No schema changes in Phase 1** — everything uses existing `documents`, `document_versions`, `signing_fields`, `user_signatures`.

---

## What ships when you approve

Just Phase 1. It's the unblocker: preview works, signing works end-to-end, voice playback+transcription works. After you've tested Phase 1 in the preview, say "go Phase 2" and I'll build the editor.

## What's actually broken

1. **Storage uploads (documents, signatures) → "row violates RLS"**
   Storage policies require the **first folder segment to be the `workspace_id`** (verified via `is_workspace_member`/`has_workspace_role`). Frontend uploads to `${user.id}/filename`, which the policy rejects. Fix the path: `${workspaceId}/${userId}/${filename}`.

2. **Signature "Save" crashes with `(0 , Z.default) is not a function`**
   `react-signature-canvas` v2 changed the API — `getTrimmedCanvas()` is gone / now `getCanvas().toDataURL()`. The runtime error proves it. Switch to `sigCanvas.current.getCanvas().toDataURL("image/png")` and remove the broken trim call. Also fix the same workspace-prefixed storage path.

3. **Voice notes are mocked** — no `MediaRecorder`, no upload to `voice-notes` bucket, no transcription enqueue. The toast "recorded! saving..." just inserts a row with `audio_url: "mock-url"`. Replace with real `MediaRecorder` → upload to `voice-notes/${workspaceId}/${userId}/${id}.webm` → insert `voice_notes` row with real `storage_path` → enqueue `audio_transcribe` job (worker already exists). Add an audio `<audio>` player wired to a signed URL, and show `transcript` once the worker writes it back.

4. **Contacts Import / Export buttons do nothing** — no `onClick`. Wire them:
   - Import: file picker → parse CSV client-side (papaparse) → bulk `insert` into `contacts` with `workspace_id` + `created_by`.
   - Export: query contacts → generate CSV → trigger download.
   - Also wire the "Add Contact" dialog (currently the trigger has no dialog body).

5. **App feels like a demo** — because the four flows above never reach the backend. Once 1–4 are fixed, the existing backend (jobs, worker, RLS, Brevo, Whisper) takes over.

## Changes

**Frontend only — no schema changes; backend is already correct.**

- `src/routes/dashboard/documents/index.tsx`
  - Change `filePath` to `${workspaceId}/${user.id}/${rand}.${ext}` (fetch workspace first, then upload).
  - Keep the rest of the insert.

- `src/components/signature-manager.tsx`
  - Replace `sigCanvas.current.getTrimmedCanvas().toDataURL(...)` with `sigCanvas.current.getCanvas().toDataURL("image/png")`.
  - Change upload path to `${workspaceId}/${user.id}/sig-${ts}.png`.
  - Implement the Upload tab (file → same workspace-prefixed path).

- `src/routes/dashboard/voice/index.tsx`
  - Add real `MediaRecorder` capture (mic permission, chunks → Blob).
  - On stop: upload Blob to `voice-notes/${workspaceId}/${user.id}/${id}.webm`, insert row with real `storage_path` + `audio_url` (signed URL), then enqueue `audio_transcribe` job via `enqueueTranscription` server fn.
  - Render each note with an `<audio controls>` using a signed download URL and show `transcript` when present; poll/refetch every few seconds while transcript is null.

- `src/routes/dashboard/contacts/index.tsx`
  - Add hidden `<input type="file" accept=".csv">` + `onClick` on Import. Parse with `papaparse` (already-light; install). Insert in batches with `workspace_id` + `created_by`.
  - Wire Export: fetch all contacts, build CSV string, trigger download via Blob URL.
  - Wire Add Contact dialog with a small form (first/last/email/phone/company) calling `createContact` server fn.

**Dependency:** `bun add papaparse @types/papaparse` for CSV parsing.

## Out of scope

- No DB migrations. Storage policies are correct as designed (workspace-scoped); we're aligning the client paths to them.
- Letterheads / Mail / Templates flows are not touched in this pass.

After this, uploads succeed, signatures save, recordings persist + transcribe, and contacts import/export round-trip with real data.
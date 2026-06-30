## Stabilization Sprint — Plan

Focused on the actual blockers you reported. I will not redesign anything or add new features.

---

### P1 — Signature save fails with `uq_sig_default`

**Root cause:** `user_signatures` has a partial unique index `uq_sig_default (created_by) WHERE is_default`. `SignatureManager` writes directly via the browser Supabase client and always hard-codes `is_default: true`, so the second save violates the constraint. The proper `saveSignature` server function (which unsets the previous default first) is never called.

**Fix**
- Route `SignatureManager` save through `saveSignature` (server fn) so the unset-previous-default logic runs in one place.
- Add an `is_default` toggle in the form. New signatures default to false unless explicitly chosen, or unless the user has zero signatures yet (auto-default the first).
- DB safety net: keep the partial unique index, and add a `BEFORE INSERT/UPDATE` trigger that unsets any other `is_default = true` row for the same `created_by`. This makes "set as default" idempotent even if a client forgets.
- Surface real error messages from the mutation (`error.message`) in the toast.

### P2 — Signature placement workflow

Current `documents/$documentId.tsx` opens a `<Dialog>` with the signature manager when you click "Sign Document". Replace that with an inline flow:

1. Click **Sign Document** → opens a right-side **Signature Toolbox** panel (not a modal) listing saved signatures + a "+ New" button.
2. Selecting a signature attaches it to the cursor; clicking on the document drops it.
3. Placed signature is draggable / resizable on the page (rotate optional, deferred).
4. **Confirm placement** button calls `applySignatureToDocument` server fn (already exists) with page + x/y/width/height, which enqueues `signature_apply`.
5. Creating a new signature inline uses `SignatureManager` rendered inside the same panel — no nested modal.

No Adobe-grade field editor — just place / move / resize / confirm, matching what the backend job already accepts.

### P3 — PDF preview

Today the viewer just renders a `<FileText>` icon. Implement real preview:
- Install `react-pdf` (uses pdf.js).
- Resolve a signed URL via `getSignedDownloadUrl` (bucket `documents`, `document.storage_path`).
- Render with page navigation, zoom (wire to existing zoom state), and a basic in-page text search using pdf.js's text layer.
- For non-PDF file types, render the file inside an `<iframe>` via signed URL (images/Office files just download).
- Error boundary: show file name + error + Retry + Download fallback instead of a blank panel.

### P4 — Download / Export

- "Download" button on the document detail page is currently a no-op. Wire it to `getSignedDownloadUrl` and trigger a browser download using the original `storage_path`.
- Add a "Download signed version" entry that pulls the most recent `document_versions` row (signed output of `signature_apply`) when present; falls back to original.
- Update `enqueueDocumentExport` callers to poll the `jobs` row and, on `succeeded`, fetch the output path's signed URL.

### P5 — Voice notes playback + transcription

- Playback: the dashboard list has no audio element. Add an inline `<audio controls>` per row using a freshly-minted signed URL (the stored 7‑day URL can expire; mint on demand).
- MIME: the worker uploads to Whisper as `audio.webm`. Confirmed compatible. Add fallback `audio/mp4` for Safari recordings.
- Transcription failures: today they silently retry. Surface `jobs.error` in the row, plus a **Retry transcription** button that re-enqueues the job.
- Add a "Download transcript" action (txt blob from `voice_notes.transcript`).

### P6 — Settings module

Build out the tabs that are currently placeholders, all wired to existing tables:
- **Profile** — actually persist the form (today the Save button is inert). Avatar upload to `avatars` bucket.
- **Company** — new columns on `workspaces` if missing (`company_name`, `logo_url`, `address`). Logo upload to `avatars`.
- **Security** — `supabase.auth.updateUser({ password })`; list/revoke sessions via `supabase.auth.signOut({ scope: 'others' })` (full session list isn't exposed via anon API — show current session + sign-out-everywhere).
- **Signatures** — already uses `SignatureManager`; add a list with **Set default** and **Delete** actions.
- **Appearance** — theme toggle persisted on `profiles.preferences` JSON. Language is architecture-only (locale field, no translations yet).
- **Notifications** — boolean prefs on `profiles.preferences`.
- **Integrations** — placeholder cards reading from `user_integrations` (Connect/Disconnect for Brevo, OpenAI — already backed by table).
- **Account** — Export personal data (server fn returning a JSON of the user's rows). Delete account calls a new server fn that uses `supabaseAdmin.auth.admin.deleteUser` after role check / confirmation typed.

### P7 — Error handling

Centralize through a small helper:
- `toastError(err, fallback)` → shows real message, logs to console, captures via existing `error-capture`.
- Replace every `toast.error("Failed to …")` swallow with this.
- Add Retry buttons on the queries that matter (documents list, voice list, document detail).

### P8 — Backend verification

Run a sweep and fix:
- Storage policies on `documents`, `signatures`, `voice-notes`, `exports`, `document-versions`, `avatars`, `letterheads` — confirm they all use `(storage.foldername(name))[1] = workspace_id::text` and that workspace membership is checked.
- `claim_jobs` reachable only by `service_role` (already done in last security pass — re-verify).
- Add missing indexes spotted while reading: `voice_notes(workspace_id, created_at desc)`, `jobs(status, scheduled_for)` partial.
- Run `supabase--linter`; fix anything blocking.

### P9 — End-to-end verification

Drive Playwright against `http://localhost:8080` with the injected Supabase session to walk: upload → preview → sign → download → record → playback → transcribe poll → settings save. Capture screenshots and console for the final report.

---

### Technical notes

- DB migration adds: `enforce_single_default_signature` trigger; optional `workspaces.company_name/logo_url/address` columns; `profiles.preferences jsonb default '{}'` if missing.
- New deps: `react-pdf`.
- New/changed files (approx): `src/components/signature-manager.tsx`, new `src/components/document/pdf-viewer.tsx`, new `src/components/document/signature-toolbox.tsx`, `src/routes/dashboard/documents/$documentId.tsx`, `src/routes/dashboard/voice/index.tsx`, `src/routes/dashboard/settings/index.tsx` + per-tab components, `src/lib/signatures.functions.ts` (delete + set-default fns), `src/lib/profile.functions.ts` (new), `src/lib/account.functions.ts` (new export/delete), `src/lib/errors.ts` (new helper).
- No edge functions involved — all server work stays in TanStack server functions per the stack rules.

### Final deliverable

After implementation I'll post: bugs fixed + root cause, files changed, migrations applied, remaining known gaps (likely: rotate on placed signature, full session listing, real translations), and Playwright verification results.

Reply **go** to start, or tell me which priorities to drop/reorder.
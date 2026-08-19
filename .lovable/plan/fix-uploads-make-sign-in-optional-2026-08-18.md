# Fix uploads + make sign-in optional

## What's confirmed so far

- The HTML you pasted is this app's own generic 500 page (`src/lib/error-page.ts`). The server-side error middleware in `src/start.ts` converts _any_ thrown error from a server function into that HTML page. The upload UI then shows the raw HTML as its error text. So the real cause of the upload failure is currently hidden — no code path reports what actually broke.
- Uploads go: browser → `createSignedUploadUrl` server function → resolves your workspace → asks Supabase Storage for a signed upload URL → browser uploads → record insert. Any failure anywhere in that chain produces the same opaque HTML.
- Storage rules and workspace data check out structurally: all 3 accounts have a workspace and a default workspace, buckets exist, and the storage policies (workspace-folder for documents/signatures, `{user_id}/` folder for avatars) reference helper functions that the signed-in role is still allowed to run. So the failure is not one of the obvious candidates — it needs the real error message before it can be named.
- Profile photo path is `{user_id}/avatar-*.ext`, which matches the avatars policy, so the "violates row-level security" report also needs the real error surfaced (it may be coming from the profile row update rather than the file upload).

Because of that, step 1 is making errors legible, not guessing a fix.

## Plan

### 1. Stop swallowing server errors

- Keep the friendly HTML page for full page loads only. For server-function (RPC) calls, return a JSON error with the real message and status instead of the HTML page.
- Log the underlying Supabase/Storage error (code + message + path + bucket) server-side so failures are traceable.
- Make the upload/avatar/signature UI show that message in a toast instead of dumping a page body.

### 2. Reproduce and fix the actual upload failures

With real messages available, drive the three flows (document upload, sheet upload, signature save, profile photo) against the running app and fix what the errors name. Expected fix areas, in order of likelihood:

- Signed-upload-URL creation vs. the workspace-prefixed object path used by the storage policies.
- The follow-up `documents` row insert (`workspace_id` / `created_by` must match the signed-in user).
- Avatar: whether the failure is the storage write or the `profiles` update that follows it, and whether `user_id` is populated at the time the path is built.
  Each fix is verified by actually performing the upload, not by inspection.

### 3. Optional sign-in (guest mode)

Goal: anyone can land on the app and start working with no signup, while people who want their data to follow them can still sign in.

- Enable Supabase anonymous sign-ins for the project, then have the app create a guest session automatically on first visit when no session exists. The existing new-user trigger provisions a profile, workspace and free subscription for the guest exactly like a normal user.
- The `/dashboard` area stops redirecting to `/auth`; it waits for the guest session instead. `/auth` stays reachable as an opt-in "save my work / sign in" route.
- Header shows "Guest — Sign in to keep your work" for anonymous sessions, and the account menu for real ones.
- Guests can later sign up and keep their data (Supabase links the anonymous user to the new email identity), so nothing is lost on conversion.
- No RLS, policy or table changes: guests are real authenticated users, so every existing workspace/document/signature rule keeps working unchanged.

## Technical notes

- `src/start.ts` error middleware: branch on request path (`/_serverFn/*`) → JSON error; otherwise → HTML page.
- Guest bootstrap lives in one place (root route), calling `supabase.auth.signInAnonymously()` only when `getSession()` is empty, guarded against double-invocation during hydration.
- Anonymous sign-ins must be switched on in the Supabase dashboard (Authentication → Sign In / Providers → Anonymous). This is a manual dashboard toggle I can't flip from code; without it the guest bootstrap fails and the app falls back to the sign-in page.
- Bot/abuse note: anonymous sign-ins create a real auth user per visitor. Acceptable for this stage; can be paired with Turnstile later if signup spam becomes a problem.

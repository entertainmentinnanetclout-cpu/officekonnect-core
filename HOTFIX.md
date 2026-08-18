# Runtime hotfix — 2026-08-18

- Keep TanStack server-function failures on the JSON RPC boundary instead of returning Lovable's HTML SSR failure page.
- Create native documents directly through the authenticated Supabase client and existing RLS.
- Upload document binaries directly to the workspace/user storage path and create the corresponding document row through RLS.
- Preserve existing server-function flows for rename, duplicate, status changes, PDF export and signing while the transport boundary is hardened.

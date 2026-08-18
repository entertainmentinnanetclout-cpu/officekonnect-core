import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("browser Supabase bootstrap works without process.env or copied Vercel variables", () => {
  const client = source("src/integrations/supabase/client.ts");
  const defaults = source("src/integrations/supabase/defaults.ts");

  expect(client).not.toContain("process.env");
  expect(client).toContain("DEFAULT_SUPABASE_URL");
  expect(client).toContain("DEFAULT_SUPABASE_PUBLISHABLE_KEY");
  expect(defaults).toContain("https://ydgsmnzcwkrlghlhtpgq.supabase.co");
  expect(defaults).toContain("sb_publishable_");
  expect(defaults).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});

test("authenticated server functions fall back to the canonical public Supabase config", () => {
  const middleware = source("src/integrations/supabase/auth-middleware.ts");

  expect(middleware).toContain("process.env.SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL");
  expect(middleware).toContain(
    "process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY",
  );
});

test("privileged server operations still require a server-only service-role secret", () => {
  const serverClient = source("src/integrations/supabase/client.server.ts");

  expect(serverClient).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()");
  expect(serverClient).toContain("Missing SUPABASE_SERVICE_ROLE_KEY");
  expect(serverClient).not.toContain("sb_publishable_");
});

test("auth initialization converts startup failures into state instead of throwing the root tree", () => {
  const authHook = source("src/hooks/use-auth.tsx");

  expect(authHook).toContain("catch (cause)");
  expect(authHook).toContain("setError(");
  expect(authHook).toContain("setIsLoading(false)");
});

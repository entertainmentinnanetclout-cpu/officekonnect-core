import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcRoot = join(root, "src");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const findings = [];
for (const absolute of walk(srcRoot)) {
  if (!/\.(?:ts|tsx|js|jsx)$/.test(absolute)) continue;
  const file = relative(root, absolute).replaceAll("\\", "/");
  const text = readFileSync(absolute, "utf8");
  const isServerOnly = /\.server\.(?:ts|tsx|js|jsx)$/.test(file);
  const checks = [
    ...(!isServerOnly
      ? [
          [
            /(?:SUPABASE_SERVICE_ROLE_KEY|service_role\s*:|serviceRoleKey)/i,
            "service-role credential reference in browser-capable application source",
          ],
        ]
      : []),
    [
      /(?:VITE_|PUBLIC_)[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD)/,
      "secret-shaped public/browser environment variable",
    ],
    [
      /localStorage[^\n]*(?:token|secret|password)|(?:token|secret|password)[^\n]*localStorage/i,
      "credential-like value persisted in localStorage",
    ],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) findings.push(`${file}: ${label}`);
  }
}

const browserSupabaseClient = readFileSync(
  join(root, "src/integrations/supabase/client.ts"),
  "utf8",
);
if (browserSupabaseClient.includes("process.env")) {
  findings.push(
    "client.ts: browser Supabase bootstrap must not depend on process.env because cloned Vite deployments do not provide it",
  );
}

const publicSupabaseDefaults = readFileSync(
  join(root, "src/integrations/supabase/defaults.ts"),
  "utf8",
);
if (!publicSupabaseDefaults.includes("DEFAULT_SUPABASE_URL")) {
  findings.push("defaults.ts: canonical public Supabase URL fallback is missing");
}
if (!publicSupabaseDefaults.includes("DEFAULT_SUPABASE_PUBLISHABLE_KEY")) {
  findings.push("defaults.ts: canonical public Supabase publishable-key fallback is missing");
}
if (/SERVICE_ROLE|service_role/i.test(publicSupabaseDefaults)) {
  findings.push("defaults.ts: service-role material must never appear in browser-safe defaults");
}

const serverAdminClient = readFileSync(
  join(root, "src/integrations/supabase/client.server.ts"),
  "utf8",
);
if (!serverAdminClient.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  findings.push(
    "client.server.ts: server-only admin client no longer resolves the service-role key",
  );
}
if (!serverAdminClient.includes("persistSession: false")) {
  findings.push("client.server.ts: server-only admin client must not persist an auth session");
}

const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
if (!/^\.env$/m.test(gitignore) || !/^\.env\.\*$/m.test(gitignore)) {
  findings.push(".gitignore: local .env patterns must remain ignored");
}
for (const name of readdirSync(root)) {
  if (name === ".env.example") continue;
  if (name === ".env" || name.startsWith(".env."))
    findings.push(`${name}: environment file must not be tracked`);
}

const devSessionPath = join(root, "src/lib/development-session.functions.ts");
const devSession = readFileSync(devSessionPath, "utf8");
if (!devSession.includes('vercelEnvironment === "production"')) {
  findings.push("development-session.functions.ts: missing explicit Vercel production guard");
}
if (!devSession.includes('process.env.NODE_ENV === "production"')) {
  findings.push("development-session.functions.ts: missing non-Vercel production guard");
}

const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
const inviteRoute = readFileSync(join(root, "src/routes/invite/$token.tsx"), "utf8");
if (!rootRoute.includes("sessionStorage.getItem(PENDING_WORKSPACE_INVITE_KEY)")) {
  findings.push("workspace invite redirect must recover the bearer token only from sessionStorage");
}
if (!inviteRoute.includes("sessionStorage.setItem(PENDING_INVITE_KEY, token)")) {
  findings.push("workspace invite route must keep pending bearer tokens session-scoped");
}

const externalSigning = readFileSync(
  join(root, "supabase/functions/signing-external/index.ts"),
  "utf8",
);
for (const required of [
  'action === "exchange"',
  "exchange_signing_token",
  "get_signing_session_payload",
  "complete_external_signing_session",
  "p_session_hash",
  "HMAC",
]) {
  if (!externalSigning.includes(required)) {
    findings.push(`signing-external: expected custom authentication contract marker '${required}'`);
  }
}

const obsoleteBypass = join(root, "src/lib/signing-public.functions.ts");
if (existsSync(obsoleteBypass))
  findings.push("obsolete privileged signing-public.functions.ts must not exist");

if (findings.length) {
  console.error(
    "Phase 10 security boundary audit failed:\n" + findings.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("Phase 10 security boundary audit passed.");

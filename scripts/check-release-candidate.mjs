import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function requirePath(relativePath) {
  if (!fs.existsSync(absolute(relativePath))) {
    failures.push(`Missing release artifact: ${relativePath}`);
  }
}

function read(relativePath) {
  requirePath(relativePath);
  return fs.existsSync(absolute(relativePath))
    ? fs.readFileSync(absolute(relativePath), "utf8")
    : "";
}

function requireText(relativePath, markers) {
  const content = read(relativePath);
  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`${relativePath} is missing release marker: ${marker}`);
    }
  }
}

const requiredDocs = [
  "docs/PROJECT_STATUS.md",
  "docs/ARCHITECTURE.md",
  "docs/PHASE_ROADMAP.md",
  "docs/CHANGELOG.md",
  "docs/AGENT_HANDOFF.md",
  "docs/PHASE11.md",
];
requiredDocs.forEach(requirePath);

const requiredDashboardModules = [
  "documents",
  "sheets",
  "files",
  "templates",
  "workflows",
  "approvals",
  "signing",
  "tasks",
  "calendar",
  "search",
  "notifications",
  "activity",
  "team",
  "workspace",
  "settings",
];
for (const moduleName of requiredDashboardModules) {
  requirePath(`src/routes/dashboard/${moduleName}`);
}
requirePath("src/routes/privacy.tsx");
requirePath("src/routes/terms.tsx");

requireText("src/routeTree.gen.ts", [
  "'/privacy'",
  "'/terms'",
  "'/dashboard/documents'",
  "'/dashboard/workflows'",
  "'/dashboard/signing'",
  "'/dashboard/settings'",
]);

requireText("src/lib/workflows.functions.ts", [
  'rpc("start_document_workflow"',
  'rpc("submit_workflow_decision"',
  'rpc("resubmit_document_workflow"',
]);
requireText("src/lib/workflows.ts", ['"changes_requested"', '"approved"', '"rejected"']);
requireText("src/lib/document-signing-copy.functions.ts", [
  "createNativeDocumentSigningCopy",
  "— Signing Copy",
  'document_kind: "file"',
  'file_type: "application/pdf"',
]);
requireText("src/lib/signing.functions.ts", [
  "createSigningDraft",
  "sendSigningRequest",
  "completeSigningParticipant",
  'functions.invoke("signing-actions"',
]);
requireText("supabase/functions/signing-external/index.ts", [
  'action === "exchange"',
  'rpc("exchange_signing_token"',
  'rpc("get_signing_session_payload"',
  'rpc("complete_external_signing_session"',
  'functions.invoke("signing-finalize"',
]);
requireText("supabase/functions/signing-finalize/index.ts", [
  'from "../_shared/signing-pdf.ts"',
  "applySigningFieldsToPdf",
  "OfficeKonnect Signing Certificate",
]);
requirePath("supabase/functions/_shared/signing-pdf.ts");
requirePath("supabase/migrations/20260818101750_phase_10_files_fk_covering_indexes.sql");
requirePath("tests/signing-finalization-pdf.integration.test.ts");
requirePath("e2e/public-routes.spec.ts");
requirePath(".env.example");
if (fs.existsSync(absolute(".env"))) {
  failures.push("Tracked .env must not exist in the release candidate");
}

const workflowsDir = absolute(".github/workflows");
if (!fs.existsSync(workflowsDir)) {
  failures.push(".github/workflows is missing");
} else {
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  if (workflowFiles.length !== 1 || workflowFiles[0] !== "phase0-deterministic-validation.yml") {
    failures.push(
      `Release candidate must retain only the canonical read-only validation workflow; found: ${workflowFiles.join(", ")}`,
    );
  }
  for (const fileName of workflowFiles) {
    const content = read(`.github/workflows/${fileName}`);
    if (/contents\s*:\s*write/i.test(content)) {
      failures.push(`Write-capable CI is forbidden in release candidate: ${fileName}`);
    }
  }
}

requireText(".github/workflows/phase0-deterministic-validation.yml", [
  "contents: read",
  "bun run phase0:parity",
  "bun run audit:product",
  "bun run audit:security",
  "bun run audit:release",
  "bun run test",
  "bun run build",
  "bun run audit:performance",
  "bun run test:e2e",
]);

if (failures.length) {
  console.error("Phase 11 release-candidate audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Phase 11 release-candidate audit passed: routes, canonical workflow/signing chain, release docs and read-only CI are present.",
);

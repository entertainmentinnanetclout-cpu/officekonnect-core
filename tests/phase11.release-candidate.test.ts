import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { allowedWorkflowDecisions, isTerminalWorkflowStatus } from "../src/lib/workflows";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Phase 11 canonical review/change/resubmit/approve state contract remains valid", () => {
  expect(
    allowedWorkflowDecisions({ stepType: "review", allowChanges: true, allowReject: true }),
  ).toEqual(["approve", "changes_requested", "reject"]);
  expect(isTerminalWorkflowStatus("changes_requested")).toBe(false);
  expect(isTerminalWorkflowStatus("in_progress")).toBe(false);
  expect(isTerminalWorkflowStatus("approved")).toBe(true);
  expect(isTerminalWorkflowStatus("rejected")).toBe(true);
});

test("Phase 11 release journey is wired through the canonical workflow and signing engines", () => {
  const workflowFunctions = source("src/lib/workflows.functions.ts");
  expect(workflowFunctions).toContain('rpc("start_document_workflow"');
  expect(workflowFunctions).toContain('rpc("submit_workflow_decision"');
  expect(workflowFunctions).toContain('rpc("resubmit_document_workflow"');

  const signingCopy = source("src/lib/document-signing-copy.functions.ts");
  expect(signingCopy).toContain("createNativeDocumentSigningCopy");
  expect(signingCopy).toContain("— Signing Copy");
  expect(signingCopy).toContain('file_type: "application/pdf"');

  const signingFunctions = source("src/lib/signing.functions.ts");
  expect(signingFunctions).toContain("createSigningDraft");
  expect(signingFunctions).toContain("sendSigningRequest");
  expect(signingFunctions).toContain("completeSigningParticipant");
  expect(signingFunctions).toContain('functions.invoke("signing-actions"');

  const externalSigning = source("supabase/functions/signing-external/index.ts");
  expect(externalSigning).toContain('action === "exchange"');
  expect(externalSigning).toContain('rpc("exchange_signing_token"');
  expect(externalSigning).toContain('rpc("complete_external_signing_session"');
  expect(externalSigning).toContain('functions.invoke("signing-finalize"');

  const finalizer = source("supabase/functions/signing-finalize/index.ts");
  expect(finalizer).toContain('from "../_shared/signing-pdf.ts"');
  expect(finalizer).toContain("applySigningFieldsToPdf");
  expect(finalizer).toContain("OfficeKonnect Signing Certificate");
});

test("Phase 11 route registry exposes every canonical release surface", () => {
  const routeTree = source("src/routeTree.gen.ts");
  for (const route of [
    "/privacy",
    "/terms",
    "/dashboard/documents",
    "/dashboard/sheets",
    "/dashboard/files",
    "/dashboard/templates",
    "/dashboard/workflows",
    "/dashboard/approvals",
    "/dashboard/signing",
    "/dashboard/tasks",
    "/dashboard/calendar",
    "/dashboard/search",
    "/dashboard/notifications",
    "/dashboard/activity",
    "/dashboard/team",
    "/dashboard/workspace",
    "/dashboard/settings",
  ]) {
    expect(routeTree).toContain(`'${route}'`);
  }
});

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const requiredMigrations = [
  "20260725181049_phase_0_free_tier_hardening.sql",
  "20260726161635_phase_2_native_documents.sql",
  "20260726221019_phase_3_spreadsheet_foundation.sql",
  "20260726221131_phase_3_spreadsheet_foundation.sql",
  "20260726221243_phase_3_document_delete_membership_fix.sql",
  "20260726221250_phase_3_spreadsheet_backend_reconciliation.sql",
  "20260726221349_phase_3_rpc_acl_hardening.sql",
  "20260726221418_phase_3_index_deduplication.sql",
  "20260726221529_phase_3_workbook_contract_hardening.sql",
  "20260726221717_phase_3_rpc_schema_isolation.sql",
  "20260727073944_phase_4_workflow_review_approval_foundation.sql",
  "20260727074025_phase_4_workflow_foreign_key_indexes.sql",
  "20260727074211_phase_4_workflow_snapshot_hardening.sql",
  "20260727074343_phase_4_workflow_comment_integrity.sql",
  "20260727074545_phase_4_workflow_composite_indexes.sql",
  "20260728093525_phase_5_esignature_integrity_foundation.sql",
  "20260728095257_phase_5_signing_relational_integrity.sql",
  "20260728095333_phase_5_signing_request_policy_lock.sql",
  "20260728095344_phase_5_signing_participant_policy_lock.sql",
  "20260728095357_phase_5_signing_field_policy_lock.sql",
  "20260728095407_phase_5_signing_event_append_only.sql",
  "20260728095520_phase_5_send_signing_request_rpc.sql",
  "20260728095553_phase_5_signing_participant_consent_metadata.sql",
  "20260728095733_phase_5_signing_completion_state_machine.sql",
  "20260728095843_phase_5_signing_participant_and_request_actions.sql",
  "20260728095959_phase_5_external_signing_sessions.sql",
  "20260728100158_phase_5_signing_finalization_contract.sql",
  "20260728100249_phase_5_signing_cc_notification_bridge.sql",
  "20260728101151_phase_5_signing_field_key_default.sql",
  "20260728101415_phase_5_signing_rls_structural_lock_correction.sql",
  "20260728101556_phase_5_signing_rls_initplan_optimization.sql",
];

const requiredPaths = [
  ...requiredMigrations.map((name) => `supabase/migrations/${name}`),
  "supabase/functions/signing-actions/index.ts",
  "supabase/functions/signing-actions/deno.json",
  "supabase/functions/signing-external/index.ts",
  "supabase/functions/signing-external/deno.json",
  "supabase/functions/signing-finalize/index.ts",
  "supabase/functions/signing-finalize/deno.json",
  "src/integrations/supabase/types.ts",
  "docs/PROJECT_STATUS.md",
  "docs/ARCHITECTURE.md",
  "docs/PHASE_ROADMAP.md",
  "docs/CHANGELOG.md",
  "docs/AGENT_HANDOFF.md",
  ".env.example",
];

const missing = requiredPaths.filter((path) => !existsSync(resolve(process.cwd(), path)));

if (existsSync(resolve(process.cwd(), ".env"))) {
  console.error(
    "Phase 0 parity check failed: .env must not be committed/tracked in the repository checkout.",
  );
  process.exit(1);
}

if (missing.length > 0) {
  console.error("Phase 0 parity check failed. Missing canonical source files:");
  for (const path of missing) console.error(` - ${path}`);
  process.exit(1);
}

console.log(
  `Phase 0 parity check passed: ${requiredMigrations.length}/${requiredMigrations.length} recovered migrations and canonical signing source are present.`,
);

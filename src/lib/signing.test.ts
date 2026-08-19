import { describe, expect, test } from "bun:test";
import type { Tables } from "@/integrations/supabase/types";
import {
  isSigningParticipantEligible,
  normalizeSigningField,
  validateSigningDraftConfiguration,
} from "@/lib/signing";

type Request = Tables<"signing_requests">;
type Participant = Tables<"signing_participants">;
type Field = Tables<"signing_fields">;

const request = (patch: Partial<Request> = {}): Request => ({
  id: "00000000-0000-0000-0000-000000000001",
  document_id: "00000000-0000-0000-0000-000000000002",
  workspace_id: "00000000-0000-0000-0000-000000000003",
  sender_id: "00000000-0000-0000-0000-000000000004",
  title: "Request",
  message: null,
  status: "sent",
  app_source: "officekonnect",
  final_export_path: null,
  sent_at: new Date().toISOString(),
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  source_document_version_id: "00000000-0000-0000-0000-000000000005",
  signing_order: "parallel",
  current_order_index: 0,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  locked_at: new Date().toISOString(),
  revision: 1,
  participants_hash: "participants",
  fields_hash: "fields",
  source_sha256: null,
  final_export_sha256: null,
  final_document_version_id: null,
  audit_certificate_path: null,
  audit_certificate_sha256: null,
  finalization_status: "not_started",
  finalization_error: null,
  finalized_at: null,
  voided_at: null,
  voided_by: null,
  void_reason: null,
  ...patch,
});

const participant = (patch: Partial<Participant> = {}): Participant => ({
  id: "00000000-0000-0000-0000-000000000010",
  request_id: request().id,
  user_id: "00000000-0000-0000-0000-000000000011",
  order_index: 0,
  role: "signer",
  status: "pending",
  signed_at: null,
  decline_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  email: "signer@example.com",
  full_name: "Signer",
  invited_at: null,
  viewed_at: null,
  completed_at: null,
  declined_at: null,
  last_reminded_at: null,
  access_revoked_at: null,
  token_version: 1,
  completion_hash: null,
  identity_metadata: {},
  consent_at: null,
  consent_text_version: null,
  last_access_at: null,
  last_notified_at: null,
  ...patch,
});

const field = (patch: Partial<Field> = {}): Field => ({
  id: "00000000-0000-0000-0000-000000000020",
  request_id: request().id,
  participant_id: participant().id,
  page: 1,
  x: 0.1,
  y: 0.2,
  w: 0.25,
  h: 0.08,
  rotation: 0,
  type: "signature",
  value: null,
  required: true,
  signed_signature_id: null,
  signed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  field_key: "signature-1",
  label: "Signature",
  validation: {},
  signature_storage_path: null,
  value_hash: null,
  completion_metadata: {},
  ...patch,
});

describe("OfficeKonnect Phase 6 signing contract", () => {
  test("clamps PDF field geometry to normalized coordinates", () => {
    const result = normalizeSigningField({
      participantId: participant().id,
      type: "signature",
      page: 0,
      x: -4,
      y: 4,
      w: 2,
      h: 0,
      rotation: 900,
    });
    expect(result.page).toBe(1);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0.98);
    expect(result.w).toBe(1);
    expect(result.h).toBe(0.02);
    expect(result.rotation).toBe(360);
  });

  test("requires every signer to own a required signature or initial field", () => {
    const signer = participant();
    expect(validateSigningDraftConfiguration([signer], [])).toContain(
      "needs at least one required",
    );
    expect(validateSigningDraftConfiguration([signer], [field()])).toBeNull();
  });

  test("prevents CC recipients from owning fields", () => {
    const signer = participant();
    const cc = participant({
      id: "00000000-0000-0000-0000-000000000012",
      // Every participant must be a registered OfficeKonnect account; this case
      // isolates the CC-cannot-own-fields rule, not the account requirement.
      user_id: "00000000-0000-0000-0000-000000000112",
      email: "copy@example.com",
      full_name: "Copy Recipient",
      role: "cc",
      order_index: 1,
    });
    const signerField = field();
    const ccField = field({
      id: "00000000-0000-0000-0000-000000000021",
      participant_id: cc.id,
    });
    expect(validateSigningDraftConfiguration([cc, signer], [ccField, signerField])).toContain(
      "CC recipients cannot own",
    );
  });

  test("enforces sequential signing order", () => {
    expect(
      isSigningParticipantEligible(
        request({ signing_order: "sequential", current_order_index: 0 }),
        participant({ order_index: 1 }),
      ),
    ).toBeFalse();
    expect(
      isSigningParticipantEligible(
        request({ signing_order: "sequential", current_order_index: 1 }),
        participant({ order_index: 1 }),
      ),
    ).toBeTrue();
  });

  test("rejects expired, revoked and terminal signing assignments", () => {
    expect(
      isSigningParticipantEligible(
        request({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
        participant(),
      ),
    ).toBeFalse();
    expect(
      isSigningParticipantEligible(
        request(),
        participant({ access_revoked_at: new Date().toISOString() }),
      ),
    ).toBeFalse();
    expect(isSigningParticipantEligible(request(), participant({ status: "signed" }))).toBeFalse();
  });
});

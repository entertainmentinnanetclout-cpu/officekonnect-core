import type { Tables } from "@/integrations/supabase/types";

export type SigningRequest = Tables<"signing_requests">;
export type SigningParticipant = Tables<"signing_participants">;
export type SigningField = Tables<"signing_fields">;
export type SigningEvent = Tables<"signing_events">;
export type SigningCertificate = Tables<"signing_certificates">;

export type SigningOrder = "parallel" | "sequential";
export type ParticipantRole = "signer" | "approver" | "cc";
export type SigningFieldType = "signature" | "initial" | "text" | "date";

export interface SigningParticipantInput {
  email?: string | null;
  fullName?: string | null;
  userId?: string | null;
  role: ParticipantRole;
  orderIndex: number;
}

export interface SigningFieldInput {
  participantId: string;
  type: SigningFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  required?: boolean;
  label?: string | null;
  validation?: Record<string, unknown>;
}

export interface SigningFieldValue {
  fieldId: string;
  value?: string | null;
  signatureId?: string | null;
  signatureStoragePath?: string | null;
}

export interface ExternalSigningField {
  id: string;
  fieldKey: string;
  label: string | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  type: SigningFieldType;
  required: boolean;
  value: string | null;
  completed: boolean;
}

export interface ExternalSigningPayload {
  request: {
    id: string;
    title: string;
    message: string | null;
    status: string;
    expiresAt: string | null;
    signingOrder: SigningOrder;
    currentOrderIndex: number;
    sourceDocumentVersionId: string;
  };
  participant: {
    id: string;
    email: string | null;
    fullName: string | null;
    role: ParticipantRole;
    status: string;
    orderIndex: number;
  };
  source: { fileUrl: string | null; storagePath: string | null };
  sourceUrl: string | null;
  fields: ExternalSigningField[];
  sessionExpiresAt: string;
}

export const SIGNING_CONSENT_VERSION = "officekonnect-esign-consent-v1";

export function signingStatusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function signingStatusTone(status: string) {
  if (status === "completed") return "emerald" as const;
  if (status === "declined" || status === "cancelled") return "red" as const;
  if (status === "sent" || status === "in_progress") return "blue" as const;
  return "slate" as const;
}

export function fieldTypeLabel(type: SigningFieldType) {
  if (type === "initial") return "Initial";
  if (type === "date") return "Date signed";
  return type[0].toUpperCase() + type.slice(1);
}

export function participantDisplayName(
  participant: Pick<SigningParticipant, "full_name" | "email" | "user_id">,
) {
  return (
    participant.full_name?.trim() ||
    participant.email?.trim() ||
    (participant.user_id ? "OfficeKonnect member" : "Unregistered participant")
  );
}

export function isSigningParticipantEligible(
  request: Pick<
    SigningRequest,
    "status" | "signing_order" | "current_order_index" | "expires_at" | "voided_at"
  >,
  participant: Pick<SigningParticipant, "role" | "status" | "order_index" | "access_revoked_at">,
) {
  if (!["sent", "in_progress"].includes(request.status)) return false;
  if (request.voided_at || participant.access_revoked_at) return false;
  if (request.expires_at && new Date(request.expires_at).getTime() <= Date.now()) return false;
  if (participant.role === "cc") return false;
  if (!["pending", "viewed"].includes(participant.status)) return false;
  if (
    request.signing_order === "sequential" &&
    participant.order_index !== request.current_order_index
  )
    return false;
  return true;
}

export function normalizeSigningField(input: SigningFieldInput): SigningFieldInput {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

  // The database requires the entire normalized rectangle to remain on-page:
  // x + w <= 1 and y + h <= 1. Clamp the origin first, then size against
  // the remaining space so edge placements cannot violate that invariant.
  const x = clamp(input.x, 0, 0.97);
  const y = clamp(input.y, 0, 0.98);
  const w = clamp(input.w, 0.03, 1 - x);
  const h = clamp(input.h, 0.02, 1 - y);

  return {
    ...input,
    page: Math.max(1, Math.round(input.page || 1)),
    x,
    y,
    w,
    h,
    rotation: clamp(input.rotation ?? 0, -360, 360),
    required: input.required ?? true,
    label: input.label?.trim() || null,
  };
}

export function validateSigningDraftConfiguration(
  participants: SigningParticipant[],
  fields: SigningField[],
) {
  const actionParticipants = participants.filter((participant) => participant.role !== "cc");
  if (actionParticipants.length === 0) return "At least one signer or approver is required.";
  for (const participant of participants) {
    if (!participant.user_id)
      return "Every signing participant must have an active OfficeKonnect account.";
    if (
      participant.role === "cc" &&
      fields.some((field) => field.participant_id === participant.id)
    ) {
      return "CC recipients cannot own signing fields.";
    }
    if (
      participant.role === "signer" &&
      !fields.some(
        (field) =>
          field.participant_id === participant.id &&
          field.required &&
          (field.type === "signature" || field.type === "initial"),
      )
    ) {
      return `${participantDisplayName(participant)} needs at least one required signature or initial field.`;
    }
  }
  return null;
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import {
  normalizeSigningField,
  type ParticipantRole,
  type SigningFieldInput,
  type SigningFieldValue,
  type SigningOrder,
  type SigningParticipantInput,
} from "@/lib/signing";

async function requireDraftRequest(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  requestId: string,
  userId: string,
) {
  const { data: request, error } = await supabase
    .from("signing_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (error) throw new Error(error.message);
  if (request.status !== "draft" || request.locked_at) throw new Error("This signing request is locked and can no longer be edited");
  if (request.sender_id !== userId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", request.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Only the sender or a workspace administrator may edit this draft");
    }
  }
  return request;
}

async function signedAssetUrl(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  path: string | null | undefined,
  preferredBuckets: string[],
  expiresIn = 600,
) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  for (const bucket of preferredBuckets) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

export const createSigningDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      documentId: string;
      title: string;
      message?: string;
      signingOrder?: SigningOrder;
      participants: SigningParticipantInput[];
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const title = data.title.trim();
    if (!title) throw new Error("A request title is required");

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,workspace_id,document_kind,file_type,storage_path,current_file_url")
      .eq("id", data.documentId)
      .single();
    if (documentError) throw new Error(documentError.message);
    if (document.workspace_id !== workspaceId) throw new Error("Document does not belong to the active workspace");
    const isPdf =
      document.document_kind === "file" &&
      (document.file_type?.toLowerCase() === "application/pdf" ||
        document.file_type?.toLowerCase() === "pdf" ||
        document.storage_path?.toLowerCase().endsWith(".pdf") ||
        document.current_file_url?.toLowerCase().includes(".pdf"));
    if (!isPdf) throw new Error("E-signature requests require a PDF. Create a signing copy from Documents or Sheets first.");

    const normalizedParticipants = data.participants.map((participant, index) => ({
      userId: participant.userId ?? null,
      email: participant.email?.trim().toLowerCase() || null,
      fullName: participant.fullName?.trim() || null,
      role: participant.role,
      orderIndex: Number.isFinite(participant.orderIndex) ? participant.orderIndex : index,
    }));
    if (!normalizedParticipants.some((participant) => participant.role !== "cc")) {
      throw new Error("At least one signer or approver is required");
    }
    if (normalizedParticipants.some((participant) => !participant.userId && !participant.email)) {
      throw new Error("Every participant must have a workspace account or email address");
    }

    const { data: request, error: requestError } = await supabase
      .from("signing_requests")
      .insert({
        document_id: data.documentId,
        workspace_id: workspaceId,
        sender_id: userId,
        title,
        message: data.message?.trim() || null,
        status: "draft",
        app_source: "officekonnect",
        signing_order: data.signingOrder ?? "parallel",
      })
      .select("*")
      .single();
    if (requestError) throw new Error(requestError.message);

    const rows = normalizedParticipants.map((participant) => ({
      request_id: request.id,
      user_id: participant.userId,
      email: participant.email,
      full_name: participant.fullName,
      order_index: participant.orderIndex,
      role: participant.role,
      status: "pending" as const,
    }));
    const { data: participants, error: participantError } = await supabase
      .from("signing_participants")
      .insert(rows)
      .select("*");
    if (participantError) {
      await supabase.from("signing_requests").delete().eq("id", request.id);
      throw new Error(participantError.message);
    }
    return { request, participants: participants ?? [] };
  });

export const createSigningRequest = createSigningDraft;

export const updateSigningDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; title: string; message?: string | null; signingOrder: SigningOrder }) => data)
  .handler(async ({ data, context }) => {
    await requireDraftRequest(context.supabase, data.requestId, context.userId);
    const { data: request, error } = await context.supabase
      .from("signing_requests")
      .update({
        title: data.title.trim(),
        message: data.message?.trim() || null,
        signing_order: data.signingOrder,
      })
      .eq("id", data.requestId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return request;
  });

export const addSigningParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; participant: SigningParticipantInput }) => data)
  .handler(async ({ data, context }) => {
    await requireDraftRequest(context.supabase, data.requestId, context.userId);
    const participant = data.participant;
    const email = participant.email?.trim().toLowerCase() || null;
    if (!participant.userId && !email) throw new Error("A participant account or email is required");
    const { data: row, error } = await context.supabase
      .from("signing_participants")
      .insert({
        request_id: data.requestId,
        user_id: participant.userId ?? null,
        email,
        full_name: participant.fullName?.trim() || null,
        order_index: participant.orderIndex,
        role: participant.role,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSigningParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      participantId: string;
      role: ParticipantRole;
      orderIndex: number;
      fullName?: string | null;
      email?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: existingError } = await context.supabase
      .from("signing_participants")
      .select("request_id")
      .eq("id", data.participantId)
      .single();
    if (existingError) throw new Error(existingError.message);
    await requireDraftRequest(context.supabase, existing.request_id, context.userId);
    if (data.role === "cc") {
      const { count } = await context.supabase
        .from("signing_fields")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", data.participantId);
      if ((count ?? 0) > 0) throw new Error("Remove this participant's fields before changing the role to CC");
    }
    const { data: row, error } = await context.supabase
      .from("signing_participants")
      .update({
        role: data.role,
        order_index: data.orderIndex,
        full_name: data.fullName?.trim() || null,
        email: data.email?.trim().toLowerCase() || null,
      })
      .eq("id", data.participantId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeSigningParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { participantId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: existing, error: existingError } = await context.supabase
      .from("signing_participants")
      .select("request_id")
      .eq("id", data.participantId)
      .single();
    if (existingError) throw new Error(existingError.message);
    await requireDraftRequest(context.supabase, existing.request_id, context.userId);
    const { error } = await context.supabase.from("signing_participants").delete().eq("id", data.participantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSigningField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; field: SigningFieldInput }) => data)
  .handler(async ({ data, context }) => {
    await requireDraftRequest(context.supabase, data.requestId, context.userId);
    const field = normalizeSigningField(data.field);
    const { data: participant, error: participantError } = await context.supabase
      .from("signing_participants")
      .select("id,request_id,role")
      .eq("id", field.participantId)
      .eq("request_id", data.requestId)
      .single();
    if (participantError) throw new Error(participantError.message);
    if (participant.role === "cc") throw new Error("CC recipients cannot own signing fields");
    const { data: row, error } = await context.supabase
      .from("signing_fields")
      .insert({
        request_id: data.requestId,
        participant_id: field.participantId,
        type: field.type,
        page: field.page,
        x: field.x,
        y: field.y,
        w: field.w,
        h: field.h,
        rotation: field.rotation ?? 0,
        required: field.required ?? true,
        label: field.label,
        validation: (field.validation ?? {}) as Json,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSigningField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fieldId: string; field: SigningFieldInput }) => data)
  .handler(async ({ data, context }) => {
    const { data: existing, error: existingError } = await context.supabase
      .from("signing_fields")
      .select("request_id")
      .eq("id", data.fieldId)
      .single();
    if (existingError) throw new Error(existingError.message);
    await requireDraftRequest(context.supabase, existing.request_id, context.userId);
    const field = normalizeSigningField(data.field);
    const { data: participant, error: participantError } = await context.supabase
      .from("signing_participants")
      .select("id,request_id,role")
      .eq("id", field.participantId)
      .eq("request_id", existing.request_id)
      .single();
    if (participantError) throw new Error(participantError.message);
    if (participant.role === "cc") throw new Error("CC recipients cannot own signing fields");
    const { data: row, error } = await context.supabase
      .from("signing_fields")
      .update({
        participant_id: field.participantId,
        type: field.type,
        page: field.page,
        x: field.x,
        y: field.y,
        w: field.w,
        h: field.h,
        rotation: field.rotation ?? 0,
        required: field.required ?? true,
        label: field.label,
        validation: (field.validation ?? {}) as Json,
      })
      .eq("id", data.fieldId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeSigningField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fieldId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: existing, error: existingError } = await context.supabase
      .from("signing_fields")
      .select("request_id")
      .eq("id", data.fieldId)
      .single();
    if (existingError) throw new Error(existingError.message);
    await requireDraftRequest(context.supabase, existing.request_id, context.userId);
    const { error } = await context.supabase.from("signing_fields").delete().eq("id", data.fieldId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function invokeSigningAction(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  body: Record<string, unknown>,
) {
  const { data, error } = await supabase.functions.invoke("signing-actions", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export const sendSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; expiresAt?: string | null }) => data)
  .handler(async ({ data, context }) => invokeSigningAction(context.supabase, { action: "send", requestId: data.requestId, expiresAt: data.expiresAt ?? null }));

export const rotateSigningInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { participantId: string; expiresAt?: string | null }) => data)
  .handler(async ({ data, context }) => invokeSigningAction(context.supabase, { action: "rotate", participantId: data.participantId, expiresAt: data.expiresAt ?? null }));

export const markSigningParticipantViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { participantId: string }) => data)
  .handler(async ({ data, context }) => invokeSigningAction(context.supabase, { action: "viewed", participantId: data.participantId }));

export const completeSigningParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { participantId: string; fieldValues: SigningFieldValue[]; consentTextVersion: string }) => data)
  .handler(async ({ data, context }) => invokeSigningAction(context.supabase, {
    action: "complete",
    participantId: data.participantId,
    fieldValues: data.fieldValues,
    consentTextVersion: data.consentTextVersion,
  }));

export const declineSigningParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { participantId: string; reason: string }) => data)
  .handler(async ({ data, context }) => invokeSigningAction(context.supabase, { action: "decline", participantId: data.participantId, reason: data.reason.trim() }));

export const finalizeSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string }) => data)
  .handler(async ({ data, context }) => invokeSigningAction(context.supabase, { action: "finalize", requestId: data.requestId }));

export const cancelSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: request, error } = await supabase
      .from("signing_requests")
      .select("id,sender_id,workspace_id,status,locked_at")
      .eq("id", data.requestId)
      .single();
    if (error) throw new Error(error.message);
    if (request.sender_id !== userId) {
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", request.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!membership || !["owner", "admin"].includes(membership.role)) throw new Error("You cannot cancel this request");
    }
    if (request.status === "draft" && !request.locked_at) {
      const { error: deleteError } = await supabase.from("signing_requests").delete().eq("id", request.id);
      if (deleteError) throw new Error(deleteError.message);
      return { deletedDraft: true };
    }
    return invokeSigningAction(supabase, { action: "cancel", requestId: request.id, reason: data.reason?.trim() || "Cancelled by sender" });
  });

export const getSigningRequestAssetLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: request, error } = await supabase
      .from("signing_requests")
      .select("*,documents(id,title,storage_path,current_file_url)")
      .eq("id", data.requestId)
      .single();
    if (error) throw new Error(error.message);

    let sourcePath: string | null = null;
    if (request.source_document_version_id) {
      const { data: version } = await supabase
        .from("document_versions")
        .select("storage_path,file_url")
        .eq("id", request.source_document_version_id)
        .maybeSingle();
      sourcePath = version?.storage_path ?? version?.file_url ?? null;
    }
    sourcePath ||= request.documents?.storage_path ?? request.documents?.current_file_url ?? null;

    const { data: certificate } = await supabase
      .from("signing_certificates")
      .select("*")
      .eq("request_id", request.id)
      .maybeSingle();

    return {
      sourceUrl: await signedAssetUrl(supabase, sourcePath, ["document-versions", "documents", "exports"]),
      finalUrl: await signedAssetUrl(supabase, request.final_export_path, ["exports", "document-versions", "documents"]),
      certificateUrl: await signedAssetUrl(
        supabase,
        certificate?.certificate_path ?? request.audit_certificate_path,
        ["exports", "document-versions", "documents"],
      ),
      certificate,
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

export interface RecipientInput {
  email: string;
  fullName?: string;
  isGuest: boolean;
  userId?: string | null;
}

/**
 * Create the editable configuration for a signing request.
 *
 * Phase 5 deliberately allows direct RLS-protected writes only while a request
 * is an unlocked draft. Sending, completion, decline, cancellation and
 * finalization are server-authoritative state transitions and must go through
 * the signing RPC/Edge Function layer.
 */
export const createSigningDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      documentId: string;
      title: string;
      message?: string;
      recipients: RecipientInput[];
      signingOrder?: "parallel" | "sequential";
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);

    const recipients = (data.recipients ?? [])
      .map((recipient) => ({
        ...recipient,
        email: recipient.email.trim().toLowerCase(),
      }))
      .filter((recipient) => recipient.userId || /.+@.+\..+/.test(recipient.email));

    if (recipients.length === 0) {
      throw new Error("At least one valid recipient is required");
    }

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id, workspace_id")
      .eq("id", data.documentId)
      .single();
    if (documentError) throw new Error(documentError.message);
    if (document.workspace_id !== workspaceId) {
      throw new Error("Document does not belong to the active workspace");
    }

    const { data: request, error: requestError } = await supabase
      .from("signing_requests")
      .insert({
        document_id: data.documentId,
        workspace_id: workspaceId,
        sender_id: userId,
        title: data.title.trim() || "Signature request",
        message: data.message?.trim() || null,
        status: "draft",
        app_source: "officekonnect",
        signing_order: data.signingOrder ?? "parallel",
      })
      .select("*")
      .single();
    if (requestError) throw new Error(requestError.message);

    const participantRows = recipients.map((recipient, index) => ({
      request_id: request.id,
      user_id: recipient.userId ?? null,
      email: recipient.email || null,
      full_name: recipient.fullName?.trim() || null,
      order_index: index,
      role: "signer" as const,
      status: "pending" as const,
    }));

    const { data: participants, error: participantError } = await supabase
      .from("signing_participants")
      .insert(participantRows)
      .select("*");

    if (participantError) {
      // The request is still an unlocked draft, so RLS permits the sender to
      // clean it up rather than leaving a partial configuration behind.
      await supabase.from("signing_requests").delete().eq("id", request.id);
      throw new Error(participantError.message);
    }

    return { request, participants: participants ?? [] };
  });

/**
 * Compatibility alias for the older caller name. This now creates a draft; it
 * never bypasses field preparation by forcing the request directly to `sent`.
 */
export const createSigningRequest = createSigningDraft;

export const sendSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; expiresAt?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.functions.invoke("signing-actions", {
      body: {
        action: "send",
        requestId: data.requestId,
        expiresAt: data.expiresAt ?? null,
      },
    });
    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(String(result.error));
    return result;
  });

export const cancelSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: request, error: requestError } = await supabase
      .from("signing_requests")
      .select("id, sender_id, workspace_id, status, locked_at")
      .eq("id", data.requestId)
      .single();
    if (requestError) throw new Error(requestError.message);

    if (request.sender_id !== userId) {
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", request.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new Error("You do not have permission to cancel this signing request");
      }
    }

    if (request.status === "draft" && request.locked_at == null) {
      const { error } = await supabase.from("signing_requests").delete().eq("id", request.id);
      if (error) throw new Error(error.message);
      return { deletedDraft: true };
    }

    const reason = data.reason?.trim() || "Cancelled by sender";
    const { data: result, error } = await supabase.functions.invoke("signing-actions", {
      body: { action: "cancel", requestId: request.id, reason },
    });
    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(String(result.error));
    return result;
  });

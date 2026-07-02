import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export interface RecipientInput {
  email: string;
  fullName?: string;
  isGuest: boolean;
  userId?: string | null;
}

// Sender creates a signing request and dispatches invitations
export const createSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      documentId: string;
      title: string;
      message?: string;
      recipients: RecipientInput[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);

    if (!data.recipients || data.recipients.length === 0) {
      throw new Error("At least one recipient is required");
    }

    // 1. Insert signing_request
    const { data: req, error: reqErr } = await supabase
      .from("signing_requests")
      .insert({
        document_id: data.documentId,
        workspace_id: workspaceId,
        sender_id: userId,
        title: data.title,
        message: data.message ?? null,
        status: "sent" as never,
        app_source: "signkonnect",
        sent_at: new Date().toISOString(),
      } as never)
      .select("*")
      .single();
    if (reqErr) throw new Error(reqErr.message);

    // 2. Insert participants
    const parts = data.recipients.map((r, idx) => ({
      request_id: req.id,
      user_id: r.userId ?? null,
      email: r.email.toLowerCase().trim(),
      full_name: r.fullName ?? null,
      order_index: idx,
      role: "signer" as never,
      status: "pending" as never,
    }));
    const { data: participants, error: partErr } = await supabase
      .from("signing_participants")
      .insert(parts as never)
      .select("*");
    if (partErr) throw new Error(partErr.message);

    // 3. Mark document as sent
    await supabase
      .from("documents")
      .update({ document_status: "sent" as never } as never)
      .eq("id", data.documentId);

    // 4. Enqueue notify job (worker mints tokens + sends emails)
    await enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "signing_notify" as never,
      input: {
        requestId: req.id,
        participantIds: (participants ?? []).map((p) => p.id),
        message: data.message ?? "",
      },
      entityType: "signing_request",
      entityId: req.id,
    });

    return { requestId: req.id, participants };
  });

// Cancel a pending request
export const cancelSigningRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("signing_requests")
      .update({ status: "cancelled" as never } as never)
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

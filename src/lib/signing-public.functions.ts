// Public (unauthenticated) server functions for guest signing.
// These use supabaseAdmin because guests have no session; every call verifies
// a signing_tokens row before touching anything.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tokenHash = await hashToken(token);
  const { data: row, error } = await supabaseAdmin
    .from("signing_tokens" as never)
    .select("id, request_id, participant_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Invalid or expired link");
  const r = row as unknown as {
    id: string;
    request_id: string;
    participant_id: string;
    expires_at: string;
    used_at: string | null;
  };
  if (new Date(r.expires_at).getTime() < Date.now()) {
    throw new Error("This signing link has expired");
  }
  return { supabaseAdmin, ...r };
}

export const getSigningContext = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(10) }).parse)
  .handler(async ({ data }) => {
    const { supabaseAdmin, request_id, participant_id } = await verifyToken(data.token);

    const { data: req } = await supabaseAdmin
      .from("signing_requests")
      .select("id, title, message, status, document_id, workspace_id")
      .eq("id", request_id)
      .single();
    if (!req) throw new Error("Request not found");

    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("id, title, storage_path, file_type, current_file_url")
      .eq("id", req.document_id)
      .single();
    if (!doc) throw new Error("Document not found");

    const { data: participants } = await supabaseAdmin
      .from("signing_participants")
      .select("id, email, full_name, status, order_index")
      .eq("request_id", request_id)
      .order("order_index", { ascending: true });

    const { data: fields } = await supabaseAdmin
      .from("document_fields" as never)
      .select("*")
      .eq("document_id", req.document_id);

    // Signed URL for the PDF
    let pdfUrl: string | null = null;
    if (doc.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 60 * 60);
      pdfUrl = signed?.signedUrl ?? null;
    }

    return {
      request: req,
      document: doc,
      pdfUrl,
      participants: participants ?? [],
      me: (participants ?? []).find((p) => p.id === participant_id) ?? null,
      fields: (fields as unknown as Array<Record<string, unknown>>) ?? [],
    };
  });

export const submitSigning = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(10),
      values: z.record(z.string(), z.string()),
      signatureDataUrl: z.string().optional(),
      fullName: z.string().optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, id: tokenId, request_id, participant_id, used_at } = await verifyToken(
      data.token,
    );
    if (used_at) throw new Error("This link has already been used");

    // Update assigned fields with submitted values
    for (const [fieldId, val] of Object.entries(data.values)) {
      await supabaseAdmin
        .from("document_fields" as never)
        .update({ value: val } as never)
        .eq("id", fieldId);
    }

    // Store signature image if provided (as a base64-embedded value on signature fields)
    if (data.signatureDataUrl) {
      await supabaseAdmin
        .from("document_fields" as never)
        .update({ value: data.signatureDataUrl } as never)
        .eq("document_id", request_id)
        .in("field_type", ["signature", "initials"] as never);
    }

    // Mark participant as signed
    await supabaseAdmin
      .from("signing_participants")
      .update({
        status: "signed" as never,
        signed_at: new Date().toISOString(),
        full_name: data.fullName ?? undefined,
      } as never)
      .eq("id", participant_id);

    // Consume token
    await supabaseAdmin
      .from("signing_tokens" as never)
      .update({ used_at: new Date().toISOString() } as never)
      .eq("id", tokenId);

    // Audit
    await supabaseAdmin.from("signing_events").insert({
      request_id,
      actor_id: null,
      event_type: "signed",
      metadata: { participant_id, guest: true } as never,
    } as never);

    // If all participants signed, enqueue finalize job
    const { data: remaining } = await supabaseAdmin
      .from("signing_participants")
      .select("id, status")
      .eq("request_id", request_id);
    const allDone = (remaining ?? []).every((p) => p.status === "signed");
    if (allDone) {
      const { data: reqRow } = await supabaseAdmin
        .from("signing_requests")
        .select("workspace_id, sender_id")
        .eq("id", request_id)
        .single();
      if (reqRow) {
        await supabaseAdmin.from("jobs").insert({
          workspace_id: reqRow.workspace_id,
          created_by: reqRow.sender_id,
          kind: "signing_finalize" as never,
          input: { requestId: request_id } as never,
          entity_type: "signing_request",
          entity_id: request_id,
          status: "queued" as never,
        } as never);
      }
    }

    return { ok: true, allDone };
  });

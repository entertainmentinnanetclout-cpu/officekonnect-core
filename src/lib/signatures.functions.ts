import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export const saveSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { name: string; signatureImageUrl: string; storagePath?: string; isDefault?: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    if (data.isDefault) {
      await supabase
        .from("user_signatures")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("created_by", userId);
    }
    const { data: sig, error } = await supabase
      .from("user_signatures")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name: data.name,
        signature_image_url: data.signatureImageUrl,
        storage_path: data.storagePath ?? null,
        is_default: !!data.isDefault,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return sig;
  });

export const deleteSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_signatures")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applySignatureToDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      documentId: string;
      signatureId: string;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "signature_apply",
      input: data as unknown as Record<string, unknown>,
      entityType: "document",
      entityId: data.documentId,
    });
  });

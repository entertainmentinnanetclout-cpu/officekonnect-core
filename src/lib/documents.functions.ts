import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export const createDocumentRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { title: string; storagePath: string; fileType: string; fileSize: number }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: data.title,
        storage_path: data.storagePath,
        file_type: data.fileType,
        file_size: data.fileSize,
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return doc;
  });

export const createSignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Namespace path with userId to satisfy storage RLS that expects auth.uid() prefix.
    const path = data.path.startsWith(`${userId}/`) ? data.path : `${userId}/${data.path}`;
    const { data: signed, error } = await supabase.storage
      .from(data.bucket)
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { ...signed, path };
  });

export const getSignedDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string; expiresIn?: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from(data.bucket)
      .createSignedUrl(data.path, data.expiresIn ?? 3600);
    if (error) throw new Error(error.message);
    return signed;
  });

export const enqueueDocumentConvert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; targetFormat: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "document_convert",
      input: { documentId: data.documentId, targetFormat: data.targetFormat },
      entityType: "document",
      entityId: data.documentId,
    });
  });

export const enqueueDocumentExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; format: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "document_export",
      input: { documentId: data.documentId, format: data.format },
      entityType: "document",
      entityId: data.documentId,
    });
  });

export const updateDocumentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; status: "draft" | "archived" | "deleted" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("documents")
      .update({ document_status: data.status as never })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

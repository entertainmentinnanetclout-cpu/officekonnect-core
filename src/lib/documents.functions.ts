import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

function workspaceStoragePath(workspaceId: string, userId: string, requestedPath: string) {
  const normalized = requestedPath.replace(/^\/+/, "");
  const workspacePrefix = `${workspaceId}/`;

  if (normalized.startsWith(workspacePrefix)) {
    return normalized;
  }

  return `${workspaceId}/${userId}/${normalized}`;
}

export const createDocumentRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { title: string; storagePath: string; fileType: string; fileSize: number }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const storagePath = workspaceStoragePath(workspaceId, userId, data.storagePath);

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: data.title,
        storage_path: storagePath,
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
    const workspaceId = await getActiveWorkspaceId(supabase, userId);

    // Live Storage RLS resolves workspace membership from the first folder segment.
    // Keep userId as the second segment to preserve per-user namespacing inside a workspace.
    const path = workspaceStoragePath(workspaceId, userId, data.path);
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

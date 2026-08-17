import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";
import {
  createEmptyNativeDocument,
  nativeDocumentToJson,
  type NativeDocumentContent,
} from "@/lib/native-document";
import { buildNativeDocumentPdf } from "@/lib/native-document-pdf.server";

function workspaceStoragePath(workspaceId: string, userId: string, requestedPath: string) {
  const normalized = requestedPath.replace(/^\/+/, "");
  const workspacePrefix = `${workspaceId}/`;

  if (normalized.startsWith(workspacePrefix)) {
    return normalized;
  }

  return `${workspaceId}/${userId}/${normalized}`;
}

function safeDownloadName(title: string) {
  const base = title.replace(/\.[^.]+$/, "").trim() || "OfficeKonnect document";
  return `${base.replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
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
        title: data.title.trim() || "Uploaded document",
        storage_path: storagePath,
        file_type: data.fileType || "application/octet-stream",
        file_size: data.fileSize,
        document_kind: "file",
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return doc;
  });

export const createNativeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title?: string; content?: NativeDocumentContent }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const content = nativeDocumentToJson(data.content ?? createEmptyNativeDocument());

    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: data.title?.trim() || "Untitled document",
        document_kind: "native",
        file_type: "application/vnd.officekonnect.document+json",
        content,
        editor_version: 1,
        word_count: 0,
        last_saved_by: userId,
        document_status: "draft",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return document;
  });

export const saveNativeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      documentId: string;
      expectedEditorVersion: number;
      content: NativeDocumentContent;
      wordCount: number;
      createVersion?: boolean;
      versionTitle?: string;
      changeSummary?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { data: document, error } = await context.supabase.rpc("save_structured_document", {
      p_document_id: data.documentId,
      p_expected_editor_version: data.expectedEditorVersion,
      p_content: nativeDocumentToJson(data.content),
      p_word_count: Math.max(0, Math.floor(data.wordCount)),
      p_create_version: data.createVersion ?? false,
      p_version_title: data.versionTitle?.trim() || undefined,
      p_change_summary: data.changeSummary?.trim() || undefined,
    });

    if (error) throw new Error(error.message);
    return document;
  });

export const restoreNativeDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { documentId: string; versionId: string; expectedEditorVersion: number }) => d,
  )
  .handler(async ({ data, context }) => {
    const { data: document, error } = await context.supabase.rpc(
      "restore_structured_document_version",
      {
        p_document_id: data.documentId,
        p_version_id: data.versionId,
        p_expected_editor_version: data.expectedEditorVersion,
      },
    );
    if (error) throw new Error(error.message);
    return document;
  });

export const renameDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; title: string }) => d)
  .handler(async ({ data, context }) => {
    const title = data.title.trim();
    if (!title) throw new Error("Document title is required");
    const { data: document, error } = await context.supabase
      .from("documents")
      .update({ title })
      .eq("id", data.documentId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return document;
  });

export const duplicateNativeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: source, error: sourceError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.workspace_id !== workspaceId) throw new Error("Document is outside the active workspace");
    if (source.document_kind !== "native") throw new Error("Only native documents can be duplicated in Phase 2");

    const { data: copy, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: `Copy of ${source.title}`,
        description: source.description,
        document_kind: "native",
        file_type: source.file_type,
        content: source.content,
        editor_version: 1,
        word_count: source.word_count,
        letterhead_id: source.letterhead_id,
        template_id: source.template_id,
        last_saved_by: userId,
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return copy;
  });

export const setDocumentLetterhead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; letterheadId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { data: document, error } = await context.supabase
      .from("documents")
      .update({ letterhead_id: data.letterheadId })
      .eq("id", data.documentId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return document;
  });

export const exportNativeDocumentPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,workspace_id,title,document_kind,content,letterhead_id")
      .eq("id", data.documentId)
      .single();
    if (documentError) throw new Error(documentError.message);
    if (document.workspace_id !== workspaceId) throw new Error("Document is outside the active workspace");
    if (document.document_kind !== "native") throw new Error("Only native documents use the Phase 2 PDF renderer");

    let letterhead: {
      name: string;
      header_content: string | null;
      footer_content: string | null;
      company_details: Json;
      logo_url: string | null;
      storage_path: string | null;
    } | null = null;
    let logoBytes: Uint8Array | null = null;
    let logoMimeType: string | null = null;

    if (document.letterhead_id) {
      const { data: letterheadRow, error: letterheadError } = await supabase
        .from("letterheads")
        .select("name,header_content,footer_content,company_details,logo_url,storage_path")
        .eq("id", document.letterhead_id)
        .maybeSingle();
      if (letterheadError) throw new Error(letterheadError.message);
      letterhead = letterheadRow;

      if (letterhead?.storage_path) {
        const { data: logoBlob } = await supabase.storage
          .from("letterheads")
          .download(letterhead.storage_path);
        if (logoBlob) {
          logoBytes = new Uint8Array(await logoBlob.arrayBuffer());
          logoMimeType = logoBlob.type;
        }
      } else if (letterhead?.logo_url && /^https?:\/\//i.test(letterhead.logo_url)) {
        const response = await fetch(letterhead.logo_url);
        if (response.ok) {
          logoBytes = new Uint8Array(await response.arrayBuffer());
          logoMimeType = response.headers.get("content-type");
        }
      }
    }

    const rendered = await buildNativeDocumentPdf({
      title: document.title,
      content: document.content,
      letterhead,
      logoBytes,
      logoMimeType,
    });

    const storagePath = `${workspaceId}/${userId}/documents/${document.id}/export-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("exports").upload(
      storagePath,
      rendered.bytes,
      { contentType: "application/pdf", upsert: false },
    );
    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from("documents")
      .update({ page_count: rendered.pageCount })
      .eq("id", document.id);
    if (updateError) throw new Error(updateError.message);

    const { data: signed, error: signedError } = await supabase.storage
      .from("exports")
      .createSignedUrl(storagePath, 60 * 60);
    if (signedError) throw new Error(signedError.message);

    return {
      url: signed.signedUrl,
      storagePath,
      fileName: safeDownloadName(document.title),
      pageCount: rendered.pageCount,
    };
  });

export const createSignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bucket: string; path: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);

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
    const { data: document, error } = await context.supabase
      .from("documents")
      .update({ document_status: data.status })
      .eq("id", data.documentId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return document;
  });

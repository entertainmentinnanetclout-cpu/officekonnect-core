import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

function safeBaseName(title: string) {
  return (title.replace(/\.[^.]+$/, "").trim() || "OfficeKonnect document").replace(
    /[\\/:*?"<>|]+/g,
    "-",
  );
}

async function requireNativeSource(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  userId: string,
  documentId: string,
) {
  const workspaceId = await getActiveWorkspaceId(supabase, userId);
  const { data: source, error: sourceError } = await supabase
    .from("documents")
    .select("id,workspace_id,title,document_kind,content,letterhead_id,updated_at")
    .eq("id", documentId)
    .single();
  if (sourceError) throw new Error(sourceError.message);
  if (source.workspace_id !== workspaceId) throw new Error("Document is outside the active workspace");
  if (source.document_kind !== "native") {
    throw new Error("Only editable OfficeKonnect documents can be exported from this editor");
  }
  return { source, workspaceId };
}

export const saveNativeDocumentAsPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; title?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { source, workspaceId } = await requireNativeSource(supabase, userId, data.documentId);

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

    if (source.letterhead_id) {
      const { data: letterheadRow, error: letterheadError } = await supabase
        .from("letterheads")
        .select("name,header_content,footer_content,company_details,logo_url,storage_path")
        .eq("id", source.letterhead_id)
        .maybeSingle();
      if (letterheadError) throw new Error(letterheadError.message);
      letterhead = letterheadRow;

      if (letterhead?.storage_path) {
        const { data: logoBlob, error: logoError } = await supabase.storage
          .from("letterheads")
          .download(letterhead.storage_path);
        if (logoError) throw new Error(logoError.message);
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

    const { buildNativeDocumentPdf } = await import("@/lib/native-document-pdf.server");
    const rendered = await buildNativeDocumentPdf({
      title: source.title,
      content: source.content,
      letterhead,
      logoBytes,
      logoMimeType,
      renderedAt: source.updated_at,
    });

    const documentId = crypto.randomUUID();
    const baseName = safeBaseName(data.title?.trim() || source.title);
    const fileName = `${baseName}.pdf`;
    const storagePath = `${workspaceId}/${userId}/documents/${documentId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, rendered.bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: saved, error: insertError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: userId,
        last_saved_by: userId,
        title: fileName,
        description: `PDF copy saved from ${source.title}`,
        storage_path: storagePath,
        file_type: "application/pdf",
        file_size: rendered.bytes.byteLength,
        document_kind: "file",
        document_status: "draft",
        page_count: rendered.pageCount,
        letterhead_id: source.letterhead_id,
      })
      .select("*")
      .single();

    if (insertError) {
      await supabase.storage.from("documents").remove([storagePath]);
      throw new Error(insertError.message);
    }

    const { error: versionError } = await supabase.from("document_versions").insert({
      document_id: documentId,
      version_number: 1,
      title: fileName,
      created_by: userId,
      storage_path: storagePath,
      change_summary: `Saved as PDF from editable document ${source.id}`,
    });
    if (versionError) throw new Error(versionError.message);

    return saved;
  });

export const saveNativeDocumentAsDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; title?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { source, workspaceId } = await requireNativeSource(supabase, userId, data.documentId);

    const { buildNativeDocumentDocx } = await import("@/lib/native-document-docx.server");
    const rendered = await buildNativeDocumentDocx({
      title: source.title,
      content: source.content,
    });

    const documentId = crypto.randomUUID();
    const baseName = safeBaseName(data.title?.trim() || source.title);
    const fileName = `${baseName}.docx`;
    const storagePath = `${workspaceId}/${userId}/documents/${documentId}/${fileName}`;
    const contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, rendered.bytes, {
        contentType,
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: saved, error: insertError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        workspace_id: workspaceId,
        created_by: userId,
        last_saved_by: userId,
        title: fileName,
        description: `Word copy saved from ${source.title}`,
        storage_path: storagePath,
        file_type: contentType,
        file_size: rendered.bytes.byteLength,
        document_kind: "file",
        document_status: "draft",
        letterhead_id: source.letterhead_id,
      })
      .select("*")
      .single();

    if (insertError) {
      await supabase.storage.from("documents").remove([storagePath]);
      throw new Error(insertError.message);
    }

    const { error: versionError } = await supabase.from("document_versions").insert({
      document_id: documentId,
      version_number: 1,
      title: fileName,
      created_by: userId,
      storage_path: storagePath,
      change_summary: `Saved as structured DOCX from editable document ${source.id}`,
    });
    if (versionError) {
      await supabase.from("documents").delete().eq("id", documentId);
      await supabase.storage.from("documents").remove([storagePath]);
      throw new Error(versionError.message);
    }

    return saved;
  });

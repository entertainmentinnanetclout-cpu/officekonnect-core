import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { buildNativeDocumentPdf } from "@/lib/native-document-pdf.server";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

function signingCopyTitle(title: string) {
  const base = title.replace(/\.[^.]+$/, "").trim() || "Untitled document";
  return `${base} — Signing Copy`;
}

export const createNativeDocumentSigningCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);

    const { data: source, error: sourceError } = await supabase
      .from("documents")
      .select(
        "id,workspace_id,title,description,document_kind,content,letterhead_id,updated_at,document_status",
      )
      .eq("id", data.documentId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.workspace_id !== workspaceId) {
      throw new Error("Document is outside the active workspace");
    }
    if (source.document_kind !== "native") {
      throw new Error("Only native documents can generate an OfficeKonnect signing copy");
    }
    if (source.document_status === "deleted") {
      throw new Error("Restore this document before generating a signing copy");
    }

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
      title: source.title,
      content: source.content,
      letterhead,
      logoBytes,
      logoMimeType,
      renderedAt: source.updated_at,
    });

    const copyTitle = signingCopyTitle(source.title);
    const copyId = crypto.randomUUID();
    const storagePath = `${workspaceId}/${userId}/documents/${copyId}/signing-copy.pdf`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(
      storagePath,
      rendered.bytes,
      {
        contentType: "application/pdf",
        upsert: false,
      },
    );
    if (uploadError) throw new Error(uploadError.message);

    const { data: copy, error: insertError } = await supabase
      .from("documents")
      .insert({
        id: copyId,
        workspace_id: workspaceId,
        created_by: userId,
        title: copyTitle,
        description: `Static PDF signing copy generated from ${source.title}.`,
        document_kind: "file",
        file_type: "application/pdf",
        file_size: rendered.bytes.byteLength,
        page_count: rendered.pageCount,
        storage_path: storagePath,
        original_file_url: storagePath,
        current_file_url: storagePath,
        document_status: "draft",
      })
      .select("*")
      .single();

    if (insertError) {
      await supabase.storage.from("documents").remove([storagePath]);
      throw new Error(insertError.message);
    }

    const { data: version, error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: copy.id,
        version_number: 1,
        file_url: storagePath,
        storage_path: storagePath,
        created_by: userId,
        title: copyTitle,
        change_summary: `Immutable PDF generated from native document ${source.id}.`,
        letterhead_id: source.letterhead_id,
      })
      .select("id,version_number,storage_path")
      .single();

    if (versionError) {
      await supabase.from("documents").delete().eq("id", copy.id);
      await supabase.storage.from("documents").remove([storagePath]);
      throw new Error(versionError.message);
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60);
    if (signedError) throw new Error(signedError.message);

    return {
      document: copy,
      sourceDocumentId: source.id,
      sourceUpdatedAt: source.updated_at,
      sourceVersion: version,
      url: signed.signedUrl,
      storagePath,
      pageCount: rendered.pageCount,
    };
  });

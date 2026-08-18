import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import {
  createEmptyWorkbook,
  normalizeWorkbookContent,
  workbookMetrics,
  workbookToJson,
  type WorkbookContent,
} from "@/lib/spreadsheet";
import { buildSpreadsheetPdf } from "@/lib/spreadsheet-pdf.server";

function safeFileName(title: string, extension: string) {
  const base = title.replace(/\.[^.]+$/, "").trim() || "OfficeKonnect Sheet";
  return `${base.replace(/[\\/:*?"<>|]+/g, "-")}.${extension}`;
}

function signingCopyTitle(title: string) {
  const base = title.replace(/\.[^.]+$/, "").trim() || "Untitled spreadsheet";
  return `${base} — Signing Copy`;
}

export const createSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title?: string; content?: WorkbookContent }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const workbook = normalizeWorkbookContent(data.content ?? createEmptyWorkbook());
    const metrics = workbookMetrics(workbook);
    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: data.title?.trim() || "Untitled spreadsheet",
        document_kind: "spreadsheet",
        file_type: "application/vnd.officekonnect.sheet+json",
        content: workbookToJson(workbook),
        editor_version: 1,
        sheet_count: metrics.sheetCount,
        cell_count: metrics.cellCount,
        formula_count: metrics.formulaCount,
        calculation_version: 1,
        last_calculated_at: new Date().toISOString(),
        last_saved_by: userId,
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return document;
  });

export const saveSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      documentId: string;
      expectedEditorVersion: number;
      content: WorkbookContent;
      createVersion?: boolean;
      versionTitle?: string;
      changeSummary?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const workbook = normalizeWorkbookContent(data.content);
    const metrics = workbookMetrics(workbook);
    const { data: document, error } = await context.supabase.rpc("save_structured_document", {
      p_document_id: data.documentId,
      p_expected_editor_version: data.expectedEditorVersion,
      p_content: workbookToJson(workbook),
      p_word_count: 0,
      p_sheet_count: metrics.sheetCount,
      p_cell_count: metrics.cellCount,
      p_formula_count: metrics.formulaCount,
      p_create_version: data.createVersion ?? false,
      p_version_title: data.versionTitle?.trim() || undefined,
      p_change_summary: data.changeSummary?.trim() || undefined,
    });
    if (error) throw new Error(error.message);
    return document;
  });

export const restoreSpreadsheetVersion = createServerFn({ method: "POST" })
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
    if (document.document_kind !== "spreadsheet") throw new Error("The restored version is not a spreadsheet");
    return document;
  });

export const duplicateSpreadsheet = createServerFn({ method: "POST" })
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
    if (source.workspace_id !== workspaceId) throw new Error("Spreadsheet is outside the active workspace");
    if (source.document_kind !== "spreadsheet") throw new Error("Only spreadsheets can use this duplicate action");
    const workbook = normalizeWorkbookContent(source.content);
    const metrics = workbookMetrics(workbook);
    const { data: copy, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: `Copy of ${source.title}`,
        description: source.description,
        document_kind: "spreadsheet",
        file_type: source.file_type || "application/vnd.officekonnect.sheet+json",
        content: workbookToJson(workbook),
        editor_version: 1,
        sheet_count: metrics.sheetCount,
        cell_count: metrics.cellCount,
        formula_count: metrics.formulaCount,
        calculation_version: 1,
        last_calculated_at: new Date().toISOString(),
        template_id: source.template_id,
        last_saved_by: userId,
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return copy;
  });

export const exportSpreadsheetPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; sheetIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: source, error: sourceError } = await supabase
      .from("documents")
      .select("id,workspace_id,title,document_kind,content,updated_at,document_status")
      .eq("id", data.documentId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.workspace_id !== workspaceId) throw new Error("Spreadsheet is outside the active workspace");
    if (source.document_kind !== "spreadsheet") throw new Error("Only OfficeKonnect Sheets use this PDF renderer");
    if (source.document_status === "deleted") throw new Error("Restore this spreadsheet before exporting it");
    const rendered = await buildSpreadsheetPdf({
      title: source.title,
      content: source.content,
      sheetIds: data.sheetIds,
      renderedAt: source.updated_at,
    });
    const storagePath = `${workspaceId}/${userId}/spreadsheets/${source.id}/export-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("exports")
      .upload(storagePath, rendered.bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { error: updateError } = await supabase
      .from("documents")
      .update({ page_count: rendered.pageCount })
      .eq("id", source.id);
    if (updateError) throw new Error(updateError.message);
    const { data: signed, error: signedError } = await supabase.storage
      .from("exports")
      .createSignedUrl(storagePath, 60 * 60);
    if (signedError) throw new Error(signedError.message);
    return {
      url: signed.signedUrl,
      storagePath,
      fileName: safeFileName(source.title, "pdf"),
      pageCount: rendered.pageCount,
    };
  });

export const createSpreadsheetSigningCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; sheetIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: source, error: sourceError } = await supabase
      .from("documents")
      .select("id,workspace_id,title,description,document_kind,content,updated_at,document_status")
      .eq("id", data.documentId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.workspace_id !== workspaceId) throw new Error("Spreadsheet is outside the active workspace");
    if (source.document_kind !== "spreadsheet") throw new Error("Only spreadsheets can generate this signing copy");
    if (source.document_status === "deleted") throw new Error("Restore this spreadsheet before generating a signing copy");

    const rendered = await buildSpreadsheetPdf({
      title: source.title,
      content: source.content,
      sheetIds: data.sheetIds,
      renderedAt: source.updated_at,
    });
    const copyTitle = signingCopyTitle(source.title);
    const copyId = crypto.randomUUID();
    const storagePath = `${workspaceId}/${userId}/documents/${copyId}/signing-copy.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, rendered.bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: copy, error: insertError } = await supabase
      .from("documents")
      .insert({
        id: copyId,
        workspace_id: workspaceId,
        created_by: userId,
        title: copyTitle,
        description: `Static PDF signing copy generated from spreadsheet ${source.title}.`,
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
        change_summary: `Immutable PDF generated from spreadsheet ${source.id}.`,
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

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import {
  nativeDocumentToJson,
  nativeDocumentWordCount,
  normalizeNativeDocumentContent,
} from "@/lib/native-document";
import { normalizeWorkbookContent, workbookMetrics, workbookToJson } from "@/lib/spreadsheet";
import { normalizeTemplateCategory, normalizeTemplateKind } from "@/lib/templates";

export const createTemplateFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { documentId: string; name?: string; description?: string; category?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: source, error: sourceError } = await supabase
      .from("documents")
      .select("id,workspace_id,title,description,document_kind,content,letterhead_id,document_status")
      .eq("id", data.documentId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.workspace_id !== workspaceId) throw new Error("Document is outside the active workspace");
    if (source.document_status === "deleted") throw new Error("Restore this document before saving it as a template");
    if (source.document_kind !== "native" && source.document_kind !== "spreadsheet") {
      throw new Error("Only native documents and OfficeKonnect Sheets can be saved as templates");
    }

    const kind = source.document_kind === "spreadsheet" ? "spreadsheet" : "document";
    const name = data.name?.trim() || source.title.trim() || "Untitled template";
    const category = normalizeTemplateCategory(
      data.category ?? (kind === "spreadsheet" ? "Spreadsheets" : "General"),
    );
    const content =
      kind === "spreadsheet"
        ? workbookToJson(normalizeWorkbookContent(source.content))
        : nativeDocumentToJson(normalizeNativeDocumentContent(source.content));

    const { data: template, error } = await supabase
      .from("document_templates")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name,
        description: data.description?.trim() || source.description,
        category,
        template_kind: kind,
        content,
        letterhead_id: kind === "document" ? source.letterhead_id : null,
        is_archived: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return template;
  });

export const createDocumentFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string; title?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: template, error: templateError } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.templateId)
      .single();
    if (templateError) throw new Error(templateError.message);
    if (template.workspace_id !== workspaceId) throw new Error("Template is outside the active workspace");
    if (template.is_archived) throw new Error("Restore this template before using it");

    const kind = normalizeTemplateKind(template.template_kind);
    const title = data.title?.trim() || `${template.name} — New`;
    if (kind === "spreadsheet") {
      const workbook = normalizeWorkbookContent(template.content);
      const metrics = workbookMetrics(workbook);
      const { data: document, error } = await supabase
        .from("documents")
        .insert({
          workspace_id: workspaceId,
          created_by: userId,
          title,
          document_kind: "spreadsheet",
          file_type: "application/vnd.officekonnect.sheet+json",
          content: workbookToJson(workbook),
          template_id: template.id,
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
    }

    const content = normalizeNativeDocumentContent(template.content);
    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title,
        document_kind: "native",
        file_type: "application/vnd.officekonnect.document+json",
        content: nativeDocumentToJson(content),
        template_id: template.id,
        letterhead_id: template.letterhead_id,
        editor_version: 1,
        word_count: nativeDocumentWordCount(content),
        last_saved_by: userId,
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return document;
  });

export const duplicateDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: source, error: sourceError } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.templateId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    if (source.workspace_id !== workspaceId) throw new Error("Template is outside the active workspace");
    const { data: template, error } = await supabase
      .from("document_templates")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name: `Copy of ${source.name}`,
        description: source.description,
        category: source.category,
        content: source.content,
        letterhead_id: source.letterhead_id,
        template_kind: source.template_kind,
        is_archived: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return template;
  });

export const updateDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      templateId: string;
      name?: string;
      description?: string | null;
      category?: string;
      isArchived?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const updates: {
      name?: string;
      description?: string | null;
      category?: string;
      is_archived?: boolean;
    } = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new Error("Template name is required");
      updates.name = name;
    }
    if (data.description !== undefined) updates.description = data.description?.trim() || null;
    if (data.category !== undefined) updates.category = normalizeTemplateCategory(data.category);
    if (data.isArchived !== undefined) updates.is_archived = data.isArchived;
    if (Object.keys(updates).length === 0) throw new Error("No template changes were provided");

    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: template, error } = await supabase
      .from("document_templates")
      .update(updates)
      .eq("id", data.templateId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return template;
  });

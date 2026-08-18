import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

export type FieldType = "text" | "date" | "checkbox" | "signature" | "initials" | "name" | "email";

export interface DocumentFieldRow {
  id: string;
  workspace_id: string;
  document_id: string;
  created_by: string;
  field_type: FieldType;
  label: string | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
  default_value: string | null;
  value: string | null;
  properties: Record<string, string | number | boolean | null>;
  assigned_email: string | null;
  assigned_participant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentFieldInput {
  id?: string;
  documentId: string;
  fieldType: FieldType;
  label?: string | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required?: boolean;
  defaultValue?: string | null;
  value?: string | null;
  properties?: Record<string, string | number | boolean | null>;
  assignedEmail?: string | null;
}

export const listDocumentFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }): Promise<{ fields: DocumentFieldRow[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("document_fields" as never)
      .select("*")
      .eq("document_id", data.documentId)
      .order("page", { ascending: true });
    if (error) throw new Error(error.message);
    return { fields: (rows ?? []) as unknown as DocumentFieldRow[] };
  });

export const upsertDocumentField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: DocumentFieldInput) => d)
  .handler(async ({ data, context }): Promise<{ field: DocumentFieldRow }> => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const row = {
      workspace_id: workspaceId,
      document_id: data.documentId,
      created_by: userId,
      field_type: data.fieldType,
      label: data.label ?? null,
      page: data.page,
      x: data.x,
      y: data.y,
      w: data.w,
      h: data.h,
      required: !!data.required,
      default_value: data.defaultValue ?? null,
      value: data.value ?? null,
      properties: data.properties ?? {},
      assigned_email: data.assignedEmail ?? null,
    };
    if (data.id) {
      const { data: out, error } = await supabase
        .from("document_fields" as never)
        .update(row as never)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { field: out as unknown as DocumentFieldRow };
    }
    const { data: out, error } = await supabase
      .from("document_fields" as never)
      .insert(row as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { field: out as unknown as DocumentFieldRow };
  });

export const deleteDocumentField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("document_fields" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

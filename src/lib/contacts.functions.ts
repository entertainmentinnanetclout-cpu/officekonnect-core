import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      company?: string;
      customFields?: Record<string, unknown>;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: row, error } = await supabase
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        first_name: data.firstName ?? null,
        last_name: data.lastName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        company: data.company ?? null,
        custom_fields: (data.customFields ?? {}) as never,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createContactGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: row, error } = await supabase
      .from("contact_groups")
      .insert({ workspace_id: workspaceId, created_by: userId, name: data.name })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const enqueueImportContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storagePath: string; format: "csv" | "xlsx" | "vcf"; groupId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "contact_import",
      input: data as unknown as Record<string, unknown>,
    });
  });

export const enqueueExportContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { format: "csv" | "xlsx" | "vcf"; groupId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "contact_export",
      input: data as unknown as Record<string, unknown>,
    });
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export const saveLetterhead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      name: string;
      companyName?: string;
      logoUrl?: string;
      headerHtml?: string;
      footerHtml?: string;
      settings?: Record<string, unknown>;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: row, error } = await supabase
      .from("letterheads")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name: data.name,
        company_name: data.companyName ?? null,
        logo_url: data.logoUrl ?? null,
        header_html: data.headerHtml ?? null,
        footer_html: data.footerHtml ?? null,
        settings: (data.settings ?? {}) as never,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const enqueueGenerateLetterhead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { letterheadId: string; documentId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "letterhead_generate",
      input: data as unknown as Record<string, unknown>,
      entityType: "letterhead",
      entityId: data.letterheadId,
    });
  });

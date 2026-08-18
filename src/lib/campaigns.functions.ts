import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { name: string; templateId: string; contactIds: string[]; scheduledFor?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: campaign, error } = await supabase
      .from("email_campaigns")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        campaign_name: data.name,
        template_id: data.templateId,
        total_recipients: data.contactIds.length,
        scheduled_for: data.scheduledFor ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.contactIds.length > 0) {
      const rows = data.contactIds.map((id) => ({
        campaign_id: campaign.id,
        contact_id: id,
      }));
      const { error: recErr } = await supabase.from("campaign_recipients").insert(rows);
      if (recErr) throw new Error(recErr.message);
    }
    return campaign;
  });

export const enqueueSendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "email_campaign_send",
      input: data as unknown as Record<string, unknown>,
      entityType: "campaign",
      entityId: data.campaignId,
      provider: "brevo",
    });
  });

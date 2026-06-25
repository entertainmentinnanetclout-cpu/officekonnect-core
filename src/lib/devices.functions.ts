import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      platform: "ios" | "android" | "web" | "desktop";
      pushToken: string;
      pushProvider: "fcm" | "apns" | "web_push" | "none";
      deviceName?: string;
      appVersion?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: row, error } = await supabase
      .from("devices")
      .upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          platform: data.platform,
          push_token: data.pushToken,
          push_provider: data.pushProvider,
          device_name: data.deviceName ?? null,
          app_version: data.appVersion ?? null,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "push_token" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const unregisterDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pushToken: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("devices")
      .update({ is_active: false })
      .eq("push_token", data.pushToken)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

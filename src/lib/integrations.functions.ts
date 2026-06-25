import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

// Record that a Brevo connection exists for the user. The actual API key
// is stored in project secrets (BREVO_API_KEY) — used by the worker.
export const connectBrevo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountEmail: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: row, error } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          provider: "brevo",
          account_email: data.accountEmail,
          is_active: true,
          metadata: {} as never,
          scopes: [],
        },
        { onConflict: "user_id,provider" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const validateBrevoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const apiKey = process.env.BREVO_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!apiKey || !lovableKey) {
      return { ok: false, error: "Brevo not configured" };
    }
    try {
      const res = await fetch("https://connector-gateway.lovable.dev/brevo/account", {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
        },
      });
      if (!res.ok) return { ok: false, error: `Brevo ${res.status}` };
      const body = await res.json();
      return { ok: true, account: body };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

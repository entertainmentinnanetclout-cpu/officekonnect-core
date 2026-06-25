// Server-only helper: resolve the active workspace for a user.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function getActiveWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.default_workspace_id) return profile.default_workspace_id;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member?.workspace_id) {
    throw new Error("No workspace found for user");
  }
  return member.workspace_id;
}

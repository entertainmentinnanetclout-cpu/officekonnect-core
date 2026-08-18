import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

export interface WorkspaceSearchResult {
  object_type: string;
  object_id: string;
  title: string;
  subtitle: string;
  route: string;
  occurred_at: string;
  metadata: Json;
}

export const searchWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string; limit?: number }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("search_workspace_objects", {
      p_workspace_id: workspaceId,
      p_query: data.query.trim(),
      p_limit: Math.max(1, Math.min(data.limit ?? 30, 100)),
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkspaceSearchResult[];
  });

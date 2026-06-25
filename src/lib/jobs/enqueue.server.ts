// Enqueue helper - inserts a job row and returns it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type JobKind = Database["public"]["Enums"]["job_kind"];

export async function enqueueJob(
  supabase: SupabaseClient<Database>,
  args: {
    workspaceId: string;
    userId: string;
    kind: JobKind;
    input: Record<string, unknown>;
    entityType?: string;
    entityId?: string;
    provider?: string;
    priority?: number;
  },
) {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      workspace_id: args.workspaceId,
      created_by: args.userId,
      kind: args.kind,
      input: args.input,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      provider: args.provider ?? null,
      priority: args.priority ?? 100,
      status: "queued",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

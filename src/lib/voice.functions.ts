import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import { enqueueJob } from "@/lib/jobs/enqueue.server";

export const createVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { title?: string; audioUrl: string; storagePath?: string; durationSeconds?: number }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: row, error } = await supabase
      .from("voice_notes")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: data.title ?? null,
        audio_url: data.audioUrl,
        storage_path: data.storagePath ?? null,
        duration_seconds: data.durationSeconds ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const enqueueTranscribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { voiceNoteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    return enqueueJob(supabase, {
      workspaceId,
      userId,
      kind: "audio_transcribe",
      input: data as unknown as Record<string, unknown>,
      entityType: "voice_note",
      entityId: data.voiceNoteId,
      provider: "openai",
    });
  });

export const renameVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; title: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("voice_notes")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

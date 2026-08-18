import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

function iso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid calendar date");
  return date.toISOString();
}

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description?: string | null;
      startsAt: string;
      endsAt: string;
      allDay?: boolean;
      location?: string | null;
      entityType?: string | null;
      entityId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const startsAt = iso(data.startsAt);
    const endsAt = iso(data.endsAt);
    if (new Date(endsAt) < new Date(startsAt)) throw new Error("Event end must be after its start");
    const title = data.title.trim();
    if (!title) throw new Error("Event title is required");
    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .insert({
        workspace_id: workspaceId,
        created_by: context.userId,
        title,
        description: data.description?.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: Boolean(data.allDay),
        location: data.location?.trim() || null,
        entity_type: data.entityType?.trim() || null,
        entity_id: data.entityId ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return event;
  });

export const updateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      eventId: string;
      title: string;
      description?: string | null;
      startsAt: string;
      endsAt: string;
      allDay?: boolean;
      location?: string | null;
      entityType?: string | null;
      entityId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const startsAt = iso(data.startsAt);
    const endsAt = iso(data.endsAt);
    if (new Date(endsAt) < new Date(startsAt)) throw new Error("Event end must be after its start");
    const title = data.title.trim();
    if (!title) throw new Error("Event title is required");
    const { data: event, error } = await context.supabase
      .from("calendar_events")
      .update({
        title,
        description: data.description?.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: Boolean(data.allDay),
        location: data.location?.trim() || null,
        entity_type: data.entityType?.trim() || null,
        entity_id: data.entityId ?? null,
      })
      .eq("id", data.eventId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return event;
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventId: string }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase.from("calendar_events").delete().eq("id", data.eventId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

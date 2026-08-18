import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid task date");
  return date.toISOString();
}

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string | null;
      startAt?: string | null;
      dueAt?: string | null;
      entityType?: string | null;
      entityId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const title = data.title.trim();
    if (!title) throw new Error("Task title is required");
    const status = data.status ?? "todo";
    const startAt = normalizeDate(data.startAt);
    const dueAt = normalizeDate(data.dueAt);
    if (startAt && dueAt && new Date(startAt) > new Date(dueAt))
      throw new Error("Task start cannot be after its due date");
    const { data: task, error } = await context.supabase
      .from("tasks")
      .insert({
        workspace_id: workspaceId,
        created_by: context.userId,
        title,
        description: data.description?.trim() || null,
        status,
        priority: data.priority ?? "medium",
        assignee_id: data.assigneeId ?? null,
        start_at: startAt,
        due_at: dueAt,
        completed_at: status === "done" ? new Date().toISOString() : null,
        entity_type: data.entityType?.trim() || null,
        entity_id: data.entityId ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return task;
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      taskId: string;
      title: string;
      description?: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      assigneeId?: string | null;
      startAt?: string | null;
      dueAt?: string | null;
      entityType?: string | null;
      entityId?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const title = data.title.trim();
    if (!title) throw new Error("Task title is required");
    const startAt = normalizeDate(data.startAt);
    const dueAt = normalizeDate(data.dueAt);
    if (startAt && dueAt && new Date(startAt) > new Date(dueAt))
      throw new Error("Task start cannot be after its due date");
    const { data: existing, error: existingError } = await context.supabase
      .from("tasks")
      .select("id,status,completed_at,workspace_id")
      .eq("id", data.taskId)
      .single();
    if (existingError) throw new Error(existingError.message);
    if (existing.workspace_id !== workspaceId)
      throw new Error("Task does not belong to the active workspace");
    const completedAt =
      data.status === "done" ? (existing.completed_at ?? new Date().toISOString()) : null;
    const { data: task, error } = await context.supabase
      .from("tasks")
      .update({
        title,
        description: data.description?.trim() || null,
        status: data.status,
        priority: data.priority,
        assignee_id: data.assigneeId ?? null,
        start_at: startAt,
        due_at: dueAt,
        completed_at: completedAt,
        entity_type: data.entityType?.trim() || null,
        entity_id: data.entityId ?? null,
      })
      .eq("id", data.taskId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return task;
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { taskId: string; status: TaskStatus }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const { data: task, error } = await context.supabase
      .from("tasks")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", data.taskId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return task;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { taskId: string }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getActiveWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("tasks")
      .delete()
      .eq("id", data.taskId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

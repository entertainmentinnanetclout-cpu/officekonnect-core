import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";
import {
  validateWorkflowTemplateInput,
  type WorkflowDecision,
  type WorkflowTemplateStepInput,
} from "@/lib/workflows";

async function requireWorkspaceAdmin(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(error.message);
  if (data.role !== "owner" && data.role !== "admin") {
    throw new Error("Workspace administrator access is required");
  }
  return data.role;
}

async function insertTemplateRevision(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  input: {
    workspaceId: string;
    userId: string;
    name: string;
    description: string;
    version: number;
    steps: ReturnType<typeof validateWorkflowTemplateInput>["steps"];
  },
) {
  const { data: template, error: templateError } = await supabase
    .from("workflow_templates")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      description: input.description || null,
      version: input.version,
      created_by: input.userId,
      is_active: true,
      entity_type: "document",
    })
    .select("*")
    .single();
  if (templateError) {
    if (templateError.code === "23505") {
      throw new Error("A workflow template with this name and version already exists");
    }
    throw new Error(templateError.message);
  }

  const stepRows = input.steps.map((step, index) => ({
    template_id: template.id,
    step_order: index + 1,
    name: step.name,
    description: step.description || null,
    step_type: step.stepType,
    assignment_mode: step.assignmentMode,
    assigned_user_id: step.assignedUserId,
    assigned_workspace_role: step.assignedWorkspaceRole,
    required_decisions: step.requiredDecisions,
    allow_changes: step.stepType === "acknowledgement" ? false : step.allowChanges,
    allow_reject: step.stepType === "acknowledgement" ? false : step.allowReject,
    due_in_hours: step.dueInHours,
  }));

  const { error: stepsError } = await supabase.from("workflow_template_steps").insert(stepRows);
  if (stepsError) {
    await supabase.from("workflow_templates").delete().eq("id", template.id);
    throw new Error(stepsError.message);
  }
  return template;
}

export const createWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { name: string; description?: string; steps: WorkflowTemplateStepInput[] }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceAdmin(supabase, workspaceId, userId);
    const normalized = validateWorkflowTemplateInput(data);
    return insertTemplateRevision(supabase, {
      workspaceId,
      userId,
      name: normalized.name,
      description: normalized.description,
      version: 1,
      steps: normalized.steps,
    });
  });

export const reviseWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      templateId: string;
      expectedVersion: number;
      name: string;
      description?: string;
      steps: WorkflowTemplateStepInput[];
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceAdmin(supabase, workspaceId, userId);
    const normalized = validateWorkflowTemplateInput(data);

    const { data: previous, error: previousError } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("id", data.templateId)
      .eq("workspace_id", workspaceId)
      .single();
    if (previousError) throw new Error(previousError.message);
    if (previous.version !== data.expectedVersion) {
      throw new Error("This workflow template changed. Reload before saving another revision.");
    }

    const next = await insertTemplateRevision(supabase, {
      workspaceId,
      userId,
      name: normalized.name,
      description: normalized.description,
      version: previous.version + 1,
      steps: normalized.steps,
    });

    const { error: retireError } = await supabase
      .from("workflow_templates")
      .update({ is_active: false })
      .eq("id", previous.id)
      .eq("version", data.expectedVersion);
    if (retireError) {
      await supabase.from("workflow_templates").delete().eq("id", next.id);
      throw new Error(retireError.message);
    }
    return next;
  });

export const duplicateWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { templateId: string; name?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceAdmin(supabase, workspaceId, userId);
    const { data: source, error: sourceError } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("id", data.templateId)
      .eq("workspace_id", workspaceId)
      .single();
    if (sourceError) throw new Error(sourceError.message);
    const { data: sourceSteps, error: stepsError } = await supabase
      .from("workflow_template_steps")
      .select("*")
      .eq("template_id", source.id)
      .order("step_order");
    if (stepsError) throw new Error(stepsError.message);

    const steps: WorkflowTemplateStepInput[] = sourceSteps.map((step) => ({
      name: step.name,
      description: step.description ?? "",
      stepType: step.step_type as WorkflowTemplateStepInput["stepType"],
      assignmentMode: step.assignment_mode as WorkflowTemplateStepInput["assignmentMode"],
      assignedUserId: step.assigned_user_id,
      assignedWorkspaceRole: step.assigned_workspace_role,
      requiredDecisions: step.required_decisions,
      allowChanges: step.allow_changes,
      allowReject: step.allow_reject,
      dueInHours: step.due_in_hours,
    }));
    const normalized = validateWorkflowTemplateInput({
      name: data.name?.trim() || `${source.name} copy`,
      description: source.description ?? "",
      steps,
    });
    return insertTemplateRevision(supabase, {
      workspaceId,
      userId,
      name: normalized.name,
      description: normalized.description,
      version: 1,
      steps: normalized.steps,
    });
  });

export const setWorkflowTemplateActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { templateId: string; active: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceAdmin(supabase, workspaceId, userId);
    const { data: template, error } = await supabase
      .from("workflow_templates")
      .update({ is_active: data.active })
      .eq("id", data.templateId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return template;
  });

export const startDocumentWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; templateId: string; dueAt?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,workspace_id")
      .eq("id", data.documentId)
      .single();
    if (documentError) throw new Error(documentError.message);
    if (document.workspace_id !== workspaceId) throw new Error("Document is outside the active workspace");
    const { data: run, error } = await supabase.rpc("start_document_workflow", {
      p_document_id: data.documentId,
      p_template_id: data.templateId,
      p_due_at: data.dueAt ?? undefined,
    });
    if (error) throw new Error(error.message);
    return run;
  });

export const submitWorkflowDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { assignmentId: string; decision: WorkflowDecision; comment?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase.rpc("submit_workflow_decision", {
      p_assignment_id: data.assignmentId,
      p_decision: data.decision,
      p_comment: data.comment?.trim() || undefined,
    });
    if (error) throw new Error(error.message);
    return run;
  });

export const resubmitDocumentWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { runId: string; expectedDocumentEditorVersion: number; comment?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase.rpc("resubmit_document_workflow", {
      p_run_id: data.runId,
      p_expected_document_editor_version: data.expectedDocumentEditorVersion,
      p_comment: data.comment?.trim() || undefined,
    });
    if (error) throw new Error(error.message);
    return run;
  });

export const reassignWorkflowAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { assignmentId: string; newUserId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const reason = data.reason.trim();
    if (!reason) throw new Error("A reassignment reason is required");
    const { data: assignment, error } = await context.supabase.rpc(
      "reassign_workflow_assignment",
      {
        p_assignment_id: data.assignmentId,
        p_new_user_id: data.newUserId,
        p_reason: reason,
      },
    );
    if (error) throw new Error(error.message);
    return assignment;
  });

export const cancelDocumentWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string; reason: string }) => data)
  .handler(async ({ data, context }) => {
    const reason = data.reason.trim();
    if (!reason) throw new Error("A cancellation reason is required");
    const { data: run, error } = await context.supabase.rpc("cancel_document_workflow", {
      p_run_id: data.runId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return run;
  });

export const createWorkflowComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { runId: string; stepId?: string | null; parentId?: string | null; body: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Comment cannot be empty");
    if (body.length > 10000) throw new Error("Comment is too long");
    const { data: comment, error } = await context.supabase
      .from("workflow_comments")
      .insert({
        run_id: data.runId,
        step_id: data.stepId ?? null,
        parent_id: data.parentId ?? null,
        author_id: context.userId,
        body,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return comment;
  });

export const updateWorkflowComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { commentId: string; body: string }) => data)
  .handler(async ({ data, context }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Comment cannot be empty");
    const { data: comment, error } = await context.supabase.rpc("update_workflow_comment", {
      p_comment_id: data.commentId,
      p_body: body,
    });
    if (error) throw new Error(error.message);
    return comment;
  });

export const resolveWorkflowComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { commentId: string; resolved: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { data: comment, error } = await context.supabase.rpc("resolve_workflow_comment", {
      p_comment_id: data.commentId,
      p_resolved: data.resolved,
    });
    if (error) throw new Error(error.message);
    return comment;
  });

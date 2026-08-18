export type WorkflowStepType = "review" | "approval" | "acknowledgement";
export type WorkflowDecision = "approve" | "changes_requested" | "reject" | "acknowledge";
export type WorkflowAssignmentMode =
  | "user"
  | "workspace_role"
  | "document_creator"
  | "workflow_starter";
export type WorkflowParticipantRole = "reviewer" | "approver" | "acknowledger";
export type WorkflowRunStatus =
  | "in_progress"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled";
export type WorkflowQueueBucket = "overdue" | "due_soon" | "upcoming" | "no_deadline";

export interface WorkflowTemplateStepInput {
  name: string;
  description?: string;
  stepType: WorkflowStepType;
  assignmentMode: WorkflowAssignmentMode;
  assignedUserId?: string | null;
  assignedWorkspaceRole?: "owner" | "admin" | "member" | "viewer" | null;
  requiredDecisions: number;
  allowChanges: boolean;
  allowReject: boolean;
  dueInHours?: number | null;
}

export interface WorkflowQueueLike {
  due_at: string | null;
}

export function participantRoleForStep(stepType: WorkflowStepType): WorkflowParticipantRole {
  if (stepType === "review") return "reviewer";
  if (stepType === "approval") return "approver";
  return "acknowledger";
}

export function allowedWorkflowDecisions(input: {
  stepType: WorkflowStepType;
  allowChanges: boolean;
  allowReject: boolean;
}): WorkflowDecision[] {
  if (input.stepType === "acknowledgement") return ["acknowledge"];
  const decisions: WorkflowDecision[] = ["approve"];
  if (input.allowChanges) decisions.push("changes_requested");
  if (input.allowReject) decisions.push("reject");
  return decisions;
}

export function workflowDecisionLabel(decision: WorkflowDecision) {
  switch (decision) {
    case "approve":
      return "Approve";
    case "changes_requested":
      return "Request changes";
    case "reject":
      return "Reject";
    case "acknowledge":
      return "Acknowledge";
  }
}

export function workflowStatusLabel(status: string) {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "changes_requested":
      return "Changes requested";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "pending":
      return "Pending";
    case "active":
      return "Active";
    case "acknowledged":
      return "Acknowledged";
    case "skipped":
      return "Skipped";
    default:
      return status.replaceAll("_", " ");
  }
}

export function stepTypeLabel(stepType: string) {
  switch (stepType) {
    case "review":
      return "Review";
    case "approval":
      return "Approval";
    case "acknowledgement":
      return "Acknowledgement";
    default:
      return stepType;
  }
}

export function assignmentModeLabel(mode: string) {
  switch (mode) {
    case "user":
      return "Specific workspace member";
    case "workspace_role":
      return "Workspace role";
    case "document_creator":
      return "Document creator";
    case "workflow_starter":
      return "Workflow starter";
    default:
      return mode;
  }
}

export function classifyWorkflowQueueItem(
  item: WorkflowQueueLike,
  now = new Date(),
  dueSoonHours = 48,
): WorkflowQueueBucket {
  if (!item.due_at) return "no_deadline";
  const due = new Date(item.due_at).getTime();
  const current = now.getTime();
  if (due < current) return "overdue";
  if (due <= current + dueSoonHours * 60 * 60 * 1000) return "due_soon";
  return "upcoming";
}

export function queueBucketLabel(bucket: WorkflowQueueBucket) {
  switch (bucket) {
    case "overdue":
      return "Overdue";
    case "due_soon":
      return "Due soon";
    case "upcoming":
      return "Upcoming";
    case "no_deadline":
      return "No deadline";
  }
}

export function isTerminalWorkflowStatus(status: string) {
  return status === "approved" || status === "rejected" || status === "cancelled";
}

export function validateWorkflowTemplateStep(step: WorkflowTemplateStepInput) {
  const name = step.name.trim();
  if (!name) throw new Error("Every workflow step needs a name");
  if (name.length > 120) throw new Error("Workflow step names must be 120 characters or shorter");
  if (!Number.isInteger(step.requiredDecisions) || step.requiredDecisions < 1) {
    throw new Error("Required decisions must be a positive whole number");
  }
  if (
    step.dueInHours !== null &&
    step.dueInHours !== undefined &&
    (!Number.isInteger(step.dueInHours) || step.dueInHours < 1)
  ) {
    throw new Error("Step due time must be a positive number of hours");
  }
  if (step.assignmentMode === "user" && !step.assignedUserId) {
    throw new Error(`Choose a workspace member for “${name}”`);
  }
  if (step.assignmentMode === "workspace_role" && !step.assignedWorkspaceRole) {
    throw new Error(`Choose a workspace role for “${name}”`);
  }
  if (step.assignmentMode !== "user" && step.assignedUserId) {
    throw new Error(`“${name}” has an unexpected specific-user assignment`);
  }
  if (step.assignmentMode !== "workspace_role" && step.assignedWorkspaceRole) {
    throw new Error(`“${name}” has an unexpected workspace-role assignment`);
  }
  if (step.stepType === "acknowledgement" && (step.allowChanges || step.allowReject)) {
    throw new Error("Acknowledgement steps cannot request changes or reject");
  }
  return {
    ...step,
    name,
    description: step.description?.trim() || "",
    assignedUserId: step.assignmentMode === "user" ? step.assignedUserId! : null,
    assignedWorkspaceRole:
      step.assignmentMode === "workspace_role" ? step.assignedWorkspaceRole! : null,
    dueInHours: step.dueInHours ?? null,
  };
}

export function validateWorkflowTemplateInput(input: {
  name: string;
  description?: string;
  steps: WorkflowTemplateStepInput[];
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Workflow template name is required");
  if (name.length > 160)
    throw new Error("Workflow template names must be 160 characters or shorter");
  if (input.steps.length < 1) throw new Error("Add at least one workflow step");
  if (input.steps.length > 30) throw new Error("Workflow templates support up to 30 steps");
  return {
    name,
    description: input.description?.trim() || "",
    steps: input.steps.map(validateWorkflowTemplateStep),
  };
}

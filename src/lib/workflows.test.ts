import { describe, expect, test } from "bun:test";
import {
  allowedWorkflowDecisions,
  classifyWorkflowQueueItem,
  participantRoleForStep,
  validateWorkflowTemplateInput,
  workflowDecisionLabel,
} from "./workflows";

describe("OfficeKonnect workflow contract", () => {
  test("maps workflow step types to canonical participant roles", () => {
    expect(participantRoleForStep("review")).toBe("reviewer");
    expect(participantRoleForStep("approval")).toBe("approver");
    expect(participantRoleForStep("acknowledgement")).toBe("acknowledger");
  });

  test("exposes only state-machine-valid decisions", () => {
    expect(
      allowedWorkflowDecisions({ stepType: "review", allowChanges: true, allowReject: false }),
    ).toEqual(["approve", "changes_requested"]);
    expect(
      allowedWorkflowDecisions({ stepType: "approval", allowChanges: false, allowReject: true }),
    ).toEqual(["approve", "reject"]);
    expect(
      allowedWorkflowDecisions({
        stepType: "acknowledgement",
        allowChanges: false,
        allowReject: false,
      }),
    ).toEqual(["acknowledge"]);
    expect(workflowDecisionLabel("changes_requested")).toBe("Request changes");
  });

  test("classifies the work queue deterministically", () => {
    const now = new Date("2026-08-18T08:00:00.000Z");
    expect(classifyWorkflowQueueItem({ due_at: "2026-08-18T07:59:59.000Z" }, now)).toBe("overdue");
    expect(classifyWorkflowQueueItem({ due_at: "2026-08-19T08:00:00.000Z" }, now)).toBe("due_soon");
    expect(classifyWorkflowQueueItem({ due_at: "2026-08-23T08:00:00.000Z" }, now)).toBe("upcoming");
    expect(classifyWorkflowQueueItem({ due_at: null }, now)).toBe("no_deadline");
  });

  test("normalizes a valid multi-step workflow template", () => {
    const value = validateWorkflowTemplateInput({
      name: "Contract review",
      description: "  Review before approval  ",
      steps: [
        {
          name: "Legal review",
          stepType: "review",
          assignmentMode: "workspace_role",
          assignedWorkspaceRole: "admin",
          requiredDecisions: 1,
          allowChanges: true,
          allowReject: true,
          dueInHours: 24,
        },
        {
          name: "Final acknowledgement",
          stepType: "acknowledgement",
          assignmentMode: "document_creator",
          requiredDecisions: 1,
          allowChanges: false,
          allowReject: false,
        },
      ],
    });
    expect(value.name).toBe("Contract review");
    expect(value.description).toBe("Review before approval");
    expect(value.steps[0].assignedWorkspaceRole).toBe("admin");
    expect(value.steps[1].assignedWorkspaceRole).toBeNull();
  });

  test("rejects assignment-shape and acknowledgement-policy drift", () => {
    expect(() =>
      validateWorkflowTemplateInput({
        name: "Invalid",
        steps: [
          {
            name: "Missing reviewer",
            stepType: "review",
            assignmentMode: "user",
            requiredDecisions: 1,
            allowChanges: true,
            allowReject: true,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      validateWorkflowTemplateInput({
        name: "Invalid acknowledgement",
        steps: [
          {
            name: "Read it",
            stepType: "acknowledgement",
            assignmentMode: "workflow_starter",
            requiredDecisions: 1,
            allowChanges: true,
            allowReject: false,
          },
        ],
      }),
    ).toThrow();
  });
});

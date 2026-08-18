import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  FileCheck2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import {
  createWorkflowTemplate,
  duplicateWorkflowTemplate,
  reviseWorkflowTemplate,
  setWorkflowTemplateActive,
  startDocumentWorkflow,
} from "@/lib/workflows.functions";
import {
  assignmentModeLabel,
  stepTypeLabel,
  workflowStatusLabel,
  type WorkflowAssignmentMode,
  type WorkflowStepType,
  type WorkflowTemplateStepInput,
} from "@/lib/workflows";

export const Route = createFileRoute("/dashboard/workflows/")({ component: WorkflowsIndex });

type WorkflowTemplate = Tables<"workflow_templates">;
type WorkflowTemplateStep = Tables<"workflow_template_steps">;
type WorkflowRun = Tables<"workflow_runs">;
type DocumentRow = Tables<"documents">;
type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

type BuilderStep = WorkflowTemplateStepInput & { key: string };

function blankStep(index: number): BuilderStep {
  return {
    key: `step-${Date.now()}-${index}`,
    name: `Step ${index + 1}`,
    description: "",
    stepType: "review",
    assignmentMode: "workflow_starter",
    assignedUserId: null,
    assignedWorkspaceRole: null,
    requiredDecisions: 1,
    allowChanges: true,
    allowReject: true,
    dueInHours: null,
  };
}

function statusClasses(status: string) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "changes_requested") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "rejected" || status === "cancelled") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
}

function WorkflowsIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<"runs" | "templates">("runs");
  const [templateScope, setTemplateScope] = useState<"active" | "inactive">("active");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderSource, setBuilderSource] = useState<WorkflowTemplate | null>(null);
  const [builderName, setBuilderName] = useState("");
  const [builderDescription, setBuilderDescription] = useState("");
  const [builderSteps, setBuilderSteps] = useState<BuilderStep[]>([blankStep(0)]);
  const [startOpen, setStartOpen] = useState(false);
  const [startDocumentId, setStartDocumentId] = useState("");
  const [startTemplateId, setStartTemplateId] = useState("");
  const [startDueAt, setStartDueAt] = useState("");

  const createTemplateServerFn = useServerFn(createWorkflowTemplate);
  const reviseTemplateServerFn = useServerFn(reviseWorkflowTemplate);
  const duplicateTemplateServerFn = useServerFn(duplicateWorkflowTemplate);
  const setTemplateActiveServerFn = useServerFn(setWorkflowTemplateActive);
  const startWorkflowServerFn = useServerFn(startDocumentWorkflow);

  const { data: sessionContext, isLoading: contextLoading } = useQuery({
    queryKey: ["phase5-workflow-context"],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Authentication required");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .eq("id", authData.user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile.default_workspace_id) throw new Error("No active workspace is selected");
      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", profile.default_workspace_id)
        .eq("user_id", authData.user.id)
        .single();
      if (membershipError) throw membershipError;
      return {
        userId: authData.user.id,
        workspaceId: profile.default_workspace_id,
        role: membership.role as WorkspaceRole,
      };
    },
  });

  const isAdmin = sessionContext?.role === "owner" || sessionContext?.role === "admin";

  const { data: memberDirectory } = useQuery({
    queryKey: ["phase5-workflow-member-directory", sessionContext?.workspaceId],
    enabled: Boolean(sessionContext?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_member_directory", {
        p_workspace_id: sessionContext!.workspaceId,
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["workflow-templates", sessionContext?.workspaceId, templateScope],
    enabled: Boolean(sessionContext?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select("*")
        .eq("workspace_id", sessionContext!.workspaceId)
        .eq("is_active", templateScope === "active")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const templateIds = (templates ?? []).map((template) => template.id);
  const { data: templateSteps } = useQuery({
    queryKey: ["workflow-template-steps", templateIds.join(",")],
    enabled: templateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_template_steps")
        .select("*")
        .in("template_id", templateIds)
        .order("step_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["workflow-runs", sessionContext?.workspaceId],
    enabled: Boolean(sessionContext?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select("*")
        .eq("workspace_id", sessionContext!.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const runDocumentIds = Array.from(new Set((runs ?? []).map((run) => run.document_id)));
  const { data: runDocuments } = useQuery({
    queryKey: ["workflow-run-documents", runDocumentIds.join(",")],
    enabled: runDocumentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").in("id", runDocumentIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: eligibleDocuments } = useQuery({
    queryKey: ["workflow-start-documents", sessionContext?.workspaceId, startOpen],
    enabled: Boolean(sessionContext?.workspaceId && startOpen),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("workspace_id", sessionContext!.workspaceId)
        .not("document_status", "in", '("deleted","archived")')
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const activeTemplatesForStart = useQuery({
    queryKey: ["workflow-active-templates-start", sessionContext?.workspaceId, startOpen],
    enabled: Boolean(sessionContext?.workspaceId && startOpen),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select("*")
        .eq("workspace_id", sessionContext!.workspaceId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const stepsByTemplate = useMemo(() => {
    const map = new Map<string, WorkflowTemplateStep[]>();
    for (const step of templateSteps ?? []) {
      const list = map.get(step.template_id) ?? [];
      list.push(step);
      map.set(step.template_id, list);
    }
    return map;
  }, [templateSteps]);

  const documentsById = useMemo(
    () => new Map((runDocuments ?? []).map((document) => [document.id, document])),
    [runDocuments],
  );

  const refreshTemplates = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workflow-templates"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-template-steps"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-active-templates-start"] }),
    ]);
  };

  const refreshRuns = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-run-documents"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-work-queue"] }),
    ]);
  };

  const resetBuilder = () => {
    setBuilderSource(null);
    setBuilderName("");
    setBuilderDescription("");
    setBuilderSteps([blankStep(0)]);
  };

  const openNewBuilder = () => {
    resetBuilder();
    setBuilderOpen(true);
  };

  const openRevisionBuilder = (template: WorkflowTemplate) => {
    const sourceSteps = stepsByTemplate.get(template.id) ?? [];
    setBuilderSource(template);
    setBuilderName(template.name);
    setBuilderDescription(template.description ?? "");
    setBuilderSteps(
      sourceSteps.map((step, index) => ({
        key: `${step.id}-${index}`,
        name: step.name,
        description: step.description ?? "",
        stepType: step.step_type as WorkflowStepType,
        assignmentMode: step.assignment_mode as WorkflowAssignmentMode,
        assignedUserId: step.assigned_user_id,
        assignedWorkspaceRole: step.assigned_workspace_role,
        requiredDecisions: step.required_decisions,
        allowChanges: step.allow_changes,
        allowReject: step.allow_reject,
        dueInHours: step.due_in_hours,
      })),
    );
    setBuilderOpen(true);
  };

  const builderMutation = useMutation({
    mutationFn: async () => {
      const steps = builderSteps.map(({ key: _key, ...step }) => step);
      if (builderSource) {
        return reviseTemplateServerFn({
          data: {
            templateId: builderSource.id,
            expectedVersion: builderSource.version,
            name: builderName,
            description: builderDescription,
            steps,
          },
        });
      }
      return createTemplateServerFn({
        data: { name: builderName, description: builderDescription, steps },
      });
    },
    onSuccess: async () => {
      setBuilderOpen(false);
      resetBuilder();
      await refreshTemplates();
      toast.success(builderSource ? "Workflow revision created" : "Workflow template created");
    },
    onError: (error) => toastError(error, "Workflow template could not be saved"),
  });

  const startMutation = useMutation({
    mutationFn: () => {
      if (!startDocumentId || !startTemplateId) throw new Error("Choose a document and workflow template");
      return startWorkflowServerFn({
        data: {
          documentId: startDocumentId,
          templateId: startTemplateId,
          dueAt: startDueAt ? new Date(startDueAt).toISOString() : null,
        },
      });
    },
    onSuccess: async (run) => {
      setStartOpen(false);
      setStartDocumentId("");
      setStartTemplateId("");
      setStartDueAt("");
      await refreshRuns();
      toast.success("Workflow started with an immutable submission snapshot");
      await navigate({ to: "/dashboard/workflows/$runId", params: { runId: run.id } });
    },
    onError: (error) => toastError(error, "Workflow could not be started"),
  });

  const updateBuilderStep = (key: string, patch: Partial<BuilderStep>) => {
    setBuilderSteps((current) =>
      current.map((step) => {
        if (step.key !== key) return step;
        const next = { ...step, ...patch };
        if (patch.stepType === "acknowledgement") {
          next.allowChanges = false;
          next.allowReject = false;
        }
        if (patch.assignmentMode && patch.assignmentMode !== "user") next.assignedUserId = null;
        if (patch.assignmentMode && patch.assignmentMode !== "workspace_role") next.assignedWorkspaceRole = null;
        return next;
      }),
    );
  };

  const moveStep = (index: number, offset: -1 | 1) => {
    setBuilderSteps((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const copy = [...current];
      const [step] = copy.splice(index, 1);
      copy.splice(destination, 0, step!);
      return copy;
    });
  };

  const loading = contextLoading || (section === "templates" ? templatesLoading : runsLoading);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Workflow className="h-4 w-4" />
            Office operations
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Route immutable document submissions through review, approval and acknowledgement steps without bypassing the server-authoritative workflow state machine.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={openNewBuilder}>
              <Settings2 className="mr-2 h-4 w-4" />
              New template
            </Button>
          )}
          <Button onClick={() => setStartOpen(true)}>
            <Play className="mr-2 h-4 w-4" />
            Start workflow
          </Button>
        </div>
      </div>

      <div className="flex w-fit rounded-lg bg-muted p-1">
        <Button variant={section === "runs" ? "secondary" : "ghost"} size="sm" onClick={() => setSection("runs")}>
          Workflow runs
        </Button>
        <Button variant={section === "templates" ? "secondary" : "ghost"} size="sm" onClick={() => setSection("templates")}>
          Templates
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : section === "runs" ? (
        (runs ?? []).length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-center">
            <FileCheck2 className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">No workflow runs yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Start a workflow to create an immutable submission version and assign the first review or approval step.
            </p>
            <Button className="mt-5" onClick={() => setStartOpen(true)}>
              <Play className="mr-2 h-4 w-4" />
              Start workflow
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(runs ?? []).map((run: WorkflowRun) => {
              const document = documentsById.get(run.document_id);
              return (
                <button
                  key={run.id}
                  type="button"
                  className="rounded-xl border bg-background p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  onClick={() => void navigate({ to: "/dashboard/workflows/$runId", params: { runId: run.id } })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{run.title}</p>
                      <h2 className="mt-1 truncate font-semibold">{document?.title ?? "Document"}</h2>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses(run.status)}`}>
                      {workflowStatusLabel(run.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
                    <div><span className="block font-medium text-foreground">Revision</span>{run.workflow_revision}</div>
                    <div><span className="block font-medium text-foreground">Current step</span>{run.current_step_order}</div>
                    <div><span className="block font-medium text-foreground">Started</span>{formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</div>
                    <div><span className="block font-medium text-foreground">Due</span>{run.due_at ? format(new Date(run.due_at), "d MMM yyyy") : "No deadline"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-lg bg-muted p-1">
              <Button variant={templateScope === "active" ? "secondary" : "ghost"} size="sm" onClick={() => setTemplateScope("active")}>Active</Button>
              <Button variant={templateScope === "inactive" ? "secondary" : "ghost"} size="sm" onClick={() => setTemplateScope("inactive")}>Inactive</Button>
            </div>
            {!isAdmin && <p className="text-xs text-muted-foreground">Template editing is restricted to workspace administrators.</p>}
          </div>
          {(templates ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <Workflow className="mx-auto h-9 w-9 text-muted-foreground" />
              <p className="mt-3 font-medium">{templateScope === "active" ? "No active workflow templates" : "No inactive workflow templates"}</p>
              {isAdmin && templateScope === "active" && <Button className="mt-4" onClick={openNewBuilder}><Plus className="mr-2 h-4 w-4" />Create template</Button>}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {(templates ?? []).map((template) => {
                const steps = stepsByTemplate.get(template.id) ?? [];
                return (
                  <Card key={template.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{template.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Version {template.version} · {steps.length} {steps.length === 1 ? "step" : "steps"}</p>
                        </div>
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {template.is_active && <DropdownMenuItem onClick={() => openRevisionBuilder(template)}><Pencil className="mr-2 h-4 w-4" />Create revision</DropdownMenuItem>}
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  await duplicateTemplateServerFn({ data: { templateId: template.id } });
                                  await refreshTemplates();
                                  toast.success("Workflow template duplicated");
                                } catch (error) { toastError(error, "Duplicate failed"); }
                              }}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  await setTemplateActiveServerFn({ data: { templateId: template.id, active: !template.is_active } });
                                  await refreshTemplates();
                                  toast.success(template.is_active ? "Template retired" : "Template restored");
                                } catch (error) { toastError(error, "Template status update failed"); }
                              }}>
                                {template.is_active ? <Archive className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                                {template.is_active ? "Retire" : "Restore"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {template.description && <p className="mt-3 text-sm text-muted-foreground">{template.description}</p>}
                      <div className="mt-4 space-y-2">
                        {steps.map((step) => (
                          <div key={step.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">{step.step_order}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{step.name}</p>
                              <p className="truncate text-muted-foreground">{stepTypeLabel(step.step_type)} · {assignmentModeLabel(step.assignment_mode)} · {step.required_decisions} required</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={builderOpen} onOpenChange={(open) => { setBuilderOpen(open); if (!open) resetBuilder(); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{builderSource ? `Create revision ${builderSource.version + 1}` : "New workflow template"}</DialogTitle>
            <DialogDescription>
              Ordered steps are copied into every workflow run. Revising a template never mutates workflows already in progress.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="workflow-name">Template name</Label><Input id="workflow-name" value={builderName} onChange={(event) => setBuilderName(event.target.value)} placeholder="Contract review and approval" /></div>
            <div className="space-y-2"><Label htmlFor="workflow-description">Description</Label><Input id="workflow-description" value={builderDescription} onChange={(event) => setBuilderDescription(event.target.value)} placeholder="Optional purpose or policy note" /></div>
          </div>
          <div className="space-y-4">
            {builderSteps.map((step, index) => (
              <div key={step.key} className="rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Step {index + 1}</span>
                  <div className="ml-auto flex gap-1">
                    <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={index === builderSteps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={builderSteps.length === 1} onClick={() => setBuilderSteps((current) => current.filter((item) => item.key !== step.key))}><X className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5 md:col-span-2"><Label>Name</Label><Input value={step.name} onChange={(event) => updateBuilderStep(step.key, { name: event.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Step type</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={step.stepType} onChange={(event) => updateBuilderStep(step.key, { stepType: event.target.value as WorkflowStepType })}><option value="review">Review</option><option value="approval">Approval</option><option value="acknowledgement">Acknowledgement</option></select></div>
                  <div className="space-y-1.5"><Label>Assignment</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={step.assignmentMode} onChange={(event) => updateBuilderStep(step.key, { assignmentMode: event.target.value as WorkflowAssignmentMode })}><option value="user">Specific member</option><option value="workspace_role">Workspace role</option><option value="document_creator">Document creator</option><option value="workflow_starter">Workflow starter</option></select></div>
                  <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Input value={step.description ?? ""} onChange={(event) => updateBuilderStep(step.key, { description: event.target.value })} placeholder="What should this participant check?" /></div>
                  {step.assignmentMode === "user" && <div className="space-y-1.5"><Label>Workspace member</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={step.assignedUserId ?? ""} onChange={(event) => updateBuilderStep(step.key, { assignedUserId: event.target.value || null })}><option value="">Choose member</option>{(memberDirectory ?? []).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email} ({member.role})</option>)}</select></div>}
                  {step.assignmentMode === "workspace_role" && <div className="space-y-1.5"><Label>Workspace role</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={step.assignedWorkspaceRole ?? ""} onChange={(event) => updateBuilderStep(step.key, { assignedWorkspaceRole: event.target.value as WorkspaceRole })}><option value="">Choose role</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select></div>}
                  <div className="space-y-1.5"><Label>Required decisions</Label><Input type="number" min={1} max={50} value={step.requiredDecisions} onChange={(event) => updateBuilderStep(step.key, { requiredDecisions: Number(event.target.value) || 1 })} /></div>
                  <div className="space-y-1.5"><Label>Due after (hours)</Label><Input type="number" min={1} value={step.dueInHours ?? ""} onChange={(event) => updateBuilderStep(step.key, { dueInHours: event.target.value ? Number(event.target.value) : null })} placeholder="No step deadline" /></div>
                </div>
                {step.stepType !== "acknowledgement" && <div className="mt-4 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={step.allowChanges} onChange={(event) => updateBuilderStep(step.key, { allowChanges: event.target.checked })} />Allow request changes</label><label className="flex items-center gap-2"><input type="checkbox" checked={step.allowReject} onChange={(event) => updateBuilderStep(step.key, { allowReject: event.target.checked })} />Allow rejection</label></div>}
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setBuilderSteps((current) => [...current, blankStep(current.length)])}><Plus className="mr-2 h-4 w-4" />Add step</Button>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancel</Button><Button onClick={() => builderMutation.mutate()} disabled={builderMutation.isPending}>{builderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{builderSource ? "Create revision" : "Create template"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Start document workflow</DialogTitle><DialogDescription>OfficeKonnect will create an immutable version before assigning the first step. The working document remains separate.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Document or spreadsheet</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={startDocumentId} onChange={(event) => setStartDocumentId(event.target.value)}><option value="">Choose document</option>{(eligibleDocuments ?? []).map((document: DocumentRow) => <option key={document.id} value={document.id}>{document.title} · {document.document_kind}</option>)}</select></div>
            <div className="space-y-2"><Label>Workflow template</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={startTemplateId} onChange={(event) => setStartTemplateId(event.target.value)}><option value="">Choose active template</option>{(activeTemplatesForStart.data ?? []).map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select></div>
            <div className="space-y-2"><Label>Overall due date</Label><Input type="datetime-local" value={startDueAt} onChange={(event) => setStartDueAt(event.target.value)} /><p className="text-xs text-muted-foreground">Optional. Individual step deadlines still come from the workflow template.</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button><Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !startDocumentId || !startTemplateId}>{startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Start workflow</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

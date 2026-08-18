import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileEdit,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { WorkflowSnapshot } from "@/components/workflow/workflow-snapshot";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import {
  allowedWorkflowDecisions,
  isTerminalWorkflowStatus,
  stepTypeLabel,
  workflowDecisionLabel,
  workflowStatusLabel,
  type WorkflowDecision,
  type WorkflowStepType,
} from "@/lib/workflows";
import {
  cancelDocumentWorkflow,
  createWorkflowComment,
  reassignWorkflowAssignment,
  resolveWorkflowComment,
  resubmitDocumentWorkflow,
  submitWorkflowDecision,
  updateWorkflowComment,
} from "@/lib/workflows.functions";

export const Route = createFileRoute("/dashboard/workflows/$runId")({ component: WorkflowReview });

type WorkflowStep = Tables<"workflow_steps">;
type WorkflowAssignment = Tables<"workflow_step_assignees">;
type WorkflowComment = Tables<"workflow_comments">;
type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

function statusClasses(status: string) {
  if (status === "approved" || status === "acknowledged") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "changes_requested") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "rejected" || status === "cancelled") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (status === "active") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return "bg-muted text-muted-foreground";
}

function WorkflowReview() {
  const { runId } = Route.useParams();
  const queryClient = useQueryClient();
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decision, setDecision] = useState<WorkflowDecision | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentStepId, setCommentStepId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState<WorkflowComment | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [reassignTarget, setReassignTarget] = useState<WorkflowAssignment | null>(null);
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitComment, setResubmitComment] = useState("");

  const decisionServerFn = useServerFn(submitWorkflowDecision);
  const commentServerFn = useServerFn(createWorkflowComment);
  const updateCommentServerFn = useServerFn(updateWorkflowComment);
  const resolveCommentServerFn = useServerFn(resolveWorkflowComment);
  const reassignServerFn = useServerFn(reassignWorkflowAssignment);
  const cancelServerFn = useServerFn(cancelDocumentWorkflow);
  const resubmitServerFn = useServerFn(resubmitDocumentWorkflow);

  const { data: run, isLoading: runLoading, error: runError } = useQuery({
    queryKey: ["workflow-run", runId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_runs").select("*").eq("id", runId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: authContext } = useQuery({
    queryKey: ["workflow-review-auth-context", run?.workspace_id],
    enabled: Boolean(run?.workspace_id),
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Authentication required");
      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", run!.workspace_id)
        .eq("user_id", authData.user.id)
        .single();
      if (membershipError) throw membershipError;
      return { userId: authData.user.id, role: membership.role as WorkspaceRole };
    },
  });

  const { data: document } = useQuery({
    queryKey: ["workflow-review-document", run?.document_id],
    enabled: Boolean(run?.document_id),
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("id", run!.document_id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: version } = useQuery({
    queryKey: ["workflow-review-version", run?.document_version_id],
    enabled: Boolean(run?.document_version_id),
    queryFn: async () => {
      const { data, error } = await supabase.from("document_versions").select("*").eq("id", run!.document_version_id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: steps } = useQuery({
    queryKey: ["workflow-review-steps", runId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_steps").select("*").eq("run_id", runId).order("step_order");
      if (error) throw error;
      return data;
    },
  });

  const stepIds = (steps ?? []).map((step) => step.id);
  const { data: assignments } = useQuery({
    queryKey: ["workflow-review-assignments", runId, stepIds.join(",")],
    enabled: stepIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_step_assignees").select("*").in("step_id", stepIds).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: decisions } = useQuery({
    queryKey: ["workflow-review-decisions", runId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_decisions").select("*").eq("run_id", runId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["workflow-review-comments", runId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_comments").select("*").eq("run_id", runId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: events } = useQuery({
    queryKey: ["workflow-review-events", runId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_events").select("*").eq("run_id", runId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: memberDirectory } = useQuery({
    queryKey: ["workflow-review-members", run?.workspace_id],
    enabled: Boolean(run?.workspace_id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_member_directory", { p_workspace_id: run!.workspace_id });
      if (error) throw error;
      return data;
    },
  });

  const membersById = useMemo(() => new Map((memberDirectory ?? []).map((member) => [member.user_id, member])), [memberDirectory]);
  const stepsById = useMemo(() => new Map((steps ?? []).map((step) => [step.id, step])), [steps]);
  const assignmentsByStep = useMemo(() => {
    const map = new Map<string, WorkflowAssignment[]>();
    for (const assignment of assignments ?? []) {
      const list = map.get(assignment.step_id) ?? [];
      list.push(assignment);
      map.set(assignment.step_id, list);
    }
    return map;
  }, [assignments]);

  const activeStep = (steps ?? []).find((step) => step.status === "active") ?? null;
  const myAssignment = (assignments ?? []).find(
    (assignment) => assignment.user_id === authContext?.userId && assignment.step_id === activeStep?.id && assignment.status === "pending",
  ) ?? null;
  const allowedDecisions = activeStep
    ? allowedWorkflowDecisions({
        stepType: activeStep.step_type as WorkflowStepType,
        allowChanges: activeStep.allow_changes,
        allowReject: activeStep.allow_reject,
      })
    : [];
  const isAdmin = authContext?.role === "owner" || authContext?.role === "admin";
  const canResubmit = Boolean(
    run?.status === "changes_requested" &&
      authContext &&
      document &&
      (isAdmin || run.started_by === authContext.userId || document.created_by === authContext.userId),
  );
  const canCancel = Boolean(
    run && !isTerminalWorkflowStatus(run.status) && authContext && (isAdmin || run.started_by === authContext.userId),
  );

  const invalidateReview = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workflow-run", runId] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-document"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-version"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-steps", runId] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-decisions", runId] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-comments", runId] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-review-events", runId] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-work-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
    ]);
  };

  const decisionMutation = useMutation({
    mutationFn: () => {
      if (!myAssignment || !decision) throw new Error("No active assignment is awaiting your decision");
      if ((decision === "changes_requested" || decision === "reject") && !decisionComment.trim()) {
        throw new Error("Add a reason for this decision");
      }
      return decisionServerFn({ data: { assignmentId: myAssignment.id, decision, comment: decisionComment } });
    },
    onSuccess: async () => {
      setDecisionOpen(false);
      setDecision(null);
      setDecisionComment("");
      await invalidateReview();
      toast.success("Workflow decision recorded");
    },
    onError: (error) => toastError(error, "Decision could not be recorded"),
  });

  const commentMutation = useMutation({
    mutationFn: () => commentServerFn({ data: { runId, stepId: commentStepId, body: newComment } }),
    onSuccess: async () => {
      setNewComment("");
      await invalidateReview();
      toast.success("Comment added");
    },
    onError: (error) => toastError(error, "Comment could not be added"),
  });

  const editCommentMutation = useMutation({
    mutationFn: () => {
      if (!editComment) throw new Error("No comment selected");
      return updateCommentServerFn({ data: { commentId: editComment.id, body: editCommentBody } });
    },
    onSuccess: async () => {
      setEditComment(null);
      setEditCommentBody("");
      await invalidateReview();
      toast.success("Comment updated");
    },
    onError: (error) => toastError(error, "Comment could not be updated"),
  });

  const reassignMutation = useMutation({
    mutationFn: () => {
      if (!reassignTarget || !reassignUserId) throw new Error("Choose a new assignee");
      return reassignServerFn({ data: { assignmentId: reassignTarget.id, newUserId: reassignUserId, reason: reassignReason } });
    },
    onSuccess: async () => {
      setReassignTarget(null);
      setReassignUserId("");
      setReassignReason("");
      await invalidateReview();
      toast.success("Workflow assignment reassigned");
    },
    onError: (error) => toastError(error, "Assignment could not be reassigned"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelServerFn({ data: { runId, reason: cancelReason } }),
    onSuccess: async () => {
      setCancelOpen(false);
      setCancelReason("");
      await invalidateReview();
      toast.success("Workflow cancelled");
    },
    onError: (error) => toastError(error, "Workflow could not be cancelled"),
  });

  const resubmitMutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error("Working document is unavailable");
      return resubmitServerFn({ data: { runId, expectedDocumentEditorVersion: document.editor_version, comment: resubmitComment } });
    },
    onSuccess: async () => {
      setResubmitOpen(false);
      setResubmitComment("");
      await invalidateReview();
      toast.success("Updated document resubmitted as a new immutable workflow revision");
    },
    onError: (error) => toastError(error, "Workflow could not be resubmitted"),
  });

  if (runLoading) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  if (runError || !run) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{runError instanceof Error ? runError.message : "Workflow could not be loaded."}</div>;
  }

  const workingDocumentRoute = document?.document_kind === "spreadsheet"
    ? ({ to: "/dashboard/sheets/$documentId", params: { documentId: document.id } } as const)
    : document
      ? ({ to: "/dashboard/documents/$documentId", params: { documentId: document.id } } as const)
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2"><Link to="/dashboard/workflows"><ArrowLeft className="mr-2 h-4 w-4" />Workflows</Link></Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{document?.title ?? run.title}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(run.status)}`}>{workflowStatusLabel(run.status)}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{run.title} · Workflow revision {run.workflow_revision} · submitted {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workingDocumentRoute && <Button variant="outline" asChild><Link {...workingDocumentRoute}><FileEdit className="mr-2 h-4 w-4" />Open working document</Link></Button>}
          {canResubmit && <Button onClick={() => setResubmitOpen(true)}><RefreshCcw className="mr-2 h-4 w-4" />Resubmit changes</Button>}
          {canCancel && <Button variant="outline" onClick={() => setCancelOpen(true)}><XCircle className="mr-2 h-4 w-4" />Cancel workflow</Button>}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Workflow steps</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(steps ?? []).map((step: WorkflowStep) => (
                <div key={step.id} className={`rounded-lg border p-3 ${step.status === "active" ? "border-blue-300 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20" : ""}`}>
                  <div className="flex items-start gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">{step.step_order}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{step.name}</p><p className="text-[11px] text-muted-foreground">{stepTypeLabel(step.step_type)}</p></div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses(step.status)}`}>{workflowStatusLabel(step.status)}</span>
                  </div>
                  {step.due_at && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />Due {format(new Date(step.due_at), "d MMM, HH:mm")}</p>}
                  <div className="mt-2 space-y-1.5">
                    {(assignmentsByStep.get(step.id) ?? []).map((assignment) => {
                      const member = membersById.get(assignment.user_id);
                      return (
                        <div key={assignment.id} className="flex items-center gap-2 text-[11px]">
                          <CircleDot className="h-3 w-3 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{member?.full_name || member?.email || assignment.user_id.slice(0, 8)}</span>
                          <span className="text-muted-foreground">{workflowStatusLabel(assignment.status)}</span>
                          {isAdmin && assignment.status === "pending" && !isTerminalWorkflowStatus(run.status) && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setReassignTarget(assignment); setReassignUserId(assignment.user_id); }}><UserRoundCog className="h-3 w-3" /></Button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 text-xs">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Overall due</span><span>{run.due_at ? format(new Date(run.due_at), "d MMM yyyy, HH:mm") : "No deadline"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Submitted editor version</span><span>{run.document_editor_version_at_submission}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Document version</span><span>{version?.version_number ?? "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Template version</span><span>{run.template_version ?? "—"}</span></div>
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0 space-y-4">
          {version && document ? (
            <WorkflowSnapshot
              documentKind={document.document_kind}
              fileType={document.file_type}
              content={version.content}
              storagePath={version.storage_path}
              versionNumber={version.version_number}
              title={document.title}
            />
          ) : (
            <div className="h-[520px] animate-pulse rounded-xl bg-muted" />
          )}
        </main>

        <aside className="space-y-4">
          {myAssignment && activeStep && run.status === "in_progress" && (
            <Card className="border-blue-200 dark:border-blue-900">
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Your decision</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">You are the active {myAssignment.participant_role} for “{activeStep.name}”. Your decision is recorded against workflow revision {run.workflow_revision}.</p>
                <div className="grid gap-2 pt-2">
                  {allowedDecisions.map((item) => (
                    <Button key={item} variant={item === "reject" ? "outline" : item === "changes_requested" ? "outline" : "default"} onClick={() => { setDecision(item); setDecisionOpen(true); }}>
                      {item === "approve" || item === "acknowledge" ? <Check className="mr-2 h-4 w-4" /> : item === "changes_requested" ? <RotateCcw className="mr-2 h-4 w-4" /> : <XCircle className="mr-2 h-4 w-4" />}
                      {workflowDecisionLabel(item)}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {run.status === "changes_requested" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <p className="font-medium">Changes requested</p>
              <p className="mt-1 text-xs">Edit the working document, then resubmit. The current review snapshot remains immutable until the resubmission RPC creates the next document version and workflow revision.</p>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4" />Review comments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <select className="h-9 w-full rounded-md border bg-background px-3 text-xs" value={commentStepId ?? ""} onChange={(event) => setCommentStepId(event.target.value || null)}>
                  <option value="">Whole workflow</option>
                  {(steps ?? []).map((step) => <option key={step.id} value={step.id}>Step {step.step_order}: {step.name}</option>)}
                </select>
                <Textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Add a review comment…" rows={3} />
                <Button size="sm" onClick={() => commentMutation.mutate()} disabled={!newComment.trim() || commentMutation.isPending}>{commentMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Add comment</Button>
              </div>
              <div className="space-y-3 border-t pt-4">
                {(comments ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No review comments yet.</p> : (comments ?? []).map((comment) => {
                  const author = membersById.get(comment.author_id);
                  const step = comment.step_id ? stepsById.get(comment.step_id) : null;
                  const canEdit = comment.author_id === authContext?.userId || isAdmin;
                  return (
                    <div key={comment.id} className={`rounded-lg border p-3 text-xs ${comment.is_resolved ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate font-medium">{author?.full_name || author?.email || "Workflow participant"}</p><p className="text-[10px] text-muted-foreground">{step ? `Step ${step.step_order} · ` : ""}{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</p></div>{canEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditComment(comment); setEditCommentBody(comment.body); }}><Pencil className="h-3 w-3" /></Button>}</div>
                      <p className="mt-2 whitespace-pre-wrap leading-5">{comment.body}</p>
                      <Button variant="ghost" size="sm" className="mt-1 h-7 px-1 text-[11px]" onClick={async () => { try { await resolveCommentServerFn({ data: { commentId: comment.id, resolved: !comment.is_resolved } }); await invalidateReview(); } catch (error) { toastError(error, "Comment status could not be changed"); } }}>{comment.is_resolved ? <RotateCcw className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}{comment.is_resolved ? "Reopen" : "Resolve"}</Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" />Activity & decisions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(events ?? []).slice(0, 12).map((event) => {
                const actor = event.actor_id ? membersById.get(event.actor_id) : null;
                return <div key={event.id} className="border-l-2 pl-3 text-xs"><p className="font-medium">{event.event_type.replaceAll("workflow.", "").replaceAll("_", " ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{actor?.full_name || actor?.email || "System"} · {format(new Date(event.created_at), "d MMM, HH:mm")}</p></div>;
              })}
              {(events ?? []).length === 0 && <p className="text-xs text-muted-foreground">No workflow events yet.</p>}
              {(decisions ?? []).length > 0 && <div className="border-t pt-3 text-[10px] text-muted-foreground">{decisions!.length} immutable decision record{decisions!.length === 1 ? "" : "s"} across workflow revisions.</div>}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{decision ? workflowDecisionLabel(decision) : "Workflow decision"}</DialogTitle><DialogDescription>This action is committed by the workflow RPC and cannot be rewritten as a client-side status change.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Decision note {decision === "changes_requested" || decision === "reject" ? "(required)" : "(optional)"}</Label><Textarea rows={4} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} placeholder={decision === "changes_requested" ? "Describe the changes required…" : decision === "reject" ? "Explain why this submission is rejected…" : "Add context for the audit trail…"} /></div><DialogFooter><Button variant="outline" onClick={() => setDecisionOpen(false)}>Cancel</Button><Button onClick={() => decisionMutation.mutate()} disabled={decisionMutation.isPending}>{decisionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm decision</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(editComment)} onOpenChange={(open) => { if (!open) setEditComment(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Edit review comment</DialogTitle><DialogDescription>Only the author or a workspace administrator may update a workflow comment.</DialogDescription></DialogHeader><Textarea rows={5} value={editCommentBody} onChange={(event) => setEditCommentBody(event.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setEditComment(null)}>Cancel</Button><Button onClick={() => editCommentMutation.mutate()} disabled={editCommentMutation.isPending || !editCommentBody.trim()}>Save comment</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(reassignTarget)} onOpenChange={(open) => { if (!open) setReassignTarget(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Reassign workflow task</DialogTitle><DialogDescription>Reassignment is handled by the existing workflow RPC and recorded in the workflow event trail.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>New assignee</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reassignUserId} onChange={(event) => setReassignUserId(event.target.value)}>{(memberDirectory ?? []).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email} ({member.role})</option>)}</select></div><div className="space-y-2"><Label>Reason</Label><Textarea rows={3} value={reassignReason} onChange={(event) => setReassignReason(event.target.value)} placeholder="Why is this assignment changing?" /></div></div><DialogFooter><Button variant="outline" onClick={() => setReassignTarget(null)}>Cancel</Button><Button onClick={() => reassignMutation.mutate()} disabled={reassignMutation.isPending || !reassignUserId || !reassignReason.trim()}>Reassign</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Cancel workflow</DialogTitle><DialogDescription>Cancellation is terminal for this workflow run and is retained in the audit history.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Cancellation reason</Label><Textarea rows={4} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setCancelOpen(false)}>Keep workflow</Button><Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending || !cancelReason.trim()}>Cancel workflow</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Resubmit current working document</DialogTitle><DialogDescription>The backend will snapshot the current editor version into a new immutable document version, increment the workflow revision and reopen the review sequence.</DialogDescription></DialogHeader><div className="space-y-3"><div className="rounded-lg border bg-muted/30 p-3 text-xs"><p className="font-medium">Working editor version: {document?.editor_version ?? "—"}</p><p className="mt-1 text-muted-foreground">Current submitted workflow revision: {run.workflow_revision}</p></div><div className="space-y-2"><Label>Resubmission note</Label><Textarea rows={4} value={resubmitComment} onChange={(event) => setResubmitComment(event.target.value)} placeholder="Summarise what changed…" /></div></div><DialogFooter><Button variant="outline" onClick={() => setResubmitOpen(false)}>Cancel</Button><Button onClick={() => resubmitMutation.mutate()} disabled={resubmitMutation.isPending}>{resubmitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create new revision</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

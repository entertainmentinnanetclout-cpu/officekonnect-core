import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Views } from "@/integrations/supabase/types";
import {
  classifyWorkflowQueueItem,
  queueBucketLabel,
  stepTypeLabel,
  workflowStatusLabel,
  type WorkflowQueueBucket,
} from "@/lib/workflows";

export const Route = createFileRoute("/dashboard/approvals/")({ component: ApprovalsIndex });

type QueueRow = Views<"workflow_work_queue">;
type DecisionRow = Tables<"workflow_decisions">;

const bucketOrder: WorkflowQueueBucket[] = ["overdue", "due_soon", "upcoming", "no_deadline"];

function bucketIcon(bucket: WorkflowQueueBucket) {
  if (bucket === "overdue") return AlertTriangle;
  if (bucket === "due_soon") return CalendarClock;
  if (bucket === "upcoming") return Clock3;
  return CircleDashed;
}

function ApprovalsIndex() {
  const navigate = useNavigate();
  const { data: context, isLoading: contextLoading } = useQuery({
    queryKey: ["approvals-context"],
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
      return { userId: authData.user.id, workspaceId: profile.default_workspace_id };
    },
  });

  const { data: queue, isLoading: queueLoading, error: queueError } = useQuery({
    queryKey: ["workflow-work-queue", context?.workspaceId],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_work_queue")
        .select("*")
        .eq("workspace_id", context!.workspaceId)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: recentDecisions } = useQuery({
    queryKey: ["workflow-recent-decisions", context?.userId],
    enabled: Boolean(context?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_decisions")
        .select("*")
        .eq("actor_id", context!.userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const recentRunIds = Array.from(new Set((recentDecisions ?? []).map((decision) => decision.run_id)));
  const recentStepIds = Array.from(new Set((recentDecisions ?? []).map((decision) => decision.step_id)));
  const { data: recentRuns } = useQuery({
    queryKey: ["approval-recent-runs", recentRunIds.join(",")],
    enabled: recentRunIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_runs").select("*").in("id", recentRunIds);
      if (error) throw error;
      return data;
    },
  });
  const recentDocumentIds = Array.from(new Set((recentRuns ?? []).map((run) => run.document_id)));
  const { data: recentDocuments } = useQuery({
    queryKey: ["approval-recent-documents", recentDocumentIds.join(",")],
    enabled: recentDocumentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("id,title,document_kind").in("id", recentDocumentIds);
      if (error) throw error;
      return data;
    },
  });
  const { data: recentSteps } = useQuery({
    queryKey: ["approval-recent-steps", recentStepIds.join(",")],
    enabled: recentStepIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_steps").select("*").in("id", recentStepIds);
      if (error) throw error;
      return data;
    },
  });

  const grouped = useMemo(() => {
    const result = new Map<WorkflowQueueBucket, QueueRow[]>();
    for (const bucket of bucketOrder) result.set(bucket, []);
    for (const item of queue ?? []) {
      const bucket = classifyWorkflowQueueItem(item);
      result.get(bucket)!.push(item);
    }
    return result;
  }, [queue]);

  const runsById = useMemo(() => new Map((recentRuns ?? []).map((run) => [run.id, run])), [recentRuns]);
  const docsById = useMemo(() => new Map((recentDocuments ?? []).map((document) => [document.id, document])), [recentDocuments]);
  const stepsById = useMemo(() => new Map((recentSteps ?? []).map((step) => [step.id, step])), [recentSteps]);
  const loading = contextLoading || queueLoading;

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ClipboardCheck className="h-4 w-4" />
          My assigned work
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Your active review, approval and acknowledgement assignments. The work queue is already scoped by Supabase to the authenticated user and active workflow step.
        </p>
      </div>

      {queueError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {queueError instanceof Error ? queueError.message : "Approval queue could not be loaded."}
        </div>
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-40 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (queue ?? []).length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Your workflow queue is clear</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            New assignments appear here only when their workflow step becomes active. Future or completed steps are not represented as pending work.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {bucketOrder.map((bucket) => {
            const items = grouped.get(bucket) ?? [];
            if (items.length === 0) return null;
            const Icon = bucketIcon(bucket);
            return (
              <section key={bucket} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${bucket === "overdue" ? "text-red-600" : bucket === "due_soon" ? "text-amber-600" : "text-muted-foreground"}`} />
                  <h2 className="text-sm font-semibold">{queueBucketLabel(bucket)}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {items.map((item) => (
                    <button
                      key={item.assignment_id}
                      type="button"
                      className="rounded-xl border bg-background p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                      onClick={() => item.run_id && void navigate({ to: "/dashboard/workflows/$runId", params: { runId: item.run_id } })}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.document_title ?? "Document"}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.workflow_title} · revision {item.workflow_revision}</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{item.participant_role}</span>
                      </div>
                      <div className="mt-4 rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-medium">Step {item.step_order}: {item.step_name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{stepTypeLabel(item.step_type ?? "review")} · immutable submission review</p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>Started {item.started_at ? formatDistanceToNow(new Date(item.started_at), { addSuffix: true }) : "—"}</span>
                        <span className={bucket === "overdue" ? "font-medium text-red-600" : bucket === "due_soon" ? "font-medium text-amber-600" : ""}>
                          {item.due_at ? `Due ${format(new Date(item.due_at), "d MMM, HH:mm")}` : "No deadline"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="space-y-3 border-t pt-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold">Recently completed by you</h2>
        </div>
        {(recentDecisions ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No workflow decisions have been recorded by this account yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {(recentDecisions ?? []).map((decision: DecisionRow) => {
              const run = runsById.get(decision.run_id);
              const step = stepsById.get(decision.step_id);
              const document = run ? docsById.get(run.document_id) : null;
              return (
                <button
                  key={decision.id}
                  type="button"
                  className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/40"
                  onClick={() => void navigate({ to: "/dashboard/workflows/$runId", params: { runId: decision.run_id } })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-medium">{document?.title ?? run?.title ?? "Workflow"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{step?.name ?? "Workflow step"} · revision {decision.workflow_revision}</p></div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{workflowStatusLabel(decision.decision === "approve" ? "approved" : decision.decision === "acknowledge" ? "acknowledged" : decision.decision)}</span>
                  </div>
                  {decision.comment && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{decision.comment}</p>}
                  <p className="mt-3 text-[10px] text-muted-foreground">Recorded {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

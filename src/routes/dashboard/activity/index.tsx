import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, FileSignature, Loader2, ShieldCheck, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";
import { listWorkspaceActivity } from "@/lib/phase8.functions";

export const Route = createFileRoute("/dashboard/activity/")({ component: ActivityPage });

type SourceFilter = "all" | "activity" | "workflow" | "signing";

const filters: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "All activity" },
  { value: "activity", label: "Workspace" },
  { value: "workflow", label: "Workflows" },
  { value: "signing", label: "E-signatures" },
];

function ActivityPage() {
  const { user } = useAuth();
  const workspace = useWorkspaceShell(user);
  const [source, setSource] = useState<SourceFilter>("all");

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["phase8-activity", workspace.activeWorkspaceId],
    enabled: Boolean(workspace.activeWorkspaceId),
    queryFn: () => listWorkspaceActivity(workspace.activeWorkspaceId!, 250),
  });

  const visible = useMemo(
    () => (source === "all" ? events : events.filter((event) => event.source === source)),
    [events, source],
  );

  const role = workspace.activeWorkspace?.role ?? "viewer";
  const canSeeWorkspace = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            {canSeeWorkspace
              ? "Workspace-wide audit activity, workflow events and signing events."
              : "Your workspace actions, workflow events and signing events."}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            variant={source === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSource(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading || workspace.isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !workspace.activeWorkspaceId ? (
            <Empty text="Select or create a workspace to view activity." />
          ) : visible.length === 0 ? (
            <Empty text="No activity matches this view yet." />
          ) : (
            <div className="divide-y">
              {visible.map((event) => {
                const Icon = sourceIcon(event.source);
                return (
                  <a
                    key={`${event.source}-${event.event_id}`}
                    href={event.route}
                    className="flex gap-4 px-5 py-4 transition hover:bg-muted/40"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-medium">{formatAction(event.action)}</p>
                        <span className="text-sm text-muted-foreground">by {event.actor_name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatEntity(event.entity_type)} · {new Date(event.occurred_at).toLocaleString()}
                      </p>
                      {event.source === "signing" && isObject(event.metadata) && event.metadata.eventHash ? (
                        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                          Audit hash: {String(event.metadata.eventHash)}
                        </p>
                      ) : null}
                    </div>
                    <span className="self-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {event.source}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function sourceIcon(source: string) {
  if (source === "workflow") return Workflow;
  if (source === "signing") return FileSignature;
  return ShieldCheck;
}

function formatAction(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function formatEntity(value: string) {
  return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-20 text-center">
      <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

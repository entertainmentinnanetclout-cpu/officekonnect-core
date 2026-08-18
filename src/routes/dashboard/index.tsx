import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  FileSignature,
  FileText,
  Mail,
  Mic,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";
import { supabase } from "@/integrations/supabase/client";
import { listWorkspaceActivity } from "@/lib/phase8.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { user } = useAuth();
  const workspace = useWorkspaceShell(user);
  const workspaceId = workspace.activeWorkspaceId;

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["dashboard-stats", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const [docs, signingRequests, campaigns, contacts, voices] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .neq("document_status", "deleted"),
        supabase
          .from("signing_requests")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!),
        supabase.from("email_campaigns").select("emails_sent").eq("workspace_id", workspaceId!),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!),
        supabase
          .from("voice_notes")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!),
      ]);

      for (const response of [docs, signingRequests, campaigns, contacts, voices]) {
        if (response.error) throw response.error;
      }

      return {
        documents: docs.count ?? 0,
        signingRequests: signingRequests.count ?? 0,
        emailsSent: (campaigns.data ?? []).reduce(
          (total, campaign) => total + campaign.emails_sent,
          0,
        ),
        contacts: contacts.count ?? 0,
        voices: voices.count ?? 0,
      };
    },
  });

  const quickActions = [
    {
      name: "Documents",
      description: "Create, upload and manage files",
      icon: FileText,
      href: "/dashboard/documents" as const,
    },
    {
      name: "E-signatures",
      description: "Prepare and track signature requests",
      icon: FileSignature,
      href: "/dashboard/signing" as const,
    },
    {
      name: "Mail Center",
      description: "Create and manage office campaigns",
      icon: Mail,
      href: "/dashboard/mail" as const,
    },
    {
      name: "Contacts",
      description: "Import and manage workspace contacts",
      icon: Users,
      href: "/dashboard/contacts" as const,
    },
    {
      name: "Voice Notes",
      description: "Record and organize voice notes",
      icon: Mic,
      href: "/dashboard/voice" as const,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {user?.user_metadata?.full_name?.split(" ")[0] ?? "User"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {workspace.activeWorkspace?.name
              ? `Live workspace overview for ${workspace.activeWorkspace.name}.`
              : "Select a workspace to view current office activity."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/activity">View activity</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/dashboard/documents">
              <Plus className="mr-2 h-4 w-4" />
              Create document
            </Link>
          </Button>
        </div>
      </div>

      {workspace.error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">{workspace.error}</CardContent>
        </Card>
      ) : null}
      {statsError ? (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">
            Workspace metrics could not be loaded. Refresh the page or try again later.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" aria-busy={statsLoading}>
        <StatCard
          title="Documents"
          value={stats?.documents ?? 0}
          icon={FileText}
          detail="Active workspace"
        />
        <StatCard
          title="E-sign requests"
          value={stats?.signingRequests ?? 0}
          icon={FileSignature}
          detail="All request states"
        />
        <StatCard
          title="Emails sent"
          value={stats?.emailsSent ?? 0}
          icon={Mail}
          detail="Recorded campaign sends"
        />
        <StatCard
          title="Contacts"
          value={stats?.contacts ?? 0}
          icon={Users}
          detail="Workspace contacts"
        />
        <StatCard
          title="Voice notes"
          value={stats?.voices ?? 0}
          icon={Mic}
          detail="Workspace notes"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Workspace tools</CardTitle>
            <CardDescription>Open a live OfficeKonnect module.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link
                key={action.name}
                to={action.href}
                className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <action.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{action.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest auditable events in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentActivity workspaceId={workspaceId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecentActivity({ workspaceId }: { workspaceId: string | null }) {
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["dashboard-activity", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceActivity(workspaceId!, 6, 0),
  });

  if (!workspaceId)
    return <p className="text-sm text-muted-foreground">Select a workspace to view activity.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading recent activity…</p>;
  if (isError)
    return <p className="text-sm text-destructive">Recent activity could not be loaded.</p>;
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No auditable workspace activity has been recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {data.map((row) => (
        <div key={`${row.source}-${row.event_id}`} className="flex gap-4">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium leading-none">
              {humanizeAction(row.action)}{" "}
              <span className="text-muted-foreground">· {humanizeEntity(row.entity_type)}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.actor_name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(row.occurred_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function humanizeAction(action: string) {
  const normalized = action.replaceAll("_", " ").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function humanizeEntity(entityType: string) {
  return entityType.replaceAll("_", " ");
}

function StatCard({
  title,
  value,
  icon: Icon,
  detail,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  detail: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {detail}
          </span>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <h3
            className={cn(
              "text-2xl font-bold tracking-tight",
              value === 0 && "text-muted-foreground",
            )}
          >
            {value}
          </h3>
        </div>
      </CardContent>
    </Card>
  );
}

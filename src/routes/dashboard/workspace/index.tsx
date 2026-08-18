import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, Plus, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/errors";
import { createOfficeWorkspace, type WorkspaceRole } from "@/lib/phase8.functions";

export const Route = createFileRoute("/dashboard/workspace/")({ component: WorkspacePage });

function WorkspacePage() {
  const { user } = useAuth();
  const workspace = useWorkspaceShell(user);
  const workspaceId = workspace.activeWorkspaceId;
  const role = workspace.activeWorkspace?.role as WorkspaceRole | undefined;
  const canEdit = role === "owner" || role === "admin";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState({ name: "", company_name: "", logo_url: "", address: "" });

  const { data: details, isLoading } = useQuery({
    queryKey: ["phase8-workspace-details", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const [{ data: row, error }, { data: subscription, error: subscriptionError }] =
        await Promise.all([
          supabase
            .from("workspaces")
            .select(
              "id,name,slug,company_name,logo_url,address,plan,is_personal,owner_id,settings,created_at",
            )
            .eq("id", workspaceId!)
            .single(),
          supabase
            .from("subscriptions")
            .select("plan,status,billing_cycle,started_at,expires_at")
            .eq("workspace_id", workspaceId!)
            .maybeSingle(),
        ]);
      if (error) throw error;
      if (subscriptionError) throw subscriptionError;
      return { workspace: row, subscription };
    },
  });

  useEffect(() => {
    if (details?.workspace) {
      setForm({
        name: details.workspace.name,
        company_name: details.workspace.company_name ?? "",
        logo_url: details.workspace.logo_url ?? "",
        address: details.workspace.address ?? "",
      });
    }
  }, [details]);

  const saveWorkspace = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No active workspace selected");
      const { error } = await supabase
        .from("workspaces")
        .update({
          name: form.name.trim(),
          company_name: form.company_name.trim() || null,
          logo_url: form.logo_url.trim() || null,
          address: form.address.trim() || null,
        })
        .eq("id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Workspace updated");
      await queryClient.invalidateQueries({ queryKey: ["phase8-workspace-details", workspaceId] });
      await workspace.reload();
    },
    onError: (error) => toastError(error, "Could not update workspace"),
  });

  const createWorkspace = useMutation({
    mutationFn: () => createOfficeWorkspace(newName),
    onSuccess: async (created) => {
      toast.success(`${created.name} created`);
      setCreateOpen(false);
      setNewName("");
      await workspace.reload();
      await queryClient.invalidateQueries();
    },
    onError: (error) => toastError(error, "Could not create workspace"),
  });

  const switchWorkspace = async (workspaceOptionId: string) => {
    await workspace.switchWorkspace(workspaceOptionId);
    await queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Identity, tenancy and workspace switching over the canonical OfficeKonnect membership
            model.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New workspace
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Active workspace" value={workspace.activeWorkspace?.name ?? "—"} />
        <Metric label="Your role" value={role ?? "—"} />
        <Metric
          label="Plan"
          value={details?.subscription?.plan ?? details?.workspace?.plan ?? "—"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Workspace identity</CardTitle>
            <CardDescription>
              Owner/admin-controlled identity used across OfficeKonnect documents and
              administration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || workspace.isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !details?.workspace ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No active workspace selected.
              </p>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Workspace name"
                    value={form.name}
                    onChange={(value) => setForm((current) => ({ ...current, name: value }))}
                    disabled={!canEdit}
                  />
                  <Field label="Workspace slug" value={details.workspace.slug} disabled />
                  <Field
                    label="Company name"
                    value={form.company_name}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, company_name: value }))
                    }
                    disabled={!canEdit}
                  />
                  <Field
                    label="Logo URL"
                    value={form.logo_url}
                    onChange={(value) => setForm((current) => ({ ...current, logo_url: value }))}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Textarea
                    value={form.address}
                    disabled={!canEdit}
                    rows={4}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, address: event.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(details.workspace.created_at).toLocaleDateString()} ·{" "}
                    {details.workspace.is_personal
                      ? "Personal workspace"
                      : "Organization workspace"}
                  </div>
                  {canEdit ? (
                    <Button
                      onClick={() => saveWorkspace.mutate()}
                      disabled={saveWorkspace.isPending || !form.name.trim()}
                    >
                      {saveWorkspace.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save identity
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your workspaces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workspace.workspaces.map((option) => {
                const active = option.id === workspaceId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => !active && void switchWorkspace(option.id)}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/50"
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{option.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{option.role}</p>
                    </div>
                    {active ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Membership</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Invite people, update roles and review pending invitations from Team.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <a href="/dashboard/team">
                  <Users className="mr-2 h-4 w-4" /> Manage team
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Info label="Plan" value={details?.subscription?.plan ?? "free"} />
              <Info label="Status" value={details?.subscription?.status ?? "active"} />
              <Info
                label="Billing cycle"
                value={details?.subscription?.billing_cycle ?? "monthly"}
              />
              {details?.subscription?.expires_at ? (
                <Info
                  label="Expires"
                  value={new Date(details.subscription.expires_at).toLocaleDateString()}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Creates the workspace, owner membership and free subscription atomically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Workspace name</Label>
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Finance Office"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createWorkspace.mutate()}
              disabled={newName.trim().length < 2 || createWorkspace.isPending}
            >
              {createWorkspace.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}{" "}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold capitalize">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

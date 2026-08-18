import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  Code2,
  CreditCard,
  FileText,
  Files,
  Loader2,
  Palette,
  PenTool,
  Printer,
  Save,
  Shield,
  Star,
  StarOff,
  Trash2,
  User,
  UserCircle,
  Workflow,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";
import { supabase } from "@/integrations/supabase/client";
import { SignatureManager } from "@/components/signature-manager";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/errors";
import { countUnreadWorkspaceNotifications } from "@/lib/phase8.functions";

export const Route = createFileRoute("/dashboard/settings/")({ component: SettingsPage });

const TABS = [
  { id: "general", label: "General", icon: User },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "pdf", label: "PDF & Printing", icon: Printer },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "signatures", label: "Signatures", icon: PenTool },
  { id: "templates", label: "Templates", icon: Files },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Zap },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "developer", label: "Developer", icon: Code2 },
  { id: "account", label: "Account", icon: UserCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsPage() {
  const { user } = useAuth();
  const workspace = useWorkspaceShell(user);
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Account, workspace and real OfficeKonnect product configuration.
        </p>
      </div>
      <div className="flex flex-col gap-8 xl:flex-row">
        <aside className="w-full xl:w-64">
          <nav className="flex gap-1 overflow-x-auto pb-2 xl:flex-col xl:overflow-visible xl:pb-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 max-w-4xl flex-1">
          {activeTab === "general" ? (
            <ProfileTab userId={user?.id ?? ""} userEmail={user?.email ?? ""} />
          ) : null}
          {activeTab === "workspace" ? (
            <WorkspaceSettings
              workspaceId={workspace.activeWorkspaceId}
              role={workspace.activeWorkspace?.role ?? null}
            />
          ) : null}
          {activeTab === "documents" ? (
            <DocumentsSettings workspaceId={workspace.activeWorkspaceId} />
          ) : null}
          {activeTab === "pdf" ? <PdfSettings /> : null}
          {activeTab === "notifications" ? (
            <NotificationSettings workspaceId={workspace.activeWorkspaceId} />
          ) : null}
          {activeTab === "signatures" ? <SignaturesTab /> : null}
          {activeTab === "templates" ? (
            <TemplateSettings workspaceId={workspace.activeWorkspaceId} />
          ) : null}
          {activeTab === "security" ? <SecurityTab /> : null}
          {activeTab === "appearance" ? <AppearanceTab userId={user?.id ?? ""} /> : null}
          {activeTab === "integrations" ? (
            <IntegrationsTab userId={user?.id ?? ""} workspaceId={workspace.activeWorkspaceId} />
          ) : null}
          {activeTab === "billing" ? (
            <BillingTab workspaceId={workspace.activeWorkspaceId} />
          ) : null}
          {activeTab === "developer" ? (
            <DeveloperTab userId={user?.id ?? ""} workspaceId={workspace.activeWorkspaceId} />
          ) : null}
          {activeTab === "account" ? <AccountTab /> : null}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ userEmail, userId }: { userEmail: string; userId: string }) {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["settings-profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name,phone,job_title,avatar_url")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ full_name: "", phone: "", job_title: "", avatar_url: "" });
  useEffect(() => {
    if (profile)
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        job_title: profile.job_title ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update(form).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Profile updated");
      await queryClient.invalidateQueries({ queryKey: ["settings-profile", userId] });
    },
    onError: (error) => toastError(error, "Could not update profile"),
  });

  const uploadAvatar = async (file: File) => {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Profile photo must be 2MB or smaller");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((current) => ({ ...current, avatar_url: data.publicUrl }));
      toast.success("Photo uploaded. Save changes to apply it.");
    } catch (error) {
      toastError(error, "Avatar upload failed");
    }
  };

  if (isLoading) return <LoadingCard />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>General profile</CardTitle>
        <CardDescription>
          Your identity across workspace collaboration, workflows and signing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-5">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-muted">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          <div>
            <Label className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium">
              Upload photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
              />
            </Label>
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPG or WebP up to 2MB.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            value={form.full_name}
            onChange={(value) => setForm((current) => ({ ...current, full_name: value }))}
          />
          <Field label="Email" value={userEmail} disabled />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
          />
          <Field
            label="Job title"
            value={form.job_title}
            onChange={(value) => setForm((current) => ({ ...current, job_title: value }))}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t py-4">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save profile
        </Button>
      </CardFooter>
    </Card>
  );
}

function WorkspaceSettings({
  workspaceId,
  role,
}: {
  workspaceId: string | null;
  role: string | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["settings-workspace", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("name,slug,company_name,address,plan")
        .eq("id", workspaceId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <LoadingCard />;
  return (
    <RealBehaviorCard
      title="Workspace"
      description="Workspace identity and membership are administered through the dedicated Workspace and Team surfaces."
    >
      <Info label="Workspace" value={data?.name ?? "No active workspace"} />
      <Info label="Slug" value={data?.slug ?? "—"} />
      <Info label="Your role" value={role ?? "—"} />
      <Info label="Plan" value={data?.plan ?? "—"} />
      <div className="mt-5 flex gap-2">
        <Button asChild>
          <Link to="/dashboard/workspace">Manage workspace</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard/team">Manage team</Link>
        </Button>
      </div>
    </RealBehaviorCard>
  );
}

function DocumentsSettings({ workspaceId }: { workspaceId: string | null }) {
  const { data } = useQuery({
    queryKey: ["settings-document-state", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const [docs, letterheads] = await Promise.all([
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .neq("document_status", "deleted"),
        supabase
          .from("letterheads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!),
      ]);
      if (docs.error) throw docs.error;
      if (letterheads.error) throw letterheads.error;
      return { documents: docs.count ?? 0, letterheads: letterheads.count ?? 0 };
    },
  });
  return (
    <RealBehaviorCard
      title="Documents"
      description="OfficeKonnect keeps document state in the canonical documents/version ledger; no unused global editor defaults are stored."
    >
      <Info label="Active documents" value={String(data?.documents ?? 0)} />
      <Info label="Letterheads" value={String(data?.letterheads ?? 0)} />
      <Info label="Versioning" value="Immutable version ledger" />
      <Info label="Autosave" value="Canonical structured save RPC" />
      <Button asChild className="mt-5">
        <Link to="/dashboard/documents">Open Documents</Link>
      </Button>
    </RealBehaviorCard>
  );
}

function PdfSettings() {
  return (
    <RealBehaviorCard
      title="PDF & Printing"
      description="PDF behavior is intentionally controlled by the document/sheet export flow so the selected page, print area and signing copy remain deterministic."
    >
      <Info label="Native documents" value="Deterministic PDF renderer" />
      <Info label="Sheets" value="Print area, orientation, scaling and margins in export" />
      <Info label="Signing" value="Immutable PDF signing copy before request creation" />
      <div className="mt-5 flex gap-2">
        <Button asChild>
          <Link to="/dashboard/documents">Documents</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard/sheets">Sheets</Link>
        </Button>
      </div>
    </RealBehaviorCard>
  );
}

function NotificationSettings({ workspaceId }: { workspaceId: string | null }) {
  const { data: unread = 0 } = useQuery({
    queryKey: ["settings-unread", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => countUnreadWorkspaceNotifications(workspaceId!),
  });
  return (
    <RealBehaviorCard
      title="Notifications"
      description="Notification delivery and read state are sourced from the canonical notification center. Workspace broadcasts retain per-user read receipts."
    >
      <Info label="Unread in active workspace" value={String(unread)} />
      <Info label="Task assignment" value="In-app notification enabled" />
      <Info label="Workflow & signing events" value="Canonical backend producers" />
      <Button asChild className="mt-5">
        <Link to="/dashboard/notifications">Open notification center</Link>
      </Button>
    </RealBehaviorCard>
  );
}

function SignaturesTab() {
  const queryClient = useQueryClient();
  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ["settings-signatures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_signatures")
        .select("id,name,signature_image_url,is_default,storage_path")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_signatures")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Default signature updated");
      await queryClient.invalidateQueries({ queryKey: ["settings-signatures"] });
    },
    onError: (error) => toastError(error, "Could not set default signature"),
  });
  const remove = useMutation({
    mutationFn: async (signature: { id: string; storage_path: string | null }) => {
      if (signature.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("signatures")
          .remove([signature.storage_path]);
        if (storageError) throw storageError;
      }
      const { error } = await supabase.from("user_signatures").delete().eq("id", signature.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Signature deleted");
      await queryClient.invalidateQueries({ queryKey: ["settings-signatures"] });
    },
    onError: (error) => toastError(error, "Could not delete signature"),
  });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create signature</CardTitle>
          <CardDescription>
            Reusable signatures are stored workspace-first and reused by the production signing
            flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignatureManager />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Saved signatures</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" />
          ) : signatures.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No saved signatures.</p>
          ) : (
            <div className="divide-y">
              {signatures.map((signature) => (
                <div key={signature.id} className="flex items-center gap-4 py-3">
                  <img
                    src={signature.signature_image_url}
                    alt={signature.name}
                    className="h-12 w-28 rounded bg-muted object-contain"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{signature.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {signature.is_default ? "Default signature" : "Saved signature"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDefault.mutate(signature.id)}
                    disabled={signature.is_default || setDefault.isPending}
                  >
                    {signature.is_default ? (
                      <Star className="mr-2 h-4 w-4" />
                    ) : (
                      <StarOff className="mr-2 h-4 w-4" />
                    )}
                    {signature.is_default ? "Default" : "Set default"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      remove.mutate({ id: signature.id, storage_path: signature.storage_path })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateSettings({ workspaceId }: { workspaceId: string | null }) {
  const { data: count = 0 } = useQuery({
    queryKey: ["settings-template-count", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("document_templates")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId!)
        .eq("is_archived", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return (
    <RealBehaviorCard
      title="Templates"
      description="Reusable document and spreadsheet templates remain canonical in document_templates; template-specific options are managed with the template itself."
    >
      <Info label="Active templates" value={String(count)} />
      <Info label="Supported kinds" value="Documents and spreadsheets" />
      <Info label="Lifecycle" value="Create, duplicate, edit metadata, archive, restore" />
      <Button asChild className="mt-5">
        <Link to="/dashboard/templates">Manage templates</Link>
      </Button>
    </RealBehaviorCard>
  );
}

function SecurityTab() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const updatePassword = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setPassword("");
      setConfirmPassword("");
    },
    onError: (error) => toastError(error, "Could not update password"),
  });
  const signOutOthers = async () => {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) return toastError(error, "Could not sign out other sessions");
    toast.success("Other sessions signed out");
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Update the credential for your authenticated OfficeKonnect account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="New password" type="password" value={password} onChange={setPassword} />
          <Field
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </CardContent>
        <CardFooter className="justify-end border-t py-4">
          <Button onClick={() => updatePassword.mutate()} disabled={updatePassword.isPending}>
            {updatePassword.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Update password
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Invalidate all other authenticated sessions if access may be compromised.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button variant="outline" onClick={() => void signOutOthers()}>
            Sign out other sessions
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function AppearanceTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["settings-appearance", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const preferences = useMemo(
    () => (isRecord(profile?.preferences) ? profile.preferences : {}),
    [profile?.preferences],
  );
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    if (typeof preferences.theme === "string") setTheme(preferences.theme);
  }, [preferences]);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const saveTheme = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ preferences: { ...preferences, theme: next } })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings-appearance", userId] });
    },
    onError: (error) => toastError(error, "Could not save appearance"),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Theme is a persisted user preference and is applied immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {["light", "dark", "system"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setTheme(option);
                saveTheme.mutate(option);
              }}
              className={cn(
                "rounded-lg border p-4 text-sm font-semibold capitalize",
                theme === option ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsTab({ userId, workspaceId }: { userId: string; workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["settings-integrations", userId, workspaceId],
    enabled: Boolean(userId),
    queryFn: async () => {
      let query = supabase
        .from("user_integrations")
        .select("id,provider,account_email,is_active,expires_at,scopes,workspace_id,updated_at")
        .eq("user_id", userId);
      if (workspaceId) query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("user_integrations")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Integration disconnected");
      await queryClient.invalidateQueries({ queryKey: ["settings-integrations"] });
    },
    onError: (error) => toastError(error, "Could not disconnect integration"),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connected provider accounts appear here when a configured integration flow has authorized
          them. You can review status and disconnect existing connections.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" />
        ) : integrations.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No connected integrations for this account/workspace.
          </p>
        ) : (
          <div className="divide-y">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium capitalize">
                    {integration.provider.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {integration.account_email ?? "Connected account"} ·{" "}
                    {integration.is_active ? "active" : "inactive"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnect.mutate(integration.id)}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillingTab({ workspaceId }: { workspaceId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["settings-billing", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "plan,status,billing_cycle,started_at,expires_at,stripe_customer_id,stripe_subscription_id",
        )
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <LoadingCard />;
  return (
    <RealBehaviorCard
      title="Billing"
      description="This view reflects the current workspace subscription and linked payment-provider state."
    >
      <Info label="Plan" value={data?.plan ?? "free"} />
      <Info label="Status" value={data?.status ?? "active"} />
      <Info label="Billing cycle" value={data?.billing_cycle ?? "monthly"} />
      <Info
        label="Started"
        value={data?.started_at ? new Date(data.started_at).toLocaleDateString() : "—"}
      />
      {data?.expires_at ? (
        <Info label="Expires" value={new Date(data.expires_at).toLocaleDateString()} />
      ) : null}
      <Info
        label="Payment provider"
        value={
          data?.stripe_customer_id || data?.stripe_subscription_id
            ? "Stripe linked"
            : "No external billing account linked"
        }
      />
    </RealBehaviorCard>
  );
}

function DeveloperTab({ userId, workspaceId }: { userId: string; workspaceId: string | null }) {
  const rows = [
    { label: "User ID", value: userId || "—" },
    { label: "Workspace ID", value: workspaceId || "—" },
    { label: "Supabase project ref", value: "ydgsmnzcwkrlghlhtpgq" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Developer</CardTitle>
        <CardDescription>
          Non-secret identifiers useful for support and integration diagnostics. Credentials and
          service-role secrets are never exposed here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {row.label}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{row.value}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(row.value)
                    .then(() => toast.success(`${row.label} copied`))
                }
              >
                Copy
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AccountTab() {
  const exportData = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const [profile, signatures, documents, voice, memberships] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_signatures").select("*").eq("created_by", user.id),
        supabase.from("documents").select("*").eq("created_by", user.id),
        supabase.from("voice_notes").select("*").eq("created_by", user.id),
        supabase
          .from("workspace_members")
          .select("workspace_id,role,joined_at")
          .eq("user_id", user.id),
      ]);
      for (const response of [profile, signatures, documents, voice, memberships])
        if (response.error) throw response.error;
      const payload = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile: profile.data,
        memberships: memberships.data ?? [],
        signatures: signatures.data ?? [],
        documents: documents.data ?? [],
        voice_notes: voice.data ?? [],
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `officekonnect-export-${Date.now()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Personal data export downloaded");
    } catch (error) {
      toastError(error, "Export failed");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account data</CardTitle>
        <CardDescription>
          Download the account data that OfficeKonnect can safely export from your authenticated RLS
          scope.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Account deletion is unavailable while shared-workspace ownership transfer and
          audit-retention requirements are enforced. You can export the account data currently
          available through your authenticated access.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={() => void exportData()}>
          Download my data
        </Button>
      </CardFooter>
    </Card>
  );
}

function RealBehaviorCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b py-3 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  );
}
function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  User,
  Building,
  Shield,
  PenTool,
  Zap,
  CreditCard,
  Palette,
  Bell,
  UserX,
  Loader2,
  Save,
  UserCircle,
  Trash2,
  Star,
  StarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SignatureManager } from "@/components/signature-manager";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/settings/")({
  component: SettingsIndex,
});

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "company", label: "Company", icon: Building },
  { id: "signatures", label: "Signatures", icon: PenTool },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "integrations", label: "Integrations", icon: Zap },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "account", label: "Account", icon: UserX },
] as const;

function SettingsIndex() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("profile");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-slate-500">Manage your account, workspace and preferences.</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="w-full lg:w-64">
          <nav className="flex flex-row gap-1 overflow-auto pb-2 lg:flex-col lg:pb-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="max-w-3xl flex-1">
          {activeTab === "profile" && <ProfileTab userEmail={user?.email ?? ""} userId={user?.id ?? ""} />}
          {activeTab === "company" && <CompanyTab />}
          {activeTab === "signatures" && <SignaturesTab />}
          {activeTab === "appearance" && <AppearanceTab userId={user?.id ?? ""} />}
          {activeTab === "notifications" && <NotificationsTab userId={user?.id ?? ""} />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "integrations" && <PlaceholderTab title="Integrations" description="Connect external services (Brevo, OpenAI, etc.). Configuration is managed under your workspace integrations." />}
          {activeTab === "billing" && <PlaceholderTab title="Billing" description="Plan and invoicing details will appear here once subscriptions are enabled." />}
          {activeTab === "account" && <AccountTab />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileTab({ userEmail, userId }: { userEmail: string; userId: string }) {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const [form, setForm] = useState({ full_name: "", phone: "", job_title: "", avatar_url: "" });
  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        job_title: profile.job_title ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update(form).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
    onError: (e) => toastError(e, "Could not update profile"),
  });

  const uploadAvatar = async (file: File) => {
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, avatar_url: data.publicUrl }));
      toast.success("Avatar uploaded. Save to apply.");
    } catch (e) {
      toastError(e, "Avatar upload failed");
    }
  };

  if (isLoading) return <CardSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>How others see you in OfficeKonnect.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          <div className="relative h-20 w-20">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              {form.avatar_url ? (
                <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserCircle className="h-12 w-12" />
              )}
            </div>
            <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <PenTool className="h-3 w-3" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
              }} />
            </label>
          </div>
          <div>
            <h4 className="font-medium">Profile Photo</h4>
            <p className="text-xs text-slate-500">JPG, PNG up to ~2MB</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
          <Field label="Email Address" value={userEmail} disabled />
          <Field label="Phone Number" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Job Title" value={form.job_title} onChange={(v) => setForm({ ...form, job_title: v })} />
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t bg-slate-50/50 px-6 py-4 dark:bg-slate-900/50">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ---------------- Company / Workspace ---------------- */

function CompanyTab() {
  const queryClient = useQueryClient();
  const { data: ws, isLoading } = useQuery({
    queryKey: ["my-workspace"],
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("default_workspace_id").single();
      if (!profile?.default_workspace_id) throw new Error("No workspace");
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, company_name, logo_url, address")
        .eq("id", profile.default_workspace_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ company_name: "", logo_url: "", address: "" });
  useEffect(() => {
    if (ws) setForm({ company_name: ws.company_name ?? "", logo_url: ws.logo_url ?? "", address: ws.address ?? "" });
  }, [ws]);

  const save = useMutation({
    mutationFn: async () => {
      if (!ws) return;
      const { error } = await supabase.from("workspaces").update(form).eq("id", ws.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Company info updated");
      queryClient.invalidateQueries({ queryKey: ["my-workspace"] });
    },
    onError: (e) => toastError(e, "Could not update workspace"),
  });

  if (isLoading || !ws) return <CardSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Details</CardTitle>
        <CardDescription>These appear on letterheads and sent documents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Company Name" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
        <Field label="Logo URL" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
        <div className="space-y-2">
          <Label>Address</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t bg-slate-50/50 px-6 py-4 dark:bg-slate-900/50">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ---------------- Signatures ---------------- */

function SignaturesTab() {
  const queryClient = useQueryClient();
  const { data: sigs, isLoading } = useQuery({
    queryKey: ["signatures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_signatures")
        .select("id, name, signature_image_url, is_default, storage_path")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_signatures").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Default signature updated");
      queryClient.invalidateQueries({ queryKey: ["signatures"] });
    },
    onError: (e) => toastError(e, "Could not set default"),
  });

  const remove = useMutation({
    mutationFn: async (sig: { id: string; storage_path: string | null }) => {
      if (sig.storage_path) await supabase.storage.from("signatures").remove([sig.storage_path]);
      const { error } = await supabase.from("user_signatures").delete().eq("id", sig.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signature deleted");
      queryClient.invalidateQueries({ queryKey: ["signatures"] });
    },
    onError: (e) => toastError(e, "Could not delete"),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Signature</CardTitle>
          <CardDescription>Draw or type a signature to reuse on documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignatureManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Signatures</CardTitle>
          <CardDescription>Set a default or remove signatures you no longer need.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (sigs ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No signatures yet.</p>
          ) : (
            <ul className="divide-y dark:divide-slate-800">
              {sigs!.map((s) => (
                <li key={s.id} className="flex items-center gap-4 py-3">
                  <img src={s.signature_image_url} alt={s.name} className="h-12 w-24 rounded bg-slate-50 object-contain dark:bg-slate-800" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.is_default && <span className="text-[10px] uppercase text-primary">Default</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={s.is_default}
                    onClick={() => setDefault.mutate(s.id)}
                  >
                    {s.is_default ? <Star className="mr-2 h-4 w-4 fill-current" /> : <StarOff className="mr-2 h-4 w-4" />}
                    {s.is_default ? "Default" : "Set default"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate({ id: s.id, storage_path: s.storage_path })}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Appearance ---------------- */

function AppearanceTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile-prefs", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("preferences").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const [theme, setTheme] = useState<string>((prefs.theme as string) ?? "system");

  useEffect(() => {
    if (prefs.theme) setTheme(prefs.theme as string);
  }, [prefs.theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "light") root.classList.remove("dark");
  }, [theme]);

  const save = useMutation({
    mutationFn: async (newTheme: string) => {
      const updated = { ...prefs, theme: newTheme };
      const { error } = await supabase.from("profiles").update({ preferences: updated }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile-prefs", userId] }),
    onError: (e) => toastError(e, "Could not save preference"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how OfficeKonnect looks for you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTheme(t); save.mutate(t); }}
              className={cn(
                "rounded-lg border p-4 text-center text-sm font-medium capitalize transition",
                theme === t ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/40 dark:border-slate-700",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Language: English (more locales coming soon).</p>
      </CardContent>
    </Card>
  );
}

/* ---------------- Notifications ---------------- */

function NotificationsTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile-notif", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("preferences").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
  const notif = (prefs.notifications as Record<string, boolean>) ?? {
    email_documents: true,
    email_campaigns: true,
    email_voice: true,
  };

  const toggle = useMutation({
    mutationFn: async (next: Record<string, boolean>) => {
      const updated = { ...prefs, notifications: next };
      const { error } = await supabase.from("profiles").update({ preferences: updated }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile-notif", userId] }),
    onError: (e) => toastError(e, "Could not save preference"),
  });

  const row = (key: string, label: string, desc: string) => (
    <div key={key} className="flex items-center justify-between border-b py-3 last:border-0 dark:border-slate-800">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <Switch
        checked={notif[key] ?? true}
        onCheckedChange={(v) => toggle.mutate({ ...notif, [key]: v })}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what we send you by email.</CardDescription>
      </CardHeader>
      <CardContent>
        {row("email_documents", "Document activity", "When documents are signed, exported or converted")}
        {row("email_campaigns", "Email campaigns", "Delivery summaries for sent campaigns")}
        {row("email_voice", "Voice transcriptions", "When a voice note finishes transcribing")}
      </CardContent>
    </Card>
  );
}

/* ---------------- Security ---------------- */

function SecurityTab() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const updating = useMutation({
    mutationFn: async () => {
      if (pw.length < 8) throw new Error("Password must be at least 8 characters");
      if (pw !== pw2) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated");
      setPw(""); setPw2("");
    },
    onError: (e) => toastError(e, "Could not update password"),
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
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Use at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="New password" type="password" value={pw} onChange={setPw} />
          <Field label="Confirm new password" type="password" value={pw2} onChange={setPw2} />
        </CardContent>
        <CardFooter className="justify-end border-t bg-slate-50/50 px-6 py-4 dark:bg-slate-900/50">
          <Button onClick={() => updating.mutate()} disabled={updating.isPending}>
            {updating.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Update Password
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Sign out everywhere else if you suspect a compromised session.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end border-t bg-slate-50/50 px-6 py-4 dark:bg-slate-900/50">
          <Button variant="outline" onClick={signOutOthers}>Sign out other sessions</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/* ---------------- Account ---------------- */

function AccountTab() {
  const exportData = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const [profile, sigs, docs, voice] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_signatures").select("*").eq("created_by", user.id),
        supabase.from("documents").select("*").eq("created_by", user.id),
        supabase.from("voice_notes").select("*").eq("created_by", user.id),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile: profile.data,
        signatures: sigs.data ?? [],
        documents: docs.data ?? [],
        voice_notes: voice.data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `officekonnect-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toastError(e, "Export failed");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Export Personal Data</CardTitle>
          <CardDescription>Download a JSON copy of your profile, signatures, documents and voice notes.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end border-t bg-slate-50/50 px-6 py-4 dark:bg-slate-900/50">
          <Button variant="outline" onClick={exportData}>Download my data</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and workspace data. This action cannot be undone.
            Please contact support to complete account deletion.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end border-t bg-slate-50/50 px-6 py-4 dark:bg-slate-900/50">
          <Button variant="destructive" disabled>Delete Account</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/* ---------------- shared ---------------- */

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </CardContent>
    </Card>
  );
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="py-12 text-center text-sm text-slate-500">
        Coming soon.
      </CardContent>
    </Card>
  );
}

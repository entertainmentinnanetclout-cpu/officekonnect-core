import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  User,
  Building,
  Shield,
  PenTool,
  Zap,
  CreditCard,
  Bell,
  Palette,
  CheckCircle2,
  Loader2,
  Save,
  UserCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SignatureManager } from "@/components/signature-manager";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/settings/")({
  component: SettingsIndex,
});

function SettingsIndex() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const queryClient = useQueryClient();

  // Fetch profile
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id ?? "")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (values: any) => {
      const { error } = await supabase
        .from("profiles")
        .update(values)
        .eq("id", user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated");
    },
  });

  const settingsTabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "company", label: "Company", icon: Building },
    { id: "signatures", label: "Signatures", icon: PenTool },
    { id: "integrations", label: "Integrations", icon: Zap },
    { id: "security", label: "Security", icon: Shield },
    { id: "billing", label: "Billing", icon: CreditCard },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-slate-500">Manage your account settings and preferences.</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar Tabs */}
        <aside className="w-full lg:w-64 flex-shrink-0">
          <nav className="flex flex-row overflow-auto lg:flex-col lg:space-y-1 pb-2 lg:pb-0">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Tab Content */}
        <div className="flex-1 max-w-3xl">
          {activeTab === "profile" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Update your personal details and how others see you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-6 pb-4">
                    <div className="relative h-20 w-20">
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                          <UserCircle className="h-12 w-12" />
                        )}
                      </div>
                      <Button size="icon" variant="outline" className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <PenTool className="h-3 w-3" />
                      </Button>
                    </div>
                    <div>
                      <h4 className="font-medium">Profile Photo</h4>
                      <p className="text-xs text-slate-500">JPG, GIF or PNG. Max size of 800K</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input id="full_name" defaultValue={profile?.full_name || ""} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" defaultValue={user?.email || ""} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input id="phone" defaultValue={profile?.phone || ""} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job_title">Job Title</Label>
                      <Input id="job_title" defaultValue={profile?.job_title || ""} />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <Button className="ml-auto">
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {activeTab === "signatures" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Your Signatures</CardTitle>
                  <CardDescription>Manage your digital signatures used for e-signing documents.</CardDescription>
                </CardHeader>
                <CardContent>
                  <SignatureManager />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Placeholder for other tabs */}
          {["company", "integrations", "security", "billing"].includes(activeTab) && (
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">{activeTab}</CardTitle>
                <CardDescription>Configure your {activeTab} settings.</CardDescription>
              </CardHeader>
              <CardContent className="py-24 text-center">
                <p className="text-slate-500">Settings for {activeTab} will be available soon.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

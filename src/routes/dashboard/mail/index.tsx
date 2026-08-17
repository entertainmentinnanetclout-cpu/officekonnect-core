import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Mail,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Send,
  BarChart3,
  FileText,
  Users,
  Layout,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrevoOnboarding } from "@/components/brevo-onboarding";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/mail/")({
  component: MailCenterIndex,
});

function MailCenterIndex() {
  const [activeTab, setActiveTab] = useState("campaigns");

  // Check if Brevo is connected
  const { data: integrations } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("provider", "brevo")
        .eq("is_active", true);

      if (error) throw error;
      return data;
    },
  });

  const isBrevoConnected =
    (integrations?.length ?? 0) > 0 || localStorage.getItem("brevo_connected") === "true";

  if (!isBrevoConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mail Center</h1>
          <p className="text-slate-500">Connect your email provider to start sending campaigns.</p>
        </div>
        <BrevoOnboarding />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mail Center</h1>
          <p className="text-slate-500">Manage your email templates and campaigns.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Layout className="mr-2 h-4 w-4" />
            Templates
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatItem title="Emails Sent" value="1,284" icon={Send} trend="+12%" />
        <StatItem title="Open Rate" value="42.5%" icon={ExternalLink} trend="+2.4%" />
        <StatItem title="Click Rate" value="8.2%" icon={BarChart3} trend="-0.5%" />
        <StatItem title="Recipients" value="4,850" icon={Users} trend="+124" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search campaigns..." className="pl-10" />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card
                key={i}
                className="group hover:border-primary/50 transition-colors cursor-pointer"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">
                          {i === 1
                            ? "Product Launch Q4"
                            : i === 2
                              ? "Monthly Newsletter"
                              : "Welcome Series"}
                        </h3>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            i === 1
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20"
                              : i === 2
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800",
                          )}
                        >
                          {i === 1 ? "Completed" : i === 2 ? "Sending" : "Draft"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">
                        Sent to 850 contacts • Oct {10 + i}, 2023
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-xs text-slate-500">Opens</p>
                        <p className="text-sm font-bold">{40 + i}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500">Clicks</p>
                        <p className="text-sm font-bold">{5 + i}%</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 text-xs">
                      View Report
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <Card className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
              <Plus className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium">Create Template</p>
            </Card>
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-[4/5] bg-slate-100 p-4 dark:bg-slate-800">
                  <div className="h-full w-full rounded border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"></div>
                </div>
                <CardContent className="p-4">
                  <p className="font-medium">Template {i}</p>
                  <p className="text-xs text-slate-500">Last edited 2 days ago</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatItem({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  trend: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          <h4 className="text-lg font-bold">{value}</h4>
          <span
            className={cn(
              "text-[10px] font-bold",
              trend.startsWith("+") ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {trend}
          </span>
        </div>
        <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center dark:bg-slate-800">
          <Icon className="h-4 w-4 text-slate-500" />
        </div>
      </CardContent>
    </Card>
  );
}

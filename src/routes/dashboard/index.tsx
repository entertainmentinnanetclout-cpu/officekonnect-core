import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  PenTool,
  Mail,
  Users,
  Mic,
  Plus,
  ArrowUpRight,
  Clock,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { user } = useAuth();

  // Fetch counts (Simplified for V1 - in reality, we'd query each table)
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [docs, signatures, emails, contacts, voices] = await Promise.all([
        supabase.from("documents").select("*", { count: "exact", head: true }),
        supabase.from("user_signatures").select("*", { count: "exact", head: true }),
        supabase.from("email_campaigns").select("*", { count: "exact", head: true }),
        supabase.from("contacts").select("*", { count: "exact", head: true }),
        supabase.from("voice_notes").select("*", { count: "exact", head: true }),
      ]);

      return {
        documents: docs.count || 0,
        signatures: signatures.count || 0,
        emails: emails.count || 0,
        contacts: contacts.count || 0,
        voices: voices.count || 0,
      };
    },
  });

  const quickActions = [
    { name: "Upload Document", icon: FileText, color: "bg-blue-500", href: "/dashboard/documents" },
    { name: "Create Signature", icon: PenTool, color: "bg-purple-500", href: "/dashboard/settings" },
    { name: "New Campaign", icon: Mail, color: "bg-emerald-500", href: "/dashboard/mail" },
    { name: "Import Contacts", icon: Users, color: "bg-orange-500", href: "/dashboard/contacts" },
    { name: "Record Note", icon: Mic, color: "bg-rose-500", href: "/dashboard/voice" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.user_metadata?.full_name?.split(' ')[0] ?? 'User'}</h1>
          <p className="text-slate-500 dark:text-slate-400">Here's what's happening with your office today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Clock className="mr-2 h-4 w-4" />
            History
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Quick Create
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Documents" value={stats?.documents ?? 0} icon={FileText} trend="+2 this week" />
        <StatCard title="Signatures" value={stats?.signatures ?? 0} icon={PenTool} trend="Default set" />
        <StatCard title="Emails Sent" value={stats?.emails ?? 0} icon={Mail} trend="84% open rate" />
        <StatCard title="Contacts" value={stats?.contacts ?? 0} icon={Users} trend="+12 this month" />
        <StatCard title="Voice Notes" value={stats?.voices ?? 0} icon={Mic} trend="3 transcribed" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you might want to perform right now.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link
                key={action.name}
                to={action.href}
                className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-primary/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg text-white", action.color)}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium">{action.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 dark:text-slate-600" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions across the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {i === 1 ? "Uploaded Proposal_Q3.pdf" :
                       i === 2 ? "Sent 'Monthly Newsletter' campaign" :
                       i === 3 ? "Signed 'Contract_v2.docx'" :
                       "Imported 45 new contacts"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {i * 2} hours ago
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" className="mt-6 w-full text-xs" asChild>
              <Link to="/dashboard/documents">View all activity</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend }: { title: string, value: number, icon: any, trend: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{trend}</span>
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}

import { cn } from "@/lib/utils";

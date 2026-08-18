import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  FileSignature,
  Files,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Menu,
  Mic,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";

export type OfficeKonnectRoute =
  | "/dashboard"
  | "/dashboard/documents"
  | "/dashboard/sheets"
  | "/dashboard/files"
  | "/dashboard/templates"
  | "/dashboard/workflows"
  | "/dashboard/approvals"
  | "/dashboard/mail"
  | "/dashboard/voice"
  | "/dashboard/contacts"
  | "/dashboard/settings";

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: OfficeKonnectRoute | null;
  phase?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Home", href: "/dashboard", icon: LayoutDashboard },
      { label: "Documents", href: "/dashboard/documents", icon: FileText },
      { label: "Sheets", href: "/dashboard/sheets", icon: FileSpreadsheet },
      { label: "Files", href: "/dashboard/files", icon: Files },
      { label: "Templates", href: "/dashboard/templates", icon: FolderKanban },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Workflows", href: "/dashboard/workflows", icon: Workflow },
      { label: "Approvals", href: "/dashboard/approvals", icon: ShieldCheck },
      { label: "E-signatures", href: null, icon: FileSignature, phase: 6 },
      { label: "Tasks", href: null, icon: CheckSquare2, phase: 7 },
      { label: "Calendar", href: null, icon: CalendarDays, phase: 7 },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Mail Center", href: "/dashboard/mail", icon: Mail },
      { label: "Contacts", href: "/dashboard/contacts", icon: Users },
      { label: "Voice Notes", href: "/dashboard/voice", icon: Mic },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Team", href: null, icon: Users, phase: 8 },
      { label: "Activity", href: null, icon: ShieldCheck, phase: 8 },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

const pageTitles: Array<[string, string]> = [
  ["/dashboard/workflows", "Workflows"],
  ["/dashboard/approvals", "Approvals"],
  ["/dashboard/templates", "Templates"],
  ["/dashboard/files", "Files"],
  ["/dashboard/sheets", "Sheets"],
  ["/dashboard/documents", "Documents"],
  ["/dashboard/mail", "Mail Center"],
  ["/dashboard/voice", "Voice Notes"],
  ["/dashboard/contacts", "Contacts"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard", "Workspace overview"],
];

interface OfficeKonnectShellProps {
  user: User;
  children: ReactNode;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onSignOut: () => Promise<void>;
}

export function OfficeKonnectShell({
  user,
  children,
  mobileOpen,
  onMobileOpenChange,
  onSignOut,
}: OfficeKonnectShellProps) {
  const location = useLocation();
  const workspace = useWorkspaceShell(user);
  const pageTitle =
    pageTitles.find(([prefix]) =>
      prefix === "/dashboard"
        ? location.pathname === "/dashboard" || location.pathname === "/dashboard/"
        : location.pathname.startsWith(prefix),
    )?.[1] ?? "OfficeKonnect";

  const isActive = (href: OfficeKonnectRoute) => {
    if (href === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname === "/dashboard/";
    }
    return location.pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-sm font-black tracking-tight text-slate-950 shadow-sm">
          OK
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-white">OfficeKonnect</p>
          <p className="text-[11px] text-slate-400">Office operations workspace</p>
        </div>
      </div>

      <div className="border-b border-slate-800 p-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Active workspace
        </p>
        {workspace.isLoading ? (
          <div className="h-10 animate-pulse rounded-lg bg-slate-800" />
        ) : workspace.workspaces.length > 0 ? (
          <Select
            value={workspace.activeWorkspaceId ?? undefined}
            onValueChange={(value) => void workspace.switchWorkspace(value)}
            disabled={workspace.isSwitching}
          >
            <SelectTrigger className="h-10 border-slate-700 bg-slate-900 text-left text-slate-100">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspace.workspaces.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{option.name}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {option.role}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            No workspace membership found for this identity.
          </div>
        )}
        {workspace.error && <p className="mt-2 px-2 text-[11px] text-red-300">{workspace.error}</p>}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  if (!item.href) {
                    return (
                      <div
                        key={item.label}
                        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600"
                        aria-disabled="true"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                          P{item.phase}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      to={item.href}
                      onClick={() => onMobileOpenChange(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        isActive(item.href)
                          ? "bg-white text-slate-950 shadow-sm"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <Sparkles className="h-4 w-4 text-violet-300" />
            Upgrade programme
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            PR #2 carries Phases 0–11. Main remains untouched until release-candidate approval.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <aside className="hidden w-72 shrink-0 flex-col bg-slate-950 lg:flex">{sidebarContent}</aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => onMobileOpenChange(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 shadow-2xl transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-3 z-10 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={() => onMobileOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>
        {sidebarContent}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 lg:hidden"
            onClick={() => onMobileOpenChange(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{pageTitle}</p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {workspace.activeWorkspace?.name ?? "OfficeKonnect workspace"}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              className="hidden h-9 w-64 justify-start gap-2 text-slate-500 md:flex"
              disabled
              title="Global command search is implemented in Phase 7"
            >
              <Search className="h-4 w-4" />
              <span className="text-xs">Search workspace</span>
              <span className="ml-auto text-[10px]">Phase 7</span>
            </Button>
            <Button variant="ghost" size="icon" disabled title="Notifications arrive in Phase 8">
              <Bell className="h-5 w-5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2">
                  <Avatar className="h-8 w-8 border">
                    <AvatarImage
                      src={
                        typeof user.user_metadata?.avatar_url === "string"
                          ? user.user_metadata.avatar_url
                          : undefined
                      }
                      alt={user.email ?? "OfficeKonnect user"}
                    />
                    <AvatarFallback>{user.email?.slice(0, 1).toUpperCase() ?? "U"}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">
                    {typeof user.user_metadata?.full_name === "string"
                      ? user.user_metadata.full_name
                      : "OfficeKonnect user"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  {workspace.activeWorkspace && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {workspace.activeWorkspace.name} · {workspace.activeWorkspace.role}
                    </p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void onSignOut()}
                  className="text-red-600 focus:text-red-600"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</div>
        </main>

        <nav className="grid h-16 shrink-0 grid-cols-4 border-t border-slate-200 bg-white lg:hidden dark:border-slate-800 dark:bg-slate-950">
          {[
            { label: "Home", href: "/dashboard" as const, icon: LayoutDashboard },
            { label: "Docs", href: "/dashboard/documents" as const, icon: FileText },
            { label: "Sheets", href: "/dashboard/sheets" as const, icon: FileSpreadsheet },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[10px] font-medium",
                  isActive(item.href) ? "text-primary" : "text-slate-500",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-500"
            onClick={() => onMobileOpenChange(true)}
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </nav>
      </section>
    </div>
  );
}

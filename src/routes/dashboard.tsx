import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Mail,
  Mic,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Bell,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Documents", href: "/dashboard/documents", icon: FileText },
  { name: "Mail Center", href: "/dashboard/mail", icon: Mail },
  { name: "Voice Notes", href: "/dashboard/voice", icon: Mic },
  { name: "Contacts", href: "/dashboard/contacts", icon: Users },
];

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname === "/dashboard/";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-6 dark:border-slate-800">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <span className="text-sm font-bold">OK</span>
            </div>
            <span className="text-lg font-bold tracking-tight">OfficeKonnect</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-slate-100 text-primary dark:bg-slate-800 dark:text-primary-foreground"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <Link
            to="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive("/dashboard/settings")
                ? "bg-slate-100 text-primary dark:bg-slate-800 dark:text-primary-foreground"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar (Drawer) */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm lg:hidden",
          isSidebarOpen ? "block" : "hidden"
        )}
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-white transition-transform duration-300 ease-in-out dark:bg-slate-900 lg:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">OK</span>
            </div>
            <span className="text-lg font-bold">OfficeKonnect</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="space-y-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => setIsSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-slate-100 text-primary dark:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
          <Link
            to="/dashboard/settings"
            onClick={() => setIsSidebarOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive("/dashboard/settings")
                ? "bg-slate-100 text-primary dark:bg-slate-800"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 lg:px-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden items-center rounded-md bg-slate-100 px-3 py-1.5 dark:bg-slate-800 sm:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="ml-2 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              <span className="ml-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                ⌘K
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border border-slate-200 dark:border-slate-800">
                    <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email ?? ""} />
                    <AvatarFallback>{user?.email?.[0].toUpperCase() ?? "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.user_metadata?.full_name ?? "User"}</p>
                    <p className="text-xs leading-none text-slate-500">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/settings">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/settings">Billing</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="flex h-16 items-center justify-around border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:hidden">
          {navItems.slice(0, 4).map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex flex-col items-center gap-1 text-[10px] font-medium transition-colors",
                isActive(item.href) ? "text-primary" : "text-slate-500"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex flex-col items-center gap-1 text-[10px] font-medium text-slate-500"
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}

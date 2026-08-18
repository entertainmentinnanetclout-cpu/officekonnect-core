import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfficeKonnectShell } from "@/components/officekonnect-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { createDevelopmentSession } from "@/lib/development-session.functions";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const attemptedDevelopmentBootstrap = useRef(false);
  const bootstrapDevelopmentSession = useServerFn(createDevelopmentSession);

  useEffect(() => {
    if (isLoading || user || attemptedDevelopmentBootstrap.current) return;

    attemptedDevelopmentBootstrap.current = true;
    setIsBootstrapping(true);

    const startGuestSession = async () => {
      // A Supabase anonymous identity is used only to establish a temporary shell.
      // Persistent artifact writes are rejected server-side for anonymous users.
      const { error: guestError } = await supabase.auth.signInAnonymously();
      if (!guestError) {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("officekonnect:guest-session", "true");
        }
        return;
      }

      // Fallback: server-minted development identity (used when guest sign-ins are disabled).
      const result = await bootstrapDevelopmentSession();
      if (result.status !== "ready") {
        setBootstrapMessage(
          result.status === "misconfigured" || result.status === "error"
            ? `${guestError.message}. ${result.message}`
            : guestError.message,
        );
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });

      if (error) {
        setBootstrapMessage(error.message);
        return;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("officekonnect:development-session", "true");
      }
    };

    void startGuestSession()
      .catch((error: unknown) => {
        setBootstrapMessage(
          error instanceof Error ? error.message : "Unable to start a guest workspace.",
        );
      })
      .finally(() => setIsBootstrapping(false));
  }, [bootstrapDevelopmentSession, isLoading, user]);

  const signOut = async () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("officekonnect:development-session");
      window.sessionStorage.removeItem("officekonnect:guest-session");
    }
    await supabase.auth.signOut();
  };

  if (isLoading || isBootstrapping) {
    return <WorkspaceBootScreen />;
  }

  if (!user) {
    return <UnauthenticatedWorkspace message={bootstrapMessage} />;
  }

  const isGuest = user.is_anonymous === true || !user.email;

  return (
    <OfficeKonnectShell
      user={user}
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
      onSignOut={signOut}
    >
      {isGuest && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <div>
            <p className="text-sm font-semibold">Guest — sign in to keep your work</p>
            <p className="mt-0.5 text-xs opacity-80">
              This is a temporary session. OfficeKonnect will not persist guest files or workspace
              artifacts to the backend.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link to="/auth/login">
              <LogIn className="mr-2 h-4 w-4" />
              Sign in
            </Link>
          </Button>
        </div>
      )}
      <Outlet />
    </OfficeKonnectShell>
  );
}

function WorkspaceBootScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-950 px-6 text-white">
      <div className="flex flex-col items-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-lg font-black tracking-tight text-slate-950 shadow-xl">
          OK
        </div>
        <p className="mt-5 text-sm font-semibold">Opening OfficeKonnect</p>
        <p className="mt-1 text-xs text-slate-400">
          Resolving secure identity and workspace access.
        </p>
        <Loader2 className="mt-5 h-5 w-5 animate-spin text-slate-400" />
      </div>
    </div>
  );
}

function UnauthenticatedWorkspace({ message }: { message: string | null }) {
  return (
    <div className="min-h-dvh bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl md:grid-cols-[1.1fr_0.9fr]">
          <div className="p-8 sm:p-12">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-sm font-black tracking-tight text-slate-950">
              OK
            </div>
            <h1 className="mt-8 max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
              Office operations, documents and approvals in one workspace.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Development access only skips the visible login step when a server-side development
              identity is configured. It never bypasses Supabase authentication, workspace
              membership or RLS.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link to="/auth/login">Sign in securely</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-slate-700 bg-transparent text-white hover:bg-slate-800"
              >
                <Link to="/">Back to site</Link>
              </Button>
            </div>
            {message && (
              <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
                Development bootstrap: {message}
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-950/70 p-8 md:border-l md:border-t-0 sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Identity model
            </p>
            <div className="mt-6 space-y-5">
              <div className="flex gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Real Supabase session</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Preview and local development use the same JWT identity model as production.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-400/10 text-violet-300">
                  <LockKeyhole className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">RLS remains authoritative</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Authenticated user and workspace identity remain server-backed, and Row Level
                    Security remains authoritative for every workspace request.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

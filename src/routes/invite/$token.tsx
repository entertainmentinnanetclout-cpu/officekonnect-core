import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { toastError } from "@/lib/errors";
import { acceptWorkspaceInvitationToken } from "@/lib/phase8.functions";

export const Route = createFileRoute("/invite/$token")({ component: WorkspaceInvitationPage });

const PENDING_INVITE_KEY = "officekonnect.pending-workspace-invite";

function WorkspaceInvitationPage() {
  const { token } = Route.useParams();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && token) localStorage.setItem(PENDING_INVITE_KEY, token);
  }, [user, token]);

  const accept = useMutation({
    mutationFn: () => acceptWorkspaceInvitationToken(token),
    onSuccess: async (result) => {
      localStorage.removeItem(PENDING_INVITE_KEY);
      await navigate({ to: "/dashboard/team", replace: true });
    },
    onError: (error) => toastError(error, "Could not accept workspace invitation"),
  });

  if (isLoading) {
    return <InviteShell><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></InviteShell>;
  }

  if (!user) {
    return (
      <InviteShell>
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950"><Building2 className="h-5 w-5" /></div>
            <CardTitle className="mt-3">Workspace invitation</CardTitle>
            <CardDescription>Sign in with the invited email address to verify and accept this secure OfficeKonnect invitation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full"><Link to="/auth/login">Sign in to continue</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link to="/auth/register">Create account</Link></Button>
            <p className="text-center text-xs text-muted-foreground">The invitation token is retained only in this browser until authentication completes.</p>
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><ShieldCheck className="h-5 w-5" /></div>
          <CardTitle className="mt-3">Accept workspace invitation</CardTitle>
          <CardDescription>Signed in as {user.email}. OfficeKonnect will verify that this invitation belongs to your authenticated email before adding membership.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Accept invitation
          </Button>
          <Button asChild variant="outline" className="w-full"><Link to="/dashboard">Go to dashboard</Link></Button>
        </CardContent>
      </Card>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">{children}</div>;
}

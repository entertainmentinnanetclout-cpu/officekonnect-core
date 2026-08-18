import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy" as "/")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy — OfficeKonnect" },
      {
        name: "description",
        content: "OfficeKonnect privacy information for users and workspace members.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <Button asChild variant="ghost" className="-ml-3 mb-8">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to OfficeKonnect
          </Link>
        </Button>

        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">OfficeKonnect</p>
            <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
          </div>
        </div>

        <div className="space-y-8 text-sm leading-7 text-muted-foreground sm:text-base">
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              How OfficeKonnect handles access
            </h2>
            <p className="mt-2">
              OfficeKonnect uses authenticated user identities and workspace membership to control
              access to workspace data. Application records remain subject to the product's
              server-side authorization and Row Level Security rules.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Workspace data</h2>
            <p className="mt-2">
              Documents, Sheets, files, workflows, signing records, tasks, notifications and other
              workspace resources are associated with the workspace and the authenticated users
              permitted to access them. Access may also depend on a user's workspace role or a
              specific workflow/signing assignment.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">External integrations</h2>
            <p className="mt-2">
              Optional third-party integrations operate only when they are configured for the
              relevant account or workspace. Integration status can be reviewed from authenticated
              settings where that provider connection is available.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Security-sensitive tokens</h2>
            <p className="mt-2">
              OfficeKonnect keeps privileged server credentials outside browser code. Signing and
              workspace-invitation flows use purpose-specific token/session boundaries rather than
              exposing privileged backend credentials to the client.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Account and workspace controls
            </h2>
            <p className="mt-2">
              Profile, workspace, team, notification, signature and other available controls can be
              reviewed from the authenticated OfficeKonnect settings and workspace administration
              surfaces. Some actions may be restricted when ownership, audit-retention or shared
              workspace requirements apply.
            </p>
          </section>

          <p className="border-t border-border pt-6 text-xs">
            This page describes the current OfficeKonnect product behavior. Institution-specific or
            contractual privacy terms may be added when a deployment requires them.
          </p>
        </div>
      </div>
    </main>
  );
}

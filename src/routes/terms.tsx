import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms" as "/")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms — OfficeKonnect" },
      {
        name: "description",
        content: "OfficeKonnect product terms and responsible-use information.",
      },
    ],
  }),
});

function TermsPage() {
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
            <FileCheck2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">OfficeKonnect</p>
            <h1 className="text-3xl font-bold tracking-tight">Terms</h1>
          </div>
        </div>

        <div className="space-y-8 text-sm leading-7 text-muted-foreground sm:text-base">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Use of the workspace</h2>
            <p className="mt-2">
              OfficeKonnect is a connected office workspace. Users must access only workspaces and
              records for which their authenticated identity and assigned role provide permission.
              Attempts to bypass workspace permissions, signing controls or server-authoritative
              workflow states are not permitted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Content and records</h2>
            <p className="mt-2">
              Users remain responsible for the documents, messages, contacts, files and other
              content they create or upload, including ensuring they have authority to process and
              share that information. Workspace audit and version records may be retained where the
              product requires them for integrity or operational history.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Electronic signing</h2>
            <p className="mt-2">
              Signing requests use explicit participant assignments, consent, immutable source
              versions and audit records. Users should verify the document and their authority to
              sign or approve before completing an electronic-signing action.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Third-party services</h2>
            <p className="mt-2">
              Optional integrations may depend on external providers and their availability. A
              provider is not treated as connected until OfficeKonnect has a real configured
              integration state for the authenticated account or workspace.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Workspace administration</h2>
            <p className="mt-2">
              Owners and administrators may have additional responsibilities for membership,
              invitations, roles and workspace settings. Ownership-sensitive actions can be
              restricted to protect shared-workspace continuity and audit requirements.
            </p>
          </section>

          <p className="border-t border-border pt-6 text-xs">
            These are product-level terms for the current OfficeKonnect workspace. Deployment- or
            institution-specific commercial/legal terms may be added under the applicable contract.
          </p>
        </div>
      </div>
    </main>
  );
}

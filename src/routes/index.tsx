import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  PenTool,
  Mail,
  Mic,
  Users,
  Shield,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "OfficeKonnect — Documents, Signatures & Bulk Email for Modern Teams" },
      {
        name: "description",
        content:
          "OfficeKonnect is the all-in-one workspace for smart documents, legally binding e-signatures, branded letterheads, personalised bulk email and voice-to-text — built for productive offices.",
      },
      { property: "og:title", content: "OfficeKonnect — One workspace for every office task" },
      {
        property: "og:description",
        content:
          "Documents, signatures, letterheads, bulk email, contacts and voice notes — unified, secure, and fast.",
      },
    ],
  }),
});

const modules = [
  {
    icon: FileText,
    name: "Smart Documents",
    desc: "Upload, convert, version and share PDFs, Word and images with a single source of truth.",
  },
  {
    icon: PenTool,
    name: "E-Signatures",
    desc: "Request and apply legally binding signatures with full audit trails and field placement.",
  },
  {
    icon: Mail,
    name: "Mail Center",
    desc: "Send personalised bulk campaigns via Brevo with live open, click and bounce analytics.",
  },
  {
    icon: Users,
    name: "Contacts & Groups",
    desc: "Import, segment and sync contacts. Build the right list for every campaign.",
  },
  {
    icon: Mic,
    name: "Voice Notes",
    desc: "Record meetings on any device. Get transcripts in seconds with Whisper-grade accuracy.",
  },
  {
    icon: Shield,
    name: "Workspace Security",
    desc: "Row-level security, role-based access, audit logs and encrypted integrations by default.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">
              O
            </div>
            <span className="text-base font-semibold tracking-tight">OfficeKonnect</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#security" className="hover:text-foreground">
              Security
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Connected office workspace
            </div>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              One workspace for every <span className="text-primary">office task</span>.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Documents, Sheets, files, workflows, approvals, e-signatures, tasks, calendar, search,
              notifications and office communication — unified in one secure workspace for modern
              teams.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth/register">
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth/login">Sign in</Link>
              </Button>
            </div>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Free workspace included",
                "No credit card required",
                "Brevo & OpenAI ready",
                "Workspace-level security",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Mock product card */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-3xl"
              style={{
                background:
                  "linear-gradient(140deg, color-mix(in oklab, var(--primary) 22%, transparent), transparent 60%)",
                filter: "blur(20px)",
              }}
            />
            <div className="rounded-2xl border border-border bg-card p-3 shadow-xl">
              <div className="rounded-xl bg-muted/40 p-4">
                <div className="mb-4 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                </div>
                <div className="grid gap-3">
                  {modules.slice(0, 4).map((m) => (
                    <div
                      key={m.name}
                      className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <m.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{m.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Everything in one place
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Six modules. Zero context switching.
            </h2>
            <p className="mt-3 text-muted-foreground">
              OfficeKonnect replaces the scattered tools your team uses today — with shared data,
              shared permissions and a consistent UI.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m.name}
                className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <m.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold">{m.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                How it works
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Set up your workspace in under a minute.
              </h2>
              <p className="mt-3 text-muted-foreground">
                Sign up, invite your team, and connect Brevo for email or OpenAI for transcription.
                Everything else is already wired.
              </p>
            </div>
            <ol className="space-y-5">
              {[
                {
                  t: "Create your workspace",
                  d: "Personal workspace is provisioned automatically on sign-up.",
                },
                {
                  t: "Upload or import",
                  d: "Drop documents, import contacts via CSV, or record a voice note.",
                },
                {
                  t: "Send, sign, ship",
                  d: "Send a campaign, request a signature, export a transcript — all from one place.",
                },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-4 rounded-xl border border-border bg-card p-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-medium">{s.t}</p>
                    <p className="text-sm text-muted-foreground">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="rounded-3xl border border-border bg-card p-8 sm:p-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <Shield className="h-3.5 w-3.5" /> Security & Privacy
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  Built on row-level security, audit logs and encrypted integrations.
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Every workspace is isolated. Every action is logged. Every third-party token is
                  stored encrypted. You stay in control.
                </p>
              </div>
              <Button asChild size="lg">
                <Link to="/auth/register">
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} OfficeKonnect. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link to="/auth/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link to="/auth/register" className="hover:text-foreground">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

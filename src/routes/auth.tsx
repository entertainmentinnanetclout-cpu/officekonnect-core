import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { FileCheck2, ShieldCheck, Workflow } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

const capabilities = [
  {
    icon: FileCheck2,
    title: "Document operations",
    description:
      "Create, manage, review and finalize office documents from one governed workspace.",
  },
  {
    icon: Workflow,
    title: "Controlled workflows",
    description: "Route work through structured review, approval and signing state machines.",
  },
  {
    icon: ShieldCheck,
    title: "Workspace security",
    description:
      "Supabase identity, membership and row-level security remain authoritative throughout.",
  },
];

function AuthLayout() {
  return (
    <div className="min-h-dvh bg-slate-950 text-white">
      <div className="mx-auto grid min-h-dvh w-full max-w-[1600px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-slate-800 px-10 py-12 lg:flex lg:flex-col xl:px-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(139,92,246,0.16),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(14,165,233,0.10),transparent_30%)]" />

          <div className="relative z-10">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-sm font-black tracking-tight text-slate-950 shadow-lg">
                OK
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">OfficeKonnect</p>
                <p className="text-[11px] text-slate-500">Office operations workspace</p>
              </div>
            </Link>
          </div>

          <div className="relative z-10 my-auto max-w-2xl py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              One governed workspace
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.035em] text-white xl:text-5xl">
              Move office work from draft to decision without losing control of the record.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-400">
              OfficeKonnect brings documents, communication, approvals and secure e-signatures into
              a single workspace built around real identity, auditability and operational
              continuity.
            </p>

            <div className="mt-10 grid gap-4">
              {capabilities.map((capability) => {
                const Icon = capability.icon;
                return (
                  <div
                    key={capability.title}
                    className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-100">{capability.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {capability.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="relative z-10 text-[11px] leading-5 text-slate-600">
            Development access can skip the visible login step only by creating a real Supabase
            session. No fake identity or RLS bypass is used.
          </p>
        </section>

        <section className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Link to="/" className="inline-flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-sm font-black tracking-tight text-white dark:bg-white dark:text-slate-950">
                  OK
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight">OfficeKonnect</p>
                  <p className="text-[11px] text-slate-500">Office operations workspace</p>
                </div>
              </Link>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <Outlet />
            </div>

            <p className="mt-6 text-center text-[11px] leading-5 text-slate-500">
              Authentication is handled by Supabase. Workspace access remains subject to membership
              and row-level security.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

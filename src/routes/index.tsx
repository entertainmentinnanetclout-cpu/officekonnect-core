import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
        OfficeKonnect
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
        The all-in-one professional productivity platform for documents,
        signatures, and personalized bulk emails.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          to="/auth/login"
          className="rounded-md bg-primary px-6 py-3 text-lg font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          Get Started
        </Link>
        <Link
          to="/pricing"
          className="rounded-md border border-slate-200 bg-white px-6 py-3 text-lg font-medium hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
        >
          Pricing
        </Link>
      </div>
    </div>
  );
}

import { Link } from "@tanstack/react-router";

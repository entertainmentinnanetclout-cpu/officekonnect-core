import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <span className="text-2xl font-bold">OK</span>
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            OfficeKonnect
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Professional Office Productivity Platform
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="outlet-container">
            <style>{`
              .outlet-container > * {
                animation: fadeIn 0.3s ease-in-out;
              }
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            {/* The nested routes will render here */}
            {/* Note: In TanStack Router, we don't necessarily need <Outlet /> if we want to wrap components,
                but for layout routes we should use it. */}
            <div className="mt-4">
              {/* @ts-ignore - Temporary until we have sub-routes */}
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to make Outlet available
import { Outlet } from "@tanstack/react-router";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { exchangeExternalSigningToken } from "@/lib/external-signing";

export const Route = createFileRoute("/sign/$token")({ component: ExternalSigningExchange });

const SESSION_KEY = "officekonnect.signing.session";

function ExternalSigningExchange() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void exchangeExternalSigningToken(token)
      .then(async ({ sessionToken, sessionExpiresAt }) => {
        if (!sessionToken) throw new Error("Signing session could not be created");
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ sessionToken, sessionExpiresAt }));
        await navigate({ to: "/sign/active", replace: true });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "This signing invitation is invalid or expired",
        ),
      );
  }, [token, navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-950">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">OfficeKonnect secure signing</h1>
        {error ? (
          <>
            <p className="mt-3 text-sm text-red-300">{error}</p>
            <p className="mt-3 text-xs text-slate-500">
              Ask the sender to rotate your invitation if you need a new secure link.
            </p>
          </>
        ) : (
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Exchanging invitation for a short-lived signing session…
          </div>
        )}
      </div>
    </div>
  );
}

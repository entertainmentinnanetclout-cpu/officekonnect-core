import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import type { Database } from "@/integrations/supabase/types";

export type DevelopmentSessionResult =
  | { status: "disabled" }
  | { status: "misconfigured"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      accessToken: string;
      refreshToken: string;
      expiresAt: number | null;
      userId: string;
      email: string | null;
    };

/**
 * Bootstrap a real Supabase development identity without exposing development
 * credentials to the browser. This is intentionally disabled on Vercel
 * production deployments even when the feature flag is accidentally present.
 *
 * The returned access/refresh tokens are normal Supabase session credentials;
 * all application queries therefore continue to use auth.uid(), workspace
 * membership and the production RLS policies.
 */
export const createDevelopmentSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<DevelopmentSessionResult> => {
    const enabled = process.env.OFFICEKONNECT_DEV_ACCESS === "true";
    const vercelEnvironment = process.env.VERCEL_ENV;
    const productionDeployment = vercelEnvironment
      ? vercelEnvironment === "production"
      : process.env.NODE_ENV === "production";

    if (!enabled || productionDeployment) {
      return { status: "disabled" };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const email = process.env.OFFICEKONNECT_DEV_EMAIL;
    const password = process.env.OFFICEKONNECT_DEV_PASSWORD;

    const missing = [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ...(!email ? ["OFFICEKONNECT_DEV_EMAIL"] : []),
      ...(!password ? ["OFFICEKONNECT_DEV_PASSWORD"] : []),
    ];

    if (missing.length > 0) {
      return {
        status: "misconfigured",
        message: `Development access is enabled but missing: ${missing.join(", ")}`,
      };
    }

    const supabase = createClient<Database>(supabaseUrl!, publishableKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storage: undefined,
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email!,
      password: password!,
    });

    if (error || !data.session || !data.user) {
      return {
        status: "error",
        message: error?.message ?? "Supabase did not return a development session.",
      };
    }

    return {
      status: "ready",
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? null,
      userId: data.user.id,
      email: data.user.email ?? null,
    };
  },
);

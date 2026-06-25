import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.JOBS_TICK_SECRET;
        const provided = request.headers.get("x-jobs-secret");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { dispatchJob } = await import("@/lib/jobs/worker.server");

        const { data: jobs, error } = await supabaseAdmin.rpc("claim_jobs", {
          p_kinds: null,
          p_limit: 5,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!jobs || jobs.length === 0) return Response.json({ processed: 0 });

        await Promise.all(
          (jobs as unknown as Parameters<typeof dispatchJob>[0][]).map((j) => dispatchJob(j)),
        );
        return Response.json({ processed: jobs.length });
      },
    },
  },
});

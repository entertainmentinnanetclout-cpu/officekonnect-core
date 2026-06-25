import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Brevo posts events here. We accept either x-brevo-signature (HMAC-sha256 over the raw body)
// or a shared-secret token header, configured via BREVO_WEBHOOK_SECRET.
export const Route = createFileRoute("/api/public/brevo-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.BREVO_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const body = await request.text();
        const sigHeader = request.headers.get("x-brevo-signature");
        let ok = false;
        if (sigHeader) {
          const expected = createHmac("sha256", secret).update(body).digest("hex");
          const a = Buffer.from(sigHeader);
          const b = Buffer.from(expected);
          ok = a.length === b.length && timingSafeEqual(a, b);
        } else if (request.headers.get("x-webhook-token") === secret) {
          ok = true;
        }
        if (!ok) return new Response("Invalid signature", { status: 401 });

        const events = JSON.parse(body) as Array<{
          event?: string;
          "message-id"?: string;
          email?: string;
        }>;
        const list = Array.isArray(events) ? events : [events];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const ev of list) {
          const messageId = ev["message-id"];
          if (!messageId) continue;
          const status =
            ev.event === "delivered"
              ? "delivered"
              : ev.event === "soft_bounce" || ev.event === "hard_bounce"
                ? "bounced"
                : ev.event === "spam"
                  ? "complained"
                  : null;
          const update: Record<string, unknown> = {};
          if (status) update.delivery_status = status;
          if (ev.event === "opened" || ev.event === "unique_opened") update.opened = true;
          if (ev.event === "click") update.clicked = true;
          if (Object.keys(update).length === 0) continue;

          await supabaseAdmin
            .from("campaign_recipients")
            .update(update as never)
            .eq("message_id", messageId);
        }
        return Response.json({ ok: true });
      },
    },
  },
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey)
    return response({ error: "Signing actions are not configured" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.match(/^Bearer\s+\S+/i))
    return response({ error: "Authorization required" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: "Invalid authentication" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return response({ error: "Invalid JSON body" }, 400);
  }

  const action = input?.action;
  if (typeof action !== "string") return response({ error: "action is required" }, 400);

  try {
    if (action === "send") {
      const requestId = String(input?.requestId ?? "");
      const expiresAt = input?.expiresAt ?? null;
      const { data, error } = await userClient.rpc("send_signing_request", {
        p_request_id: requestId,
        p_expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);

      const invitations = Array.isArray(data?.invitations) ? [...data.invitations] : [];
      const { data: ccParticipants, error: ccError } = await userClient
        .from("signing_participants")
        .select("id,user_id,email,full_name,role")
        .eq("request_id", requestId)
        .eq("role", "cc")
        .is("user_id", null);
      if (ccError) throw new Error(ccError.message);

      for (const participant of ccParticipants ?? []) {
        const { data: invitation, error: rotateError } = await userClient.rpc(
          "rotate_signing_invitation",
          {
            p_participant_id: participant.id,
            p_expires_at: expiresAt,
          },
        );
        if (rotateError) throw new Error(rotateError.message);
        invitations.push(invitation);
      }

      return response({ request: data?.request, invitations });
    }

    if (action === "rotate") {
      const { data, error } = await userClient.rpc("rotate_signing_invitation", {
        p_participant_id: input?.participantId,
        p_expires_at: input?.expiresAt ?? null,
      });
      if (error) throw new Error(error.message);
      return response({ invitation: data });
    }

    if (action === "viewed") {
      const { data, error } = await userClient.rpc("mark_signing_participant_viewed", {
        p_participant_id: input?.participantId,
      });
      if (error) throw new Error(error.message);
      return response({ participant: data });
    }

    if (action === "complete") {
      if (!Array.isArray(input?.fieldValues)) throw new Error("fieldValues must be an array");
      const { data: completion, error } = await userClient.rpc("complete_signing_participant", {
        p_participant_id: input?.participantId,
        p_field_values: input.fieldValues,
        p_consent_text_version: String(input?.consentTextVersion ?? "").trim(),
      });
      if (error) throw new Error(error.message);

      let finalization: unknown = null;
      if (completion?.finalizationQueued) {
        const { data, error: finalizationError } = await service.functions.invoke(
          "signing-finalize",
          {
            body: { requestId: completion?.request?.id },
          },
        );
        if (finalizationError) throw new Error(finalizationError.message);
        finalization = data;
      }
      return response({ completion, finalization });
    }

    if (action === "decline") {
      const { data, error } = await userClient.rpc("decline_signing_participant", {
        p_participant_id: input?.participantId,
        p_reason: String(input?.reason ?? "").trim(),
      });
      if (error) throw new Error(error.message);
      return response({ request: data });
    }

    if (action === "cancel") {
      const { data, error } = await userClient.rpc("cancel_signing_request", {
        p_request_id: input?.requestId,
        p_reason: String(input?.reason ?? "").trim(),
      });
      if (error) throw new Error(error.message);
      return response({ request: data });
    }

    if (action === "finalize") {
      const { data, error } = await userClient.functions.invoke("signing-finalize", {
        body: { requestId: input?.requestId },
      });
      if (error) throw new Error(error.message);
      return response({ finalization: data });
    }

    return response({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signing operation failed";
    return response({ error: message }, 400);
  }
});

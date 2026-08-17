import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
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
      "Referrer-Policy": "no-referrer",
    },
  });
}

function randomHex(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprint(value: string, secret: string): Promise<string> {
  if (!value) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    ""
  );
}

function decodeSignature(
  value: string,
  explicitMime?: string,
): { bytes: Uint8Array; mime: string; extension: string } {
  let encoded = value;
  let mime = explicitMime ?? "image/png";
  const match = value.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
  if (match) {
    mime = match[1].toLowerCase();
    encoded = match[2];
  }
  if (!/^(image\/png|image\/jpeg)$/i.test(mime)) {
    throw new Error("Only PNG and JPEG signature images are accepted");
  }
  const binary = atob(encoded.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error("Signature image must be between 1 byte and 2 MB");
  }
  return { bytes, mime, extension: mime.toLowerCase() === "image/jpeg" ? "jpg" : "png" };
}

async function signedAssetUrl(
  client: any,
  pathOrUrl: string | null | undefined,
  expiresIn = 300,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  for (const bucket of ["document-versions", "documents", "exports"]) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(pathOrUrl, expiresIn);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey)
    return response({ error: "External signing is not configured" }, 500);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const ipHash = await fingerprint(clientIp(req), serviceKey);
  const userAgentHash = await fingerprint(req.headers.get("user-agent") ?? "", serviceKey);

  let input: any;
  try {
    input = await req.json();
  } catch {
    return response({ error: "Invalid JSON body" }, 400);
  }

  const action = input?.action;
  if (typeof action !== "string") return response({ error: "action is required" }, 400);

  try {
    if (action === "exchange") {
      const token = String(input?.token ?? "").trim();
      if (!/^[0-9a-f]{64}$/i.test(token)) throw new Error("Invitation token is invalid");
      const sessionToken = randomHex(32);
      const tokenHash = await sha256Hex(token.toLowerCase());
      const sessionHash = await sha256Hex(sessionToken);
      const sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { data: exchange, error: exchangeError } = await service.rpc("exchange_signing_token", {
        p_token_hash: tokenHash,
        p_session_hash: sessionHash,
        p_session_expires_at: sessionExpiresAt,
        p_ip_hash: ipHash,
        p_user_agent_hash: userAgentHash,
      });
      if (exchangeError) throw new Error(exchangeError.message);
      const { data: payload, error: payloadError } = await service.rpc(
        "get_signing_session_payload",
        {
          p_session_hash: sessionHash,
        },
      );
      if (payloadError) throw new Error(payloadError.message);
      const sourceRef = payload?.source?.storagePath || payload?.source?.fileUrl;
      return response({
        sessionToken,
        sessionExpiresAt: exchange?.sessionExpiresAt,
        scope: exchange?.scope,
        payload: { ...payload, sourceUrl: await signedAssetUrl(service, sourceRef) },
      });
    }

    const sessionToken = String(input?.sessionToken ?? "").trim();
    if (!/^[0-9a-f]{64}$/i.test(sessionToken)) throw new Error("Signing session is required");
    const sessionHash = await sha256Hex(sessionToken.toLowerCase());

    if (action === "payload") {
      const { data: payload, error } = await service.rpc("get_signing_session_payload", {
        p_session_hash: sessionHash,
      });
      if (error) throw new Error(error.message);
      const sourceRef = payload?.source?.storagePath || payload?.source?.fileUrl;
      return response({
        payload: { ...payload, sourceUrl: await signedAssetUrl(service, sourceRef) },
      });
    }

    if (action === "upload_signature") {
      const fieldId = String(input?.fieldId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(fieldId)) throw new Error("A valid signature field is required");
      const { data: payload, error: payloadError } = await service.rpc(
        "get_signing_session_payload",
        { p_session_hash: sessionHash },
      );
      if (payloadError) throw new Error(payloadError.message);
      const field = (payload?.fields ?? []).find((candidate: any) => candidate.id === fieldId);
      if (!field || !["signature", "initial"].includes(field.type)) {
        throw new Error("This field does not accept a signature image");
      }
      const decoded = decodeSignature(String(input?.imageBase64 ?? ""), input?.mimeType);
      const { data: requestRow, error: requestError } = await service
        .from("signing_requests")
        .select("workspace_id")
        .eq("id", payload.request.id)
        .single();
      if (requestError || !requestRow) throw new Error("Signing request could not be resolved");
      const path = `${requestRow.workspace_id}/requests/${payload.request.id}/${payload.participant.id}/${fieldId}-${randomHex(8)}.${decoded.extension}`;
      const { error: uploadError } = await service.storage
        .from("signatures")
        .upload(path, decoded.bytes, {
          contentType: decoded.mime,
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);
      return response({ signatureStoragePath: path });
    }

    if (action === "complete") {
      const fieldValues = input?.fieldValues;
      if (!Array.isArray(fieldValues)) throw new Error("fieldValues must be an array");
      const consentTextVersion = String(input?.consentTextVersion ?? "").trim();
      const { data: completion, error } = await service.rpc("complete_external_signing_session", {
        p_session_hash: sessionHash,
        p_field_values: fieldValues,
        p_consent_text_version: consentTextVersion,
        p_ip_hash: ipHash,
        p_user_agent_hash: userAgentHash,
      });
      if (error) throw new Error(error.message);

      let finalization: any = null;
      if (completion?.finalizationQueued) {
        const { data, error: finalizationError } = await service.functions.invoke(
          "signing-finalize",
          {
            body: { requestId: completion?.request?.id },
          },
        );
        if (finalizationError) throw new Error(finalizationError.message);
        finalization = data;
        if (finalization?.finalExportPath) {
          finalization.finalDownloadUrl = await signedAssetUrl(
            service,
            finalization.finalExportPath,
            600,
          );
        }
        if (finalization?.certificatePath) {
          finalization.certificateDownloadUrl = await signedAssetUrl(
            service,
            finalization.certificatePath,
            600,
          );
        }
      }
      return response({ completion, finalization });
    }

    if (action === "decline") {
      const reason = String(input?.reason ?? "").trim();
      const { data, error } = await service.rpc("decline_external_signing_session", {
        p_session_hash: sessionHash,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
      return response({ request: data });
    }

    return response({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "External signing operation failed";
    return response({ error: message }, 400);
  }
});

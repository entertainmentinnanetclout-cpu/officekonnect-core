import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function downloadFromBuckets(client: any, path: string, buckets: string[]): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(path)) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Unable to fetch source asset (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
  for (const bucket of buckets) {
    const { data, error } = await client.storage.from(bucket).download(path);
    if (!error && data) return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error("Storage asset was not found in the permitted buckets");
}

function wrapText(value: string, max = 88): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= max) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function buildCertificate(payload: any, sourceHash: string, finalHash: string): Promise<{ bytes: Uint8Array; manifest: any }> {
  const generatedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    requestId: payload.request.id,
    workspaceId: payload.request.workspaceId,
    documentId: payload.request.documentId,
    sourceDocumentVersionId: payload.request.sourceDocumentVersionId,
    title: payload.request.title,
    generatedAt,
    participantsHash: payload.request.participantsHash,
    fieldsHash: payload.request.fieldsHash,
    sourceSha256: sourceHash,
    finalSha256: finalHash,
    participants: payload.participants,
    eventChain: payload.events,
  };

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 795;
  const drawLine = (text: string, size = 9, isBold = false) => {
    if (y < 55) { page = pdf.addPage([595.28, 841.89]); y = 795; }
    page.drawText(text, { x: 45, y, size, font: isBold ? bold : font, color: rgb(0.08, 0.12, 0.2) });
    y -= size + 5;
  };

  drawLine("OfficeKonnect Signing Certificate", 17, true);
  y -= 5;
  for (const line of wrapText(`Document: ${payload.request.title}`)) drawLine(line, 10, true);
  drawLine(`Request ID: ${payload.request.id}`);
  drawLine(`Generated: ${generatedAt}`);
  drawLine(`Source SHA-256: ${sourceHash}`, 8);
  drawLine(`Final SHA-256: ${finalHash}`, 8);
  drawLine(`Participants configuration: ${payload.request.participantsHash}`, 8);
  drawLine(`Fields configuration: ${payload.request.fieldsHash}`, 8);
  y -= 8;
  drawLine("Participants", 12, true);
  for (const participant of payload.participants ?? []) {
    const identity = participant.fullName || participant.email || participant.id;
    for (const line of wrapText(`${identity} — ${participant.role} — ${participant.status} — completed ${participant.signedAt ?? "not applicable"}`, 82)) {
      drawLine(line, 8);
    }
  }
  y -= 8;
  drawLine("Audit events", 12, true);
  for (const event of payload.events ?? []) {
    for (const line of wrapText(`${event.createdAt} — ${event.eventType} — ${event.eventHash ?? "pending hash"}`, 82)) {
      drawLine(line, 7.5);
    }
  }
  return { bytes: new Uint8Array(await pdf.save()), manifest };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Signing finalizer is not configured" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "Authorization required" }, 401);

  let input: any;
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const requestId = input?.requestId;
  if (typeof requestId !== "string") return json({ error: "requestId is required" }, 400);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const isServiceCaller = bearer === serviceKey;
  if (!isServiceCaller) {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid authentication" }, 401);
    const { data: requestRow, error: requestError } = await userClient
      .from("signing_requests").select("id,sender_id").eq("id", requestId).single();
    if (requestError || !requestRow || requestRow.sender_id !== userData.user.id) {
      return json({ error: "Only the request sender may start finalization" }, 403);
    }
  }

  let claimed = false;
  try {
    const { data: payload, error: claimError } = await service.rpc("claim_signing_finalization", { p_request_id: requestId });
    if (claimError) throw new Error(claimError.message);
    claimed = true;

    const sourceRef = payload?.source?.storagePath || payload?.source?.fileUrl;
    if (!sourceRef) throw new Error("Immutable source PDF reference is missing");
    const sourceBytes = await downloadFromBuckets(service, sourceRef, ["documents", "document-versions", "exports"]);
    const sourceHash = await sha256Hex(sourceBytes);
    const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const field of payload.fields ?? []) {
      const pageIndex = Number(field.page) - 1;
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
        throw new Error(`Signing field ${field.id} references an invalid page`);
      }
      const page = pdf.getPage(pageIndex);
      const { width, height } = page.getSize();
      const x = Number(field.x) * width;
      const boxWidth = Number(field.w) * width;
      const boxHeight = Number(field.h) * height;
      const y = height - Number(field.y) * height - boxHeight;
      const rotation = degrees(Number(field.rotation ?? 0));

      if (field.type === "signature" || field.type === "initial") {
        if (!field.signatureStoragePath) throw new Error(`Signature image missing for required field ${field.id}`);
        const imageBytes = await downloadFromBuckets(service, field.signatureStoragePath, ["signatures"]);
        let image;
        try { image = await pdf.embedPng(imageBytes); }
        catch { image = await pdf.embedJpg(imageBytes); }
        page.drawImage(image, { x, y, width: boxWidth, height: boxHeight, rotate: rotation });
      } else {
        const value = String(field.value ?? "");
        page.drawText(value, {
          x: x + 2,
          y: y + Math.max(2, boxHeight / 2 - 5),
          size: Math.min(11, Math.max(7, boxHeight * 0.42)),
          font,
          color: rgb(0.05, 0.08, 0.13),
          rotate: rotation,
          maxWidth: Math.max(4, boxWidth - 4),
        });
      }
    }

    const finalBytes = new Uint8Array(await pdf.save());
    const finalHash = await sha256Hex(finalBytes);
    const { bytes: certificateBytes, manifest } = await buildCertificate(payload, sourceHash, finalHash);
    const certificateHash = await sha256Hex(certificateBytes);
    const workspaceId = payload.request.workspaceId;
    const basePath = `${workspaceId}/signing/${requestId}`;
    const finalPath = `${basePath}/completed-${finalHash.slice(0, 16)}.pdf`;
    const certificatePath = `${basePath}/certificate-${certificateHash.slice(0, 16)}.pdf`;

    const finalUpload = await service.storage.from("exports").upload(finalPath, finalBytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (finalUpload.error) throw new Error(finalUpload.error.message);
    const certUpload = await service.storage.from("exports").upload(certificatePath, certificateBytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (certUpload.error) throw new Error(certUpload.error.message);

    const { data: completed, error: completeError } = await service.rpc("complete_signing_finalization", {
      p_request_id: requestId,
      p_source_sha256: sourceHash,
      p_final_export_path: finalPath,
      p_final_export_sha256: finalHash,
      p_certificate_path: certificatePath,
      p_certificate_sha256: certificateHash,
      p_manifest: manifest,
    });
    if (completeError) throw new Error(completeError.message);

    return json({ request: completed, finalExportPath: finalPath, finalSha256: finalHash, certificatePath, certificateSha256: certificateHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown finalization error";
    if (claimed) {
      await service.rpc("fail_signing_finalization", {
        p_request_id: requestId,
        p_error: { message, failedAt: new Date().toISOString() },
      });
    }
    return json({ error: message }, 400);
  }
});
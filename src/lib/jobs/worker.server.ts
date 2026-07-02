// Per-kind job handlers. Server-only. Dispatched by /api/public/jobs-tick.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Job = {
  id: string;
  workspace_id: string;
  created_by: string;
  kind: string;
  input: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  entity_type: string | null;
  entity_id: string | null;
};

async function notify(workspaceId: string, userId: string | null, title: string, body: string, kind: string) {
  await supabaseAdmin.from("notifications").insert({
    workspace_id: workspaceId,
    user_id: userId,
    kind: kind as never,
    title,
    body,
  });
}

async function markSucceeded(jobId: string, output: Record<string, unknown>) {
  await supabaseAdmin
    .from("jobs")
    .update({
      status: "succeeded",
      output: output as never,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function markFailed(job: Job, error: string) {
  const finalFail = job.attempts >= job.max_attempts;
  await supabaseAdmin
    .from("jobs")
    .update({
      status: finalFail ? "failed" : "queued",
      error,
      scheduled_for: finalFail
        ? undefined
        : new Date(Date.now() + Math.pow(2, job.attempts) * 5000).toISOString(),
      finished_at: finalFail ? new Date().toISOString() : null,
    })
    .eq("id", job.id);
  if (finalFail) {
    await notify(job.workspace_id, job.created_by, `Job failed: ${job.kind}`, error, "job_failed");
  }
}

// ---------------- handlers ----------------

async function handleAudioTranscribe(job: Job) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const voiceNoteId = job.input.voiceNoteId as string;
  const { data: vn, error } = await supabaseAdmin
    .from("voice_notes")
    .select("audio_url, storage_path")
    .eq("id", voiceNoteId)
    .single();
  if (error || !vn) throw new Error(error?.message || "voice note not found");

  let audioUrl = vn.audio_url;
  if (vn.storage_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("voice-notes")
      .createSignedUrl(vn.storage_path, 600);
    if (signed?.signedUrl) audioUrl = signed.signedUrl;
  }

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`fetch audio ${audioRes.status}`);
  const blob = await audioRes.blob();
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", "whisper-1");

  const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!wRes.ok) throw new Error(`whisper ${wRes.status}: ${await wRes.text()}`);
  const result = (await wRes.json()) as { text: string };

  await supabaseAdmin
    .from("voice_notes")
    .update({ transcript: result.text })
    .eq("id", voiceNoteId);

  await notify(job.workspace_id, job.created_by, "Transcript ready", "Your voice note has been transcribed.", "voice_transcribed");
  return { text: result.text };
}

async function handleEmailCampaignSend(job: Job) {
  const apiKey = process.env.BREVO_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "OfficeKonnect";
  if (!apiKey || !lovableKey || !sender) throw new Error("Brevo not configured");

  const campaignId = job.input.campaignId as string;
  const { data: campaign } = await supabaseAdmin
    .from("email_campaigns")
    .select("*, email_templates(*)")
    .eq("id", campaignId)
    .single();
  if (!campaign?.email_templates) throw new Error("campaign or template missing");

  const { data: recipients } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id, contact_id, contacts(email, first_name, last_name)")
    .eq("campaign_id", campaignId)
    .eq("delivery_status", "pending");

  const tpl = campaign.email_templates as { subject: string; html_body: string };
  let sent = 0;
  let failed = 0;
  for (const rec of recipients ?? []) {
    const contact = (rec as unknown as { contacts: { email: string | null; first_name: string | null; last_name: string | null } | null }).contacts;
    if (!contact?.email) {
      await supabaseAdmin.from("campaign_recipients").update({ delivery_status: "failed" }).eq("id", rec.id);
      failed++;
      continue;
    }
    const personalizedHtml = tpl.html_body
      .replaceAll("{{first_name}}", contact.first_name ?? "")
      .replaceAll("{{last_name}}", contact.last_name ?? "")
      .replaceAll("{{email}}", contact.email);

    const res = await fetch("https://connector-gateway.lovable.dev/brevo/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: sender },
        to: [{ email: contact.email }],
        subject: tpl.subject,
        htmlContent: personalizedHtml,
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { messageId?: string };
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          message_id: body.messageId ?? null,
        })
        .eq("id", rec.id);
      sent++;
    } else {
      await supabaseAdmin.from("campaign_recipients").update({ delivery_status: "failed" }).eq("id", rec.id);
      failed++;
    }
  }

  await supabaseAdmin
    .from("email_campaigns")
    .update({ campaign_status: "completed", emails_sent: sent })
    .eq("id", campaignId);

  await notify(
    job.workspace_id,
    job.created_by,
    "Campaign complete",
    `${sent} sent, ${failed} failed`,
    "campaign_complete",
  );
  return { sent, failed };
}

async function handleSignatureApply(job: Job) {
  const { PDFDocument } = await import("pdf-lib");
  const documentId = job.input.documentId as string;
  const signatureId = job.input.signatureId as string;
  const page = Number(job.input.page ?? 1);
  const x = Number(job.input.x ?? 0);
  const y = Number(job.input.y ?? 0);
  const width = Number(job.input.width ?? 0.2);
  const height = Number(job.input.height ?? 0.08);

  const { data: doc, error: dErr } = await supabaseAdmin
    .from("documents")
    .select("storage_path, title, workspace_id")
    .eq("id", documentId)
    .single();
  if (dErr || !doc?.storage_path) throw new Error(dErr?.message || "document missing");

  const { data: sig, error: sErr } = await supabaseAdmin
    .from("user_signatures")
    .select("signature_image_url, storage_path")
    .eq("id", signatureId)
    .single();
  if (sErr || !sig) throw new Error(sErr?.message || "signature missing");

  // Fetch original PDF
  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from("documents")
    .download(doc.storage_path);
  if (dlErr || !pdfBlob) throw new Error(dlErr?.message || "download failed");
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const pdf = await PDFDocument.load(pdfBytes);

  // Fetch signature image
  let sigBytes: Uint8Array;
  let sigMime = "image/png";
  if (sig.storage_path) {
    const { data: sBlob } = await supabaseAdmin.storage
      .from("signatures")
      .download(sig.storage_path);
    if (!sBlob) throw new Error("signature file missing");
    sigBytes = new Uint8Array(await sBlob.arrayBuffer());
    sigMime = sBlob.type || sigMime;
  } else {
    const r = await fetch(sig.signature_image_url);
    if (!r.ok) throw new Error(`fetch signature ${r.status}`);
    sigBytes = new Uint8Array(await r.arrayBuffer());
    sigMime = r.headers.get("content-type") ?? sigMime;
  }
  const img = sigMime.includes("jpeg") || sigMime.includes("jpg")
    ? await pdf.embedJpg(sigBytes)
    : await pdf.embedPng(sigBytes);

  const pages = pdf.getPages();
  const pageIdx = Math.min(Math.max(page - 1, 0), pages.length - 1);
  const pg = pages[pageIdx];
  const { width: pw, height: ph } = pg.getSize();
  const drawWidth = width * pw;
  const drawHeight = height * ph;
  // PDF origin is bottom-left; overlay coords use top-left
  const drawX = x * pw;
  const drawY = ph - y * ph - drawHeight;
  pg.drawImage(img, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });

  const outBytes = await pdf.save();
  const outPath = `${doc.workspace_id}/${job.created_by}/${documentId}-signed-${Date.now()}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("document-versions")
    .upload(outPath, outBytes, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(upErr.message);

  // Get next version number
  const { data: existing } = await supabaseAdmin
    .from("document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;

  await supabaseAdmin.from("document_versions").insert({
    document_id: documentId,
    created_by: job.created_by,
    version_number: nextVersion,
    storage_path: outPath,
    file_url: outPath,
  } as never);

  // Update current file pointer on the document
  await supabaseAdmin
    .from("documents")
    .update({ storage_path: outPath, current_file_url: outPath } as never)
    .eq("id", documentId);

  await supabaseAdmin
    .from("documents")
    .update({ document_status: "signed" as never })
    .eq("id", documentId);

  await notify(
    job.workspace_id,
    job.created_by,
    "Signature applied",
    `Your document “${doc.title}” has been signed.`,
    "document_signed",
  );

  return { versionPath: outPath, version: nextVersion };
}

async function handleSigningNotify(job: Job) {
  const apiKey = process.env.BREVO_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "OfficeKonnect";

  const requestId = job.input.requestId as string;
  const message = (job.input.message as string) ?? "";

  const { data: req } = await supabaseAdmin
    .from("signing_requests")
    .select("id, title, document_id")
    .eq("id", requestId)
    .single();
  if (!req) throw new Error("Signing request not found");

  const { data: participants } = await supabaseAdmin
    .from("signing_participants")
    .select("id, email, full_name, user_id, status")
    .eq("request_id", requestId);

  const baseUrl =
    process.env.APP_BASE_URL ||
    process.env.PUBLISHED_URL ||
    "https://id-preview--755c322c-3de5-4bde-b3a5-ea9c93aa5dcc.lovable.app";

  let sent = 0;
  for (const p of participants ?? []) {
    if (p.status !== "pending" || !p.email) continue;

    // Mint token
    const rawToken =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const enc = new TextEncoder().encode(rawToken);
    const hashBuf = await crypto.subtle.digest("SHA-256", enc);
    const tokenHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await supabaseAdmin.from("signing_tokens" as never).insert({
      token_hash: tokenHash,
      request_id: requestId,
      participant_id: p.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    } as never);

    const signUrl = `${baseUrl}/sign/${rawToken}`;

    // Notify registered users in-app
    if (p.user_id) {
      await supabaseAdmin.from("notifications").insert({
        workspace_id: job.workspace_id,
        user_id: p.user_id,
        kind: "signing_invite" as never,
        title: `Signature requested: ${req.title}`,
        body: message || "You have been asked to sign a document.",
        action_url: signUrl,
      } as never);
    }

    // Send email
    if (apiKey && lovableKey && sender) {
      const html = `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a;">${req.title}</h2>
          <p style="color: #555; line-height: 1.6;">
            Hello${p.full_name ? ` ${p.full_name}` : ""}, you have been requested to sign a document.
          </p>
          ${message ? `<blockquote style="border-left: 3px solid #3b82f6; padding-left: 12px; color: #555;">${message}</blockquote>` : ""}
          <p style="margin-top: 24px;">
            <a href="${signUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
              Review &amp; sign
            </a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">
            This link expires in 30 days. Do not share it.
          </p>
        </div>`;
      await fetch("https://connector-gateway.lovable.dev/brevo/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": apiKey,
        },
        body: JSON.stringify({
          sender: { name: senderName, email: sender },
          to: [{ email: p.email, name: p.full_name ?? undefined }],
          subject: `Signature requested: ${req.title}`,
          htmlContent: html,
        }),
      }).catch(() => void 0);
    }
    sent++;
  }

  return { sent };
}

async function handleSigningFinalize(job: Job) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const requestId = job.input.requestId as string;

  const { data: req } = await supabaseAdmin
    .from("signing_requests")
    .select("id, title, document_id, workspace_id, sender_id")
    .eq("id", requestId)
    .single();
  if (!req) throw new Error("Request not found");

  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("storage_path, title")
    .eq("id", req.document_id)
    .single();
  if (!doc?.storage_path) throw new Error("Document missing");

  const { data: pdfBlob } = await supabaseAdmin.storage.from("documents").download(doc.storage_path);
  if (!pdfBlob) throw new Error("PDF download failed");
  const pdf = await PDFDocument.load(new Uint8Array(await pdfBlob.arrayBuffer()));
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  const { data: fields } = await supabaseAdmin
    .from("document_fields" as never)
    .select("*")
    .eq("document_id", req.document_id);

  const pages = pdf.getPages();
  for (const raw of (fields ?? []) as unknown as Array<{
    field_type: string;
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
    value: string | null;
    default_value: string | null;
    properties: Record<string, string | number | boolean | null> | null;
  }>) {
    const pageIdx = Math.min(Math.max(raw.page - 1, 0), pages.length - 1);
    const pg = pages[pageIdx];
    const { width: pw, height: ph } = pg.getSize();
    const dx = raw.x * pw;
    const dy = ph - raw.y * ph - raw.h * ph;
    const dw = raw.w * pw;
    const dh = raw.h * ph;
    const val = raw.value ?? raw.default_value ?? "";

    if ((raw.field_type === "signature" || raw.field_type === "initials") && val.startsWith("data:image")) {
      const b64 = val.split(",")[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = val.includes("jpeg") ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      pg.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
    } else if (raw.field_type === "checkbox") {
      if (val === "true" || val === "1") {
        pg.drawText("X", {
          x: dx + dw / 4,
          y: dy + dh / 4,
          size: Math.min(dh, dw) * 0.8,
          font: helv,
          color: rgb(0, 0, 0),
        });
      }
    } else if (val) {
      const fontSize = Number(raw.properties?.fontSize ?? 12);
      pg.drawText(String(val), {
        x: dx + 2,
        y: dy + dh - fontSize - 2,
        size: fontSize,
        font: helv,
        color: rgb(0, 0, 0),
        maxWidth: dw - 4,
      });
    }
  }

  const outBytes = await pdf.save();
  const outPath = `${req.workspace_id}/${req.sender_id}/${req.document_id}-final-${Date.now()}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("document-versions")
    .upload(outPath, outBytes, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: existing } = await supabaseAdmin
    .from("document_versions")
    .select("version_number")
    .eq("document_id", req.document_id)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;

  await supabaseAdmin.from("document_versions").insert({
    document_id: req.document_id,
    created_by: req.sender_id,
    version_number: nextVersion,
    storage_path: outPath,
    file_url: outPath,
  } as never);

  await supabaseAdmin
    .from("documents")
    .update({ storage_path: outPath, current_file_url: outPath, document_status: "signed" as never } as never)
    .eq("id", req.document_id);

  await supabaseAdmin
    .from("signing_requests")
    .update({
      status: "completed" as never,
      completed_at: new Date().toISOString(),
      final_export_path: outPath,
    } as never)
    .eq("id", requestId);

  await supabaseAdmin.from("signing_events").insert({
    request_id: requestId,
    actor_id: null,
    event_type: "completed",
    metadata: { version: nextVersion } as never,
  } as never);

  await notify(
    job.workspace_id,
    job.created_by,
    "Document completed",
    `“${doc.title}” has been signed by all participants.`,
    "document_signed",
  );

  return { versionPath: outPath, version: nextVersion };
}

async function handleStub(job: Job) {
  return { stub: true, kind: job.kind };
}

export async function dispatchJob(job: Job): Promise<void> {
  try {
    let output: Record<string, unknown>;
    switch (job.kind) {
      case "audio_transcribe":
        output = await handleAudioTranscribe(job);
        break;
      case "email_campaign_send":
        output = await handleEmailCampaignSend(job);
        break;
      case "signature_apply":
        output = await handleSignatureApply(job);
        break;
      case "signing_notify":
        output = await handleSigningNotify(job);
        break;
      case "signing_finalize":
        output = await handleSigningFinalize(job);
        break;
      default:
        output = await handleStub(job);
    }
    await markSucceeded(job.id, output);
  } catch (err) {
    await markFailed(job, (err as Error).message);
  }
}


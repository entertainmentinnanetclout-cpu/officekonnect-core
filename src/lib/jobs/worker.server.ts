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

async function handleStub(job: Job) {
  // Placeholder: document_convert / document_export / letterhead_generate /
  // signature_apply / contact_import / contact_export are wired but use
  // provider stubs. Mark as succeeded with input echoed, ready for provider plug-in.
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
      default:
        output = await handleStub(job);
    }
    await markSucceeded(job.id, output);
  } catch (err) {
    await markFailed(job, (err as Error).message);
  }
}

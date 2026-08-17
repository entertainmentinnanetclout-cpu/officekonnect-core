-- Phase 0: free-tier-safe database hardening.
-- This migration is intentionally code-independent and reversible.

-- Prevent public enumeration of avatar object names. Public object URLs continue
-- to work because the avatars bucket itself remains public.
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;

-- Remove the duplicate voice_notes index identified by the Supabase advisor.
-- idx_voice_notes_ws_created is retained.
DROP INDEX IF EXISTS public.idx_voice_ws;

-- Cover foreign keys to reduce table scans during joins, deletes and cascades.
CREATE INDEX IF NOT EXISTS idx_billing_events_workspace_id
  ON public.billing_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact_id
  ON public.campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_contact_id
  ON public.contact_group_members(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_groups_created_by
  ON public.contact_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by
  ON public.contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_devices_workspace_id
  ON public.devices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_document_id
  ON public.document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signature_id
  ON public.document_signatures(signature_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_by
  ON public.document_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_created_by
  ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by
  ON public.email_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_template_id
  ON public.email_campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_by
  ON public.email_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by
  ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_letterheads_created_by
  ON public.letterheads(created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_default_workspace_id
  ON public.profiles(default_workspace_id);
CREATE INDEX IF NOT EXISTS idx_signing_events_actor_id
  ON public.signing_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_signing_fields_signed_signature_id
  ON public.signing_fields(signed_signature_id);
CREATE INDEX IF NOT EXISTS idx_signing_tokens_participant_id
  ON public.signing_tokens(participant_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_voice_note_id
  ON public.transcription_jobs(voice_note_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_workspace_id
  ON public.user_integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voice_notes_created_by
  ON public.voice_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_workspace_members_invited_by
  ON public.workspace_members(invited_by);

COMMENT ON TABLE public.signing_tokens IS
  'Service-role-only guest signing tokens. RLS intentionally has no client policies; public signing functions validate token hashes server-side.';
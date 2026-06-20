
-- ---------- EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------- ENUMS ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE public.subscription_plan AS ENUM ('free', 'professional', 'business');
CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'expired');
CREATE TYPE public.document_status AS ENUM ('draft', 'signed', 'converted', 'sent', 'archived', 'deleted');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'completed', 'failed');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'complained');
CREATE TYPE public.transcription_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.billing_event_type AS ENUM ('created', 'renewed', 'upgraded', 'downgraded', 'canceled', 'payment_succeeded', 'payment_failed', 'refunded');
CREATE TYPE public.job_kind AS ENUM ('document_convert', 'document_export', 'letterhead_generate', 'email_campaign_send', 'audio_transcribe', 'contact_import', 'contact_export', 'signature_apply');
CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');
CREATE TYPE public.notification_kind AS ENUM ('job_succeeded', 'job_failed', 'campaign_completed', 'transcription_ready', 'member_invited', 'quota_warning', 'document_shared', 'system');
CREATE TYPE public.device_platform AS ENUM ('ios', 'android', 'web', 'macos', 'windows', 'linux');
CREATE TYPE public.push_provider AS ENUM ('fcm', 'apns', 'web_push', 'expo');
CREATE TYPE public.integration_provider AS ENUM ('google_drive', 'dropbox', 'onedrive', 'stripe', 'brevo', 'openai', 'cloudconvert', 'adobe_pdf', 'slack', 'microsoft_graph');

-- ---------- GENERIC HELPERS ----------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== WORKSPACES =====
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL DEFAULT 'free',
  is_personal BOOLEAN NOT NULL DEFAULT false,
  avatar_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workspaces_owner ON public.workspaces(owner_id);
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_wsm_user ON public.workspace_members(user_id);
CREATE INDEX idx_wsm_workspace ON public.workspace_members(workspace_id);
CREATE TRIGGER trg_wsm_updated BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id UUID, _min_role public.workspace_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
      AND CASE _min_role
        WHEN 'viewer' THEN role IN ('viewer','member','admin','owner')
        WHEN 'member' THEN role IN ('member','admin','owner')
        WHEN 'admin'  THEN role IN ('admin','owner')
        WHEN 'owner'  THEN role = 'owner'
      END
  );
$$;

CREATE POLICY "Members can view their workspaces" ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));
CREATE POLICY "Authenticated can create workspaces" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Admins can update workspace" ON public.workspaces FOR UPDATE TO authenticated USING (public.has_workspace_role(id, 'admin')) WITH CHECK (public.has_workspace_role(id, 'admin'));
CREATE POLICY "Owners can delete workspace" ON public.workspaces FOR DELETE TO authenticated USING (public.has_workspace_role(id, 'owner'));

CREATE POLICY "Members can view membership rows" ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Admins can add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, 'admin') OR (SELECT owner_id FROM public.workspaces WHERE id = workspace_id) = auth.uid());
CREATE POLICY "Admins can update members" ON public.workspace_members FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, 'admin')) WITH CHECK (public.has_workspace_role(workspace_id, 'admin'));
CREATE POLICY "Admins can remove members" ON public.workspace_members FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, 'admin') OR user_id = auth.uid());

-- ===== PROFILES & ROLES =====
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  company_name TEXT,
  job_title TEXT,
  default_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  last_login TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ===== PLAN LIMITS =====
CREATE TABLE public.plan_limits (
  plan public.subscription_plan PRIMARY KEY,
  max_members INT NOT NULL,
  max_documents INT NOT NULL,
  max_storage_mb INT NOT NULL,
  max_campaigns_per_month INT NOT NULL,
  max_contacts INT NOT NULL,
  max_voice_minutes_per_month INT NOT NULL,
  max_signatures INT NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read plan limits" ON public.plan_limits FOR SELECT TO authenticated USING (true);

INSERT INTO public.plan_limits VALUES
('free', 1, 25, 200, 2, 100, 30, 2, '{"e_signatures":true,"bulk_email":true,"transcription":true,"letterheads":true,"conversion":true,"api_access":false,"priority_support":false}'::jsonb, now()),
('professional', 5, 500, 5000, 50, 5000, 600, 25, '{"e_signatures":true,"bulk_email":true,"transcription":true,"letterheads":true,"conversion":true,"api_access":true,"priority_support":false}'::jsonb, now()),
('business', 50, 10000, 50000, 1000, 100000, 6000, 500, '{"e_signatures":true,"bulk_email":true,"transcription":true,"letterheads":true,"conversion":true,"api_access":true,"priority_support":true}'::jsonb, now());

-- ===== SUBSCRIPTIONS / BILLING / USAGE =====
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL DEFAULT 'free',
  status public.subscription_status NOT NULL DEFAULT 'active',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX uq_subscriptions_active ON public.subscriptions(workspace_id) WHERE status IN ('active','trialing');
CREATE INDEX idx_subscriptions_ws ON public.subscriptions(workspace_id);
CREATE POLICY "Members read subscription" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Admins manage subscription" ON public.subscriptions FOR ALL TO authenticated USING (public.has_workspace_role(workspace_id,'admin')) WITH CHECK (public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.billing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type public.billing_event_type NOT NULL,
  amount NUMERIC(12,2),
  currency TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_billing_sub ON public.billing_events(subscription_id, created_at DESC);
CREATE POLICY "Admins view billing" ON public.billing_events FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id,'admin'));

CREATE TABLE public.usage_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_month DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  documents_count INT NOT NULL DEFAULT 0,
  signatures_count INT NOT NULL DEFAULT 0,
  campaigns_count INT NOT NULL DEFAULT 0,
  contacts_count INT NOT NULL DEFAULT 0,
  voice_minutes NUMERIC(12,2) NOT NULL DEFAULT 0,
  storage_mb NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_metrics TO authenticated;
GRANT ALL ON public.usage_metrics TO service_role;
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read usage" ON public.usage_metrics FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE TRIGGER trg_usage_updated BEFORE UPDATE ON public.usage_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== SIGNATURES, DOCUMENTS, METADATA =====
CREATE TABLE public.user_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  signature_image_url TEXT NOT NULL,
  storage_path TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_signatures TO authenticated;
GRANT ALL ON public.user_signatures TO service_role;
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sig_ws ON public.user_signatures(workspace_id, created_at DESC);
CREATE UNIQUE INDEX uq_sig_default ON public.user_signatures(created_by) WHERE is_default;
CREATE POLICY "Members read signatures" ON public.user_signatures FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members write signatures" ON public.user_signatures FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Owners update signatures" ON public.user_signatures FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE POLICY "Owners delete signatures" ON public.user_signatures FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_sig_updated BEFORE UPDATE ON public.user_signatures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  original_file_url TEXT,
  current_file_url TEXT,
  storage_path TEXT,
  file_type TEXT,
  file_size BIGINT,
  document_status public.document_status NOT NULL DEFAULT 'draft',
  page_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_docs_ws ON public.documents(workspace_id, created_at DESC);
CREATE INDEX idx_docs_status ON public.documents(document_status);
CREATE POLICY "Members read documents" ON public.documents FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Members update own documents" ON public.documents FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id,'member') AND (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'))) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members delete own documents" ON public.documents FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_document_member(_doc_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d JOIN public.workspace_members m ON m.workspace_id = d.workspace_id
    WHERE d.id = _doc_id AND m.user_id = auth.uid()
  );
$$;

CREATE TABLE public.document_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read versions" ON public.document_versions FOR SELECT TO authenticated USING (public.is_document_member(document_id));
CREATE POLICY "Members write versions" ON public.document_versions FOR INSERT TO authenticated WITH CHECK (public.is_document_member(document_id));

CREATE TABLE public.document_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signature_id UUID NOT NULL REFERENCES public.user_signatures(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  x_position NUMERIC NOT NULL,
  y_position NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_signatures TO authenticated;
GRANT ALL ON public.document_signatures TO service_role;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage doc signatures" ON public.document_signatures FOR ALL TO authenticated USING (public.is_document_member(document_id)) WITH CHECK (public.is_document_member(document_id));

CREATE TABLE public.document_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
  page_count INT,
  word_count INT,
  language TEXT,
  mime_type TEXT,
  checksum TEXT,
  thumbnail_url TEXT,
  preview_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ocr_text TEXT,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_metadata TO authenticated;
GRANT ALL ON public.document_metadata TO service_role;
ALTER TABLE public.document_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read doc metadata" ON public.document_metadata FOR SELECT TO authenticated USING (public.is_document_member(document_id));
CREATE TRIGGER trg_docmeta_updated BEFORE UPDATE ON public.document_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== LETTERHEADS =====
CREATE TABLE public.letterheads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  header_content TEXT,
  footer_content TEXT,
  company_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.letterheads TO authenticated;
GRANT ALL ON public.letterheads TO service_role;
ALTER TABLE public.letterheads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_letterheads_ws ON public.letterheads(workspace_id, created_at DESC);
CREATE POLICY "Members read letterheads" ON public.letterheads FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members write letterheads" ON public.letterheads FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Members update letterheads" ON public.letterheads FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE POLICY "Members delete letterheads" ON public.letterheads FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_lh_updated BEFORE UPDATE ON public.letterheads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== EMAIL TEMPLATES, CONTACTS, CAMPAIGNS =====
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  plain_body TEXT,
  merge_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tmpl_ws ON public.email_templates(workspace_id, created_at DESC);
CREATE POLICY "Members read templates" ON public.email_templates FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members write templates" ON public.email_templates FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Members update templates" ON public.email_templates FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE POLICY "Members delete templates" ON public.email_templates FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_tmpl_updated BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_contacts_ws ON public.contacts(workspace_id, created_at DESC);
CREATE UNIQUE INDEX uq_contacts_email ON public.contacts(workspace_id, lower(email)) WHERE email IS NOT NULL;
CREATE POLICY "Members read contacts" ON public.contacts FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members write contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Members update contacts" ON public.contacts FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id,'member'));
CREATE POLICY "Members delete contacts" ON public.contacts FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id,'member'));
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contact_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO authenticated;
GRANT ALL ON public.contact_groups TO service_role;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read groups" ON public.contact_groups FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage groups" ON public.contact_groups FOR ALL TO authenticated USING (public.has_workspace_role(workspace_id,'member')) WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON public.contact_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_groups g JOIN public.workspace_members m ON m.workspace_id = g.workspace_id
    WHERE g.id = _group_id AND m.user_id = auth.uid()
  );
$$;

CREATE TABLE public.contact_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_group_members TO authenticated;
GRANT ALL ON public.contact_group_members TO service_role;
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage group members" ON public.contact_group_members FOR ALL TO authenticated USING (public.is_group_member(group_id)) WITH CHECK (public.is_group_member(group_id));

CREATE TABLE public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  campaign_name TEXT NOT NULL,
  campaign_status public.campaign_status NOT NULL DEFAULT 'draft',
  total_recipients INT NOT NULL DEFAULT 0,
  emails_sent INT NOT NULL DEFAULT 0,
  emails_opened INT NOT NULL DEFAULT 0,
  emails_clicked INT NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_camp_ws ON public.email_campaigns(workspace_id, created_at DESC);
CREATE POLICY "Members read campaigns" ON public.email_campaigns FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members write campaigns" ON public.email_campaigns FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Members update campaigns" ON public.email_campaigns FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE POLICY "Members delete campaigns" ON public.email_campaigns FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_camp_updated BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_campaign_member(_campaign_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.email_campaigns c JOIN public.workspace_members m ON m.workspace_id = c.workspace_id
    WHERE c.id = _campaign_id AND m.user_id = auth.uid()
  );
$$;

CREATE TABLE public.campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  delivery_status public.delivery_status NOT NULL DEFAULT 'pending',
  opened BOOLEAN NOT NULL DEFAULT false,
  clicked BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_camprec_status ON public.campaign_recipients(campaign_id, delivery_status);
CREATE POLICY "Members read recipients" ON public.campaign_recipients FOR SELECT TO authenticated USING (public.is_campaign_member(campaign_id));

-- ===== VOICE NOTES + TRANSCRIPTION =====
CREATE TABLE public.voice_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  audio_url TEXT NOT NULL,
  storage_path TEXT,
  transcript TEXT,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_notes TO authenticated;
GRANT ALL ON public.voice_notes TO service_role;
ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_voice_ws ON public.voice_notes(workspace_id, created_at DESC);
CREATE POLICY "Members read voice notes" ON public.voice_notes FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members write voice notes" ON public.voice_notes FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE POLICY "Members update voice notes" ON public.voice_notes FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE POLICY "Members delete voice notes" ON public.voice_notes FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_workspace_role(workspace_id,'admin'));
CREATE TRIGGER trg_voice_updated BEFORE UPDATE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_voice_member(_vn_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voice_notes v JOIN public.workspace_members m ON m.workspace_id = v.workspace_id
    WHERE v.id = _vn_id AND m.user_id = auth.uid()
  );
$$;

CREATE TABLE public.transcription_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voice_note_id UUID NOT NULL REFERENCES public.voice_notes(id) ON DELETE CASCADE,
  status public.transcription_status NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'openai_whisper',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcription_jobs TO authenticated;
GRANT ALL ON public.transcription_jobs TO service_role;
ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read transcription jobs" ON public.transcription_jobs FOR SELECT TO authenticated USING (public.is_voice_member(voice_note_id));
CREATE TRIGGER trg_tj_updated BEFORE UPDATE ON public.transcription_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== JOBS =====
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.job_kind NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  priority INT NOT NULL DEFAULT 5,
  provider TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error JSONB,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_jobs_status ON public.jobs(status, scheduled_for);
CREATE INDEX idx_jobs_ws ON public.jobs(workspace_id, status);
CREATE INDEX idx_jobs_entity ON public.jobs(entity_type, entity_id);
CREATE POLICY "Members read jobs" ON public.jobs FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members enqueue jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id,'member') AND created_by = auth.uid());
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_jobs(p_kinds public.job_kind[] DEFAULT NULL, p_limit INT DEFAULT 5)
RETURNS SETOF public.jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.jobs j
  SET status = 'running', started_at = now(), attempts = j.attempts + 1, updated_at = now()
  WHERE j.id IN (
    SELECT id FROM public.jobs
    WHERE status = 'queued' AND scheduled_for <= now()
      AND (p_kinds IS NULL OR kind = ANY(p_kinds))
    ORDER BY priority ASC, scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_jobs(public.job_kind[], INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(public.job_kind[], INT) TO service_role;

-- ===== NOTIFICATIONS =====
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id UUID,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_channels JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notif_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_ws ON public.notifications(workspace_id, created_at DESC);
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_workspace_member(workspace_id)));
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ===== DEVICES =====
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.device_platform NOT NULL,
  push_provider public.push_provider NOT NULL,
  push_token TEXT NOT NULL,
  device_name TEXT,
  app_version TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, push_token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own devices" ON public.devices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_devices_updated BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== USER INTEGRATIONS =====
CREATE TABLE public.user_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider public.integration_provider NOT NULL,
  account_email TEXT,
  access_token_secret_id UUID,
  refresh_token_secret_id UUID,
  expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, account_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT ALL ON public.user_integrations TO service_role;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own integrations" ON public.user_integrations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_integ_updated BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== ACTIVITY LOGS =====
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_act_user ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX idx_act_ws ON public.activity_logs(workspace_id, created_at DESC);
CREATE INDEX idx_act_entity ON public.activity_logs(entity_type, entity_id);
CREATE POLICY "Admins view activity" ON public.activity_logs FOR SELECT TO authenticated USING (public.has_workspace_role(workspace_id,'admin') OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ws UUID;
  _eid UUID;
BEGIN
  _eid := COALESCE((NEW).id, (OLD).id);
  BEGIN _ws := (NEW).workspace_id; EXCEPTION WHEN OTHERS THEN _ws := NULL; END;
  IF _ws IS NULL THEN BEGIN _ws := (OLD).workspace_id; EXCEPTION WHEN OTHERS THEN _ws := NULL; END; END IF;
  INSERT INTO public.activity_logs (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (_ws, auth.uid(), TG_OP, TG_TABLE_NAME, _eid, jsonb_build_object('op', TG_OP));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER aud_documents AFTER INSERT OR UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER aud_signatures AFTER INSERT OR UPDATE OR DELETE ON public.user_signatures FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER aud_campaigns AFTER INSERT OR UPDATE OR DELETE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER aud_voice AFTER INSERT OR UPDATE OR DELETE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER aud_letterheads AFTER INSERT OR UPDATE OR DELETE ON public.letterheads FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER aud_subscriptions AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- ===== AUTH SIGNUP HOOK =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ws_id UUID;
  _full_name TEXT;
  _slug TEXT;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  _slug := 'ws-' || substr(NEW.id::text, 1, 8) || '-' || extract(epoch from now())::bigint;
  INSERT INTO public.workspaces (name, slug, owner_id, is_personal, plan)
  VALUES (_full_name || '''s Workspace', _slug, NEW.id, true, 'free') RETURNING id INTO _ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (_ws_id, NEW.id, 'owner');
  INSERT INTO public.profiles (id, email, full_name, default_workspace_id) VALUES (NEW.id, NEW.email, _full_name, _ws_id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (workspace_id, plan, status) VALUES (_ws_id, 'free', 'active');
  INSERT INTO public.usage_metrics (workspace_id) VALUES (_ws_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== REALTIME =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_notes;

-- ===== STORAGE RLS (buckets created separately) =====
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "avatars owner write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DO $$
DECLARE b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['signatures','documents','document-versions','letterheads','voice-notes','exports']
  LOOP
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND public.is_workspace_member(((storage.foldername(name))[1])::uuid))', b||' members read', b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND public.has_workspace_role(((storage.foldername(name))[1])::uuid, ''member''))', b||' members insert', b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND public.has_workspace_role(((storage.foldername(name))[1])::uuid, ''member''))', b||' members update', b);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND public.has_workspace_role(((storage.foldername(name))[1])::uuid, ''member''))', b||' members delete', b);
  END LOOP;
END $$;

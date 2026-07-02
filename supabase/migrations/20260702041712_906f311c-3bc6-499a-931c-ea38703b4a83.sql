
CREATE TABLE IF NOT EXISTS public.document_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  field_type TEXT NOT NULL,
  label TEXT,
  page INTEGER NOT NULL DEFAULT 1,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  w DOUBLE PRECISION NOT NULL,
  h DOUBLE PRECISION NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  default_value TEXT,
  value TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_email TEXT,
  assigned_participant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_fields_document_idx ON public.document_fields(document_id);
CREATE INDEX IF NOT EXISTS document_fields_workspace_idx ON public.document_fields(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_fields TO authenticated;
GRANT ALL ON public.document_fields TO service_role;
ALTER TABLE public.document_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY df_select ON public.document_fields FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));
CREATE POLICY df_insert ON public.document_fields FOR INSERT TO authenticated WITH CHECK (private.is_workspace_member(workspace_id) AND created_by = auth.uid());
CREATE POLICY df_update ON public.document_fields FOR UPDATE TO authenticated USING (private.is_workspace_member(workspace_id));
CREATE POLICY df_delete ON public.document_fields FOR DELETE TO authenticated USING (private.is_workspace_member(workspace_id));
CREATE TRIGGER document_fields_updated_at BEFORE UPDATE ON public.document_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.signing_participants ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.signing_participants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.signing_participants ADD COLUMN IF NOT EXISTS full_name TEXT;

CREATE TABLE IF NOT EXISTS public.signing_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  request_id UUID NOT NULL REFERENCES public.signing_requests(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.signing_participants(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signing_tokens_request_idx ON public.signing_tokens(request_id);
GRANT ALL ON public.signing_tokens TO service_role;
ALTER TABLE public.signing_tokens ENABLE ROW LEVEL SECURITY;

ALTER TYPE public.job_kind ADD VALUE IF NOT EXISTS 'signing_notify';
ALTER TYPE public.job_kind ADD VALUE IF NOT EXISTS 'signing_finalize';

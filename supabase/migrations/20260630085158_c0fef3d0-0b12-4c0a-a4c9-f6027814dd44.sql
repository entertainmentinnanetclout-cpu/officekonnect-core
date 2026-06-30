
-- P1: trigger to auto-unset previous default signature so set-default is idempotent
CREATE OR REPLACE FUNCTION public.enforce_single_default_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.user_signatures
       SET is_default = false
     WHERE created_by = NEW.created_by
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_single_default_signature ON public.user_signatures;
CREATE TRIGGER trg_enforce_single_default_signature
BEFORE INSERT OR UPDATE OF is_default ON public.user_signatures
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.enforce_single_default_signature();

REVOKE EXECUTE ON FUNCTION public.enforce_single_default_signature() FROM PUBLIC, anon, authenticated;

-- P6: profile preferences + workspace company fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS address text;

-- P8: helpful indexes
CREATE INDEX IF NOT EXISTS idx_voice_notes_ws_created
  ON public.voice_notes (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_sched
  ON public.jobs (status, scheduled_for)
  WHERE status = 'queued';

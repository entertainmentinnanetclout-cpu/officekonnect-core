
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.is_workspace_member(uuid) SET SCHEMA private;
ALTER FUNCTION public.has_workspace_role(uuid, public.workspace_role) SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_document_member(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_group_member(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_voice_member(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_campaign_member(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_signing_participant(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_signing_request_sender(uuid) SET SCHEMA private;
ALTER FUNCTION public.search_users(text) SET SCHEMA private;

REVOKE EXECUTE ON FUNCTION
  private.is_workspace_member(uuid),
  private.has_workspace_role(uuid, public.workspace_role),
  private.has_role(uuid, public.app_role),
  private.is_document_member(uuid),
  private.is_group_member(uuid),
  private.is_voice_member(uuid),
  private.is_campaign_member(uuid),
  private.is_signing_participant(uuid),
  private.is_signing_request_sender(uuid),
  private.search_users(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  private.is_workspace_member(uuid),
  private.has_workspace_role(uuid, public.workspace_role),
  private.has_role(uuid, public.app_role),
  private.is_document_member(uuid),
  private.is_group_member(uuid),
  private.is_voice_member(uuid),
  private.is_campaign_member(uuid),
  private.is_signing_participant(uuid),
  private.is_signing_request_sender(uuid),
  private.search_users(text)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_jobs(public.job_kind[], integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_jobs(public.job_kind[], integer) TO service_role;

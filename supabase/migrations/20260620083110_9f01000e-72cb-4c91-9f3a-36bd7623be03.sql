
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(UUID, public.workspace_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_document_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_campaign_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_voice_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_activity() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, public.workspace_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_document_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_campaign_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_voice_member(UUID) TO authenticated, service_role;

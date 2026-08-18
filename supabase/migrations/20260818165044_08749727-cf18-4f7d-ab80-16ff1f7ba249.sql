CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ws_id UUID;
  _full_name TEXT;
  _email TEXT;
  _slug TEXT;
BEGIN
  _email := COALESCE(NULLIF(NEW.email, ''), 'guest-' || substr(NEW.id::text, 1, 8) || '@guest.officekonnect.local');
  _full_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, ''), '@', 1))), '');
  IF _full_name IS NULL THEN
    _full_name := 'Guest ' || upper(substr(NEW.id::text, 1, 6));
  END IF;
  _slug := 'ws-' || substr(NEW.id::text, 1, 8) || '-' || extract(epoch from now())::bigint;
  INSERT INTO public.workspaces (name, slug, owner_id, is_personal, plan)
  VALUES (_full_name || '''s Workspace', _slug, NEW.id, true, 'free') RETURNING id INTO _ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (_ws_id, NEW.id, 'owner');
  INSERT INTO public.profiles (id, email, full_name, default_workspace_id) VALUES (NEW.id, _email, _full_name, _ws_id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (workspace_id, plan, status) VALUES (_ws_id, 'free', 'active');
  INSERT INTO public.usage_metrics (workspace_id) VALUES (_ws_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;
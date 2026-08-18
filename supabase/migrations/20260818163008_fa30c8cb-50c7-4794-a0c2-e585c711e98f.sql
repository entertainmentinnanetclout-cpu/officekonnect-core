DO $$
DECLARE r record; pol_text text; view_text text; inv_text text;
BEGIN
  SELECT coalesce(string_agg(coalesce(qual,'')||' '||coalesce(with_check,''),' '),'') INTO pol_text FROM pg_policies;
  SELECT coalesce(string_agg(pg_get_viewdef(c.oid),' '),'') INTO view_text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname IN ('public','private');
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid),' '),'') INTO inv_text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prosecdef = false;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.prosecdef
  LOOP
    IF pol_text LIKE '%private.'||r.proname||'%' THEN CONTINUE; END IF;
    IF view_text LIKE '%private.'||r.proname||'%' THEN CONTINUE; END IF;
    IF inv_text LIKE '%private.'||r.proname||'%' THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
  END LOOP;
END $$;
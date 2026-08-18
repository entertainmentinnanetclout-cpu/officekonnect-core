import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {
      try {
        const auth = supabase.auth;
        const {
          data: { subscription },
        } = auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          setError(null);
          setIsLoading(false);
        });
        unsubscribe = () => subscription.unsubscribe();

        const { data, error: sessionError } = await auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;

        setSession(data.session);
        setUser(data.session?.user ?? null);
        setError(null);
        setIsLoading(false);
      } catch (cause) {
        if (!active) return;
        setSession(null);
        setUser(null);
        setError(
          cause instanceof Error ? cause : new Error("Authentication initialization failed"),
        );
        setIsLoading(false);
      }
    };

    void initialize();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return { session, user, isLoading, error };
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

/**
 * Session bootstrap (spec §3.3): resolves `supabase.auth.getSession()`
 * (from the AsyncStorage-persisted session) once on cold start, then
 * subscribes to `onAuthStateChange` for the lifetime of the app — every
 * screen reads auth state from this one shared source rather than doing its
 * own ad hoc check. `loading` is only ever true for the brief initial
 * AsyncStorage read; the root layout renders a plain centered
 * `ActivityIndicator` over the whole app while it's true (spec §3.3).
 */
type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    // Login, logout, and token-refresh events all flow through this one
    // listener. Torn down on unmount so it never fires twice for the
    // lifetime of a single app run (see the task's "listener set up but
    // never torn down" bug-class warning).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

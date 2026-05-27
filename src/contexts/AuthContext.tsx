'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, syncLocalTripsToCloud } from '@/lib/supabase';
import { loadTrips } from '@/lib/tripCalculations';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isSupabaseReady: boolean; // false si env vars absentes
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isSupabaseReady: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseReady = supabase !== null;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Récupérer la session existante
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Écouter les changements d'auth (login, logout, refresh token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);

        // À la première connexion → synchroniser les trajets locaux vers le cloud
        if (event === 'SIGNED_IN' && newSession?.user) {
          const localTrips = loadTrips();
          if (localTrips.length > 0) {
            await syncLocalTripsToCloud(newSession.user.id, localTrips);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, isSupabaseReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

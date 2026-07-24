import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/integrations/supabase/types';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** True while the profile row is being fetched for the current user. */
  profileLoading: boolean;
  /** Set when the profile could not be loaded (RLS, missing row, network, …). */
  profileError: string | null;
  reloadProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  profileError: null,
  reloadProfile: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const navigate = useNavigate();
  // Track the userId we last started loading for – avoids stale updates
  const loadingForRef = useRef<string | null>(null);

  const loadProfile = async (userId: string) => {
    loadingForRef.current = userId;
    setProfileLoading(true);
    setProfileError(null);

    // Safety net: never let the profile fetch hang forever.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Zeitüberschreitung beim Laden des Profils')), 10000),
    );

    try {
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data, error } = (await Promise.race([query, timeout])) as Awaited<typeof query>;

      // Ignore result if we've since moved on to a different user
      if (loadingForRef.current !== userId) return;

      if (error) throw error;

      setProfile(data as Profile);
      setProfileError(null);

      // Update last_login_at in background (best effort)
      supabase.from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);
    } catch (err: any) {
      // Ignore aborts (React StrictMode double-invoke, unmount races)
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') return;
      if (loadingForRef.current !== userId) return;
      console.error('[AuthContext] Failed to load profile:', err);
      setProfile(null);
      setProfileError(err?.message || 'Profil konnte nicht geladen werden');
    } finally {
      if (loadingForRef.current === userId) setProfileLoading(false);
    }
  };

  useEffect(() => {
    // Load initial session. Resolve `loading` as soon as we know whether a
    // session exists – the profile is fetched separately so a slow/failing
    // profile query can never block the whole app on an endless spinner.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setLoading(false);
      if (u) loadProfile(u.id);
    });

    // Listen for auth changes (skip events that don't need profile reload)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;

      const u = session?.user ?? null;
      setUser(u);
      setLoading(false);

      if (u) {
        // IMPORTANT: never `await` a Supabase query directly inside this callback –
        // supabase-js holds an internal lock during the callback and the query
        // needs the same lock, which deadlocks (endless spinner after login).
        // Defer the profile load so it runs outside the auth callback.
        setTimeout(() => { loadProfile(u.id); }, 0);
      } else {
        loadingForRef.current = null;
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const reloadProfile = () => {
    if (user) loadProfile(user.id);
  };

  const signOut = async () => {
    loadingForRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setProfileError(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, profileLoading, profileError, reloadProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

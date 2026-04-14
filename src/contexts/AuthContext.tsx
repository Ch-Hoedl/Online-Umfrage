import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/integrations/supabase/types';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  // Track the userId we last started loading for – avoids stale updates
  const loadingForRef = useRef<string | null>(null);

  const loadProfile = async (userId: string) => {
    loadingForRef.current = userId;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Ignore result if we've since moved on to a different user
      if (loadingForRef.current !== userId) return;

      if (error) throw error;
      setProfile(data as Profile);

      // Update last_login_at in background
      supabase.from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);
    } catch (err: any) {
      // Ignore aborts (React StrictMode double-invoke, unmount races)
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') return;
      console.error('[AuthContext] Failed to load profile:', err);
      if (loadingForRef.current === userId) setProfile(null);
    }
  };

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        await loadProfile(u.id);
      }
      setLoading(false);
    });

    // Listen for auth changes (skip events that don't need profile reload)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;

      const u = session?.user ?? null;
      setUser(u);

      if (u) {
        // Don't set loading=true here – user is already authenticated,
        // we just silently refresh the profile in the background.
        await loadProfile(u.id);
      } else {
        loadingForRef.current = null;
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    loadingForRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
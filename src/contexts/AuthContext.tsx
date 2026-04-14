import React, { createContext, useContext, useEffect, useState } from 'react';
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

  const loadProfile = async (userId: string) => {
    try {
      console.log('[AuthContext] Loading profile for user:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        console.error('[AuthContext] Error loading profile:', error);
        throw error;
      }
      console.log('[AuthContext] Profile loaded successfully:', {
        id: data.id,
        email: data.email,
        role: data.role,
        approved: data.approved,
        first_name: data.first_name,
        last_name: data.last_name,
      });
      setProfile(data as Profile);

      // Update last_login_at
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateError) {
        console.error('[AuthContext] Error updating last_login_at:', updateError);
      }
    } catch (err) {
      console.error('[AuthContext] Failed to load profile:', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately with the current session,
    // so we don't need a separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth state changed:', event, session?.user?.email);
      const u = session?.user ?? null;
      setUser(u);
      if (u && event !== 'TOKEN_REFRESHED') {
        await loadProfile(u.id);
      } else if (!u) {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
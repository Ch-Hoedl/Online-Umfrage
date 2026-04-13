import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Sign up fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  useEffect(() => {
    console.log('[Login] useEffect - user:', user?.email, 'profile:', profile, 'approved:', profile?.approved, 'loading:', loading);
    
    if (user && profile) {
      if (profile.approved) {
        console.log('[Login] User approved, navigating to /admin');
        navigate('/admin');
      } else {
        console.log('[Login] User not approved, showing pending message');
        setLoading(false);
      }
    } else if (user && !profile) {
      console.log('[Login] User exists but profile not loaded yet, waiting...');
      // Set a timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        console.error('[Login] Profile loading timeout - forcing loading state to false');
        setLoading(false);
        toast.error('Fehler beim Laden des Profils. Bitte versuchen Sie es erneut.');
      }, 5000); // 5 seconds timeout
      
      return () => clearTimeout(timeout);
    } else {
      console.log('[Login] No user, resetting loading state');
      setLoading(false);
    }
  }, [user, profile, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Bitte füllen Sie alle Felder aus');
      return;
    }
    
    setLoading(true);
    try {
      console.log('[Login] Attempting login for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error('[Login] Auth error:', error);
        throw error;
      }
      
      console.log('[Login] Login successful, user:', data.user?.email);
      // Navigation happens via useEffect when profile loads
    } catch (error: any) {
      console.error('[Login] Login error:', error);
      toast.error(error.message || 'Fehler beim Anmelden');
      setLoading(false);
    }
    // Don't set loading to false here - let useEffect handle it
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !signUpEmail || !signUpPassword) {
      toast.error('Bitte füllen Sie alle Felder aus');
      return;
    }
    
    if (signUpPassword.length < 6) {
      toast.error('Das Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signUpEmail,
        password: signUpPassword,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });
      
      if (error) throw error;
      
      if (data.user) {
        toast.success('Registrierung erfolgreich! Warten Sie auf die Freischaltung.');
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast.error(error.message || 'Fehler bei der Registrierung');
    } finally {
      setLoading(false);
    }
  };

  // Logged in but not approved → show pending message
  if (user && profile && !profile.approved) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-2xl mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Registrierung erfolgreich!</h1>
            <p className="text-gray-600 mb-4">
              Ihr Konto wurde erstellt. Ein Administrator muss Ihre Registrierung noch freischalten.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              Sie werden benachrichtigt, sobald Ihr Konto genehmigt wurde.
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-6 text-sm text-gray-500 underline hover:text-gray-700"
            >
              Abmelden
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Umfrage-App</h1>
            <p className="text-gray-600">
              {isSignUp ? 'Erstellen Sie ein neues Konto' : 'Melden Sie sich an, um Umfragen zu erstellen'}
            </p>
            {isSignUp && (
              <p className="text-sm text-gray-500 mt-2">
                Neue Registrierungen werden vom Administrator freigeschaltet
              </p>
            )}
          </div>

          {!isSignUp ? (
            // Login Form
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ihre.email@beispiel.de"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? 'Anmeldung läuft...' : 'Anmelden'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 underline"
                >
                  Noch kein Konto? Registrieren
                </button>
              </div>
            </form>
          ) : (
            // Sign Up Form
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">Vorname *</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Max"
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Nachname *</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mustermann"
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="signUpEmail">E-Mail *</Label>
                <Input
                  id="signUpEmail"
                  type="email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="ihre.email@beispiel.de"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="signUpPassword">Passwort *</Label>
                <Input
                  id="signUpPassword"
                  type="password"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
                <p className="text-xs text-gray-500 mt-1">Mindestens 6 Zeichen</p>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                {loading ? 'Registrierung läuft...' : 'Registrieren'}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className="text-sm text-blue-600 hover:text-blue-700 underline"
                >
                  Haben Sie bereits ein Konto? Anmelden
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;

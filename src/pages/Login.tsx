import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  // Redirect once auth is resolved
  useEffect(() => {
    if (authLoading) return;
    if (user && profile?.approved) {
      navigate('/admin');
    }
  }, [authLoading, user, profile, navigate]);

  // Still loading auth state – show spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Logged in but waiting for approval
  if (user && profile && !profile.approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Registrierung erfolgreich!</h2>
          <p className="text-gray-600 mb-2">Ihr Konto wurde erstellt. Ein Administrator muss Ihre Registrierung noch freischalten.</p>
          <p className="text-sm text-gray-500">Sie werden benachrichtigt, sobald Ihr Konto genehmigt wurde.</p>
          <button onClick={() => supabase.auth.signOut()} className="mt-6 text-sm text-gray-500 underline hover:text-gray-700">
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  // User logged in but profile not yet loaded – show spinner (brief moment)
  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Bitte füllen Sie alle Felder aus'); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Navigation happens via useEffect once profile is loaded
    } catch (error: any) {
      toast.error(error.message || 'Fehler beim Anmelden');
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !signUpEmail || !signUpPassword) {
      toast.error('Bitte füllen Sie alle Felder aus'); return;
    }
    if (signUpPassword.length < 6) { toast.error('Das Passwort muss mindestens 6 Zeichen lang sein'); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signUpEmail,
        password: signUpPassword,
        options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
      });
      if (error) throw error;
      if (data.user) toast.success('Registrierung erfolgreich! Warten Sie auf die Freischaltung.');
    } catch (error: any) {
      toast.error(error.message || 'Fehler bei der Registrierung');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Umfrage-App</h1>
          <p className="text-gray-600 mt-1">
            {isSignUp ? 'Erstellen Sie ein neues Konto' : 'Melden Sie sich an, um Umfragen zu erstellen'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {isSignUp && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">ℹ️</span>
              Neue Registrierungen werden vom Administrator freigeschaltet
            </div>
          )}

          {!isSignUp ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="ihre.email@beispiel.de" required autoComplete="email" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="password">Passwort</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password" className="mt-1" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700">
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Anmeldung läuft...</> : 'Anmelden'}
              </Button>
              <button type="button" onClick={() => setIsSignUp(true)} className="w-full text-sm text-blue-600 hover:text-blue-700 underline">
                Noch kein Konto? Registrieren
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">Vorname *</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Max" required autoComplete="given-name" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="lastName">Nachname *</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mustermann" required autoComplete="family-name" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="signUpEmail">E-Mail *</Label>
                <Input id="signUpEmail" type="email" value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="ihre.email@beispiel.de" required autoComplete="email" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="signUpPassword">Passwort *</Label>
                <Input id="signUpPassword" type="password" value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="new-password" minLength={6} className="mt-1" />
                <p className="text-xs text-gray-500 mt-1">Mindestens 6 Zeichen</p>
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700">
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Registrierung läuft...</> : 'Registrieren'}
              </Button>
              <button type="button" onClick={() => setIsSignUp(false)} className="w-full text-sm text-blue-600 hover:text-blue-700 underline">
                Haben Sie bereits ein Konto? Anmelden
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;

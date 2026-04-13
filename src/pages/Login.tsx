import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, CheckCircle2 } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    if (user && profile?.approved) {
      navigate('/admin');
    }
  }, [user, profile, navigate]);

  // Detect sign-up event to show the "pending approval" message
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Will be caught by the profile check above; if not approved, show message
        setJustRegistered(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

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
            <p className="text-gray-600">Melden Sie sich an, um Umfragen zu erstellen</p>
            <p className="text-sm text-gray-500 mt-2">
              Neue Registrierungen werden vom Administrator freigeschaltet
            </p>
          </div>

          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#2563eb',
                    brandAccent: '#1d4ed8',
                  },
                },
              },
            }}
            localization={{
              variables: {
                sign_in: {
                  email_label: 'E-Mail',
                  password_label: 'Passwort',
                  button_label: 'Anmelden',
                  loading_button_label: 'Anmeldung läuft...',
                  link_text: 'Haben Sie bereits ein Konto? Anmelden',
                },
                sign_up: {
                  email_label: 'E-Mail',
                  password_label: 'Passwort',
                  button_label: 'Registrieren',
                  loading_button_label: 'Registrierung läuft...',
                  link_text: 'Noch kein Konto? Registrieren',
                  confirmation_text: 'Bitte bestätigen Sie Ihre E-Mail-Adresse.',
                },
              },
            }}
            providers={[]}
            theme="light"
          />
        </div>
      </div>
    </div>
  );
};

export default Login;

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3 } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/admin');
    }
  }, [user, navigate]);

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
              Nur Administratoren können Umfragen erstellen
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
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Profile still loading
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Registered but not yet approved
  if (!profile.approved) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Registrierung ausstehend</h2>
          <p className="text-gray-600 mb-2">
            Ihr Konto wurde erfolgreich erstellt und wartet auf die Freischaltung durch einen Administrator.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Sie erhalten Zugang, sobald Ihr Konto genehmigt wurde.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800">
            Angemeldet als: <strong>{profile.email}</strong>
          </div>
          <Button
            onClick={signOut}
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Abmelden
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

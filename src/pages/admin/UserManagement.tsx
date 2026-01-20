import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Shield, User, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';

const UserManagement = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    loadCurrentUser();
    loadUsers();
  }, []);

  const loadCurrentUser = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      if (data.role !== 'super_admin') {
        toast.error('Zugriff verweigert');
        navigate('/admin');
        return;
      }
      
      setCurrentUserProfile(data);
    } catch (error) {
      toast.error('Fehler beim Laden des Benutzerprofils');
      navigate('/admin');
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      toast.error('Fehler beim Laden der Benutzer');
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'user' | 'admin' | 'super_admin') => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      
      toast.success('Benutzerrolle aktualisiert');
      loadUsers();
    } catch (error) {
      toast.error('Fehler beim Aktualisieren der Rolle');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Crown className="w-4 h-4" />;
      case 'admin':
        return <Shield className="w-4 h-4" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'admin':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super-Admin';
      case 'admin':
        return 'Admin';
      default:
        return 'Benutzer';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!currentUserProfile || currentUserProfile.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Benutzerverwaltung</h1>
            <p className="text-gray-600">Verwalten Sie Benutzerrollen und Berechtigungen</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Alle Benutzer</CardTitle>
            <CardDescription>
              {users.length} {users.length === 1 ? 'Benutzer' : 'Benutzer'} registriert
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users.map((userProfile) => (
                <div
                  key={userProfile.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      userProfile.role === 'super_admin' 
                        ? 'bg-purple-100' 
                        : userProfile.role === 'admin' 
                        ? 'bg-blue-100' 
                        : 'bg-gray-100'
                    }`}>
                      {getRoleIcon(userProfile.role)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {userProfile.full_name || 'Kein Name'}
                        </h3>
                        <Badge className={getRoleBadgeColor(userProfile.role)}>
                          {getRoleLabel(userProfile.role)}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{userProfile.email}</p>
                    </div>
                  </div>

                  {userProfile.id !== user?.id && (
                    <Select
                      value={userProfile.role}
                      onValueChange={(value: 'user' | 'admin' | 'super_admin') =>
                        updateUserRole(userProfile.id, value)
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Benutzer</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="super_admin">Super-Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {userProfile.id === user?.id && (
                    <Badge variant="outline" className="ml-4">
                      Sie
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserManagement;
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Shield, User, Crown, CheckCircle2, XCircle, Trash2, Clock, Bell, Edit, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const UserManagement = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user, profile: currentUserProfile } = useAuth();

  useEffect(() => {
    if (currentUserProfile && currentUserProfile.role !== 'super_admin') {
      toast.error('Zugriff verweigert');
      navigate('/admin');
      return;
    }
    loadUsers();
  }, [currentUserProfile]);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers((data || []) as Profile[]);
    } catch {
      toast.error('Fehler beim Laden der Benutzer');
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approved: true, role: 'admin' })
        .eq('id', userId);
      if (error) throw error;

      // Mark related notifications as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('type', 'new_registration');

      toast.success('Benutzer freigeschaltet');
      loadUsers();
    } catch {
      toast.error('Fehler beim Freischalten');
    }
  };

  const rejectUser = async (userId: string) => {
    try {
      // Mark notifications as read first
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('type', 'new_registration');

      // Delete the profile (auth user stays but can't log in usefully)
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;

      toast.success('Registrierung abgelehnt');
      loadUsers();
    } catch {
      toast.error('Fehler beim Ablehnen');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Benutzer gelöscht');
      setDeleteTarget(null);
      loadUsers();
    } catch {
      toast.error('Fehler beim Löschen');
    } finally {
      setDeleting(false);
    }
  };

  const openEditDialog = (userProfile: Profile) => {
    setEditTarget(userProfile);
    setEditFirstName(userProfile.first_name || '');
    setEditLastName(userProfile.last_name || '');
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editFirstName.trim() || !editLastName.trim()) {
      toast.error('Vor- und Nachname dürfen nicht leer sein');
      return;
    }

    setSaving(true);
    try {
      const fullName = `${editFirstName.trim()} ${editLastName.trim()}`;
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          full_name: fullName,
        })
        .eq('id', editTarget.id);
      if (error) throw error;
      toast.success('Name aktualisiert');
      setEditTarget(null);
      loadUsers();
    } catch {
      toast.error('Fehler beim Aktualisieren');
    } finally {
      setSaving(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'user' | 'admin' | 'super_admin') => {
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      if (error) throw error;
      toast.success('Benutzerrolle aktualisiert');
      loadUsers();
    } catch {
      toast.error('Fehler beim Aktualisieren der Rolle');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin': return <Crown className="w-4 h-4" />;
      case 'admin': return <Shield className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'admin': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super-Admin';
      case 'admin': return 'Admin';
      default: return 'Benutzer';
    }
  };

  const formatLastLogin = (iso: string | null | undefined): string => {
    if (!iso) return 'Noch nie';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;
    
    return d.toLocaleDateString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const pendingUsers = users.filter((u) => !u.approved && u.role !== 'super_admin');
  const approvedUsers = users.filter((u) => u.approved || u.role === 'super_admin');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!currentUserProfile || currentUserProfile.role !== 'super_admin') return null;

  const UserRow = ({ userProfile, showApproveActions = false }: { userProfile: Profile; showApproveActions?: boolean }) => (
    <div className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${
      showApproveActions ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
    }`}>
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
          userProfile.role === 'super_admin' ? 'bg-purple-100' :
          userProfile.role === 'admin' ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          {showApproveActions ? <Clock className="w-5 h-5 text-amber-500" /> : getRoleIcon(userProfile.role)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">
              {userProfile.first_name && userProfile.last_name
                ? `${userProfile.first_name} ${userProfile.last_name}`
                : userProfile.full_name || 'Kein Name'}
            </h3>
            {!showApproveActions && (
              <Badge className={getRoleBadgeColor(userProfile.role)}>
                {getRoleLabel(userProfile.role)}
              </Badge>
            )}
            {userProfile.id === user?.id && (
              <Badge variant="outline" className="text-xs">Sie</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 truncate">{userProfile.email}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>
              Registriert: {new Date(userProfile.created_at).toLocaleDateString('de-AT', {
                day: '2-digit', month: '2-digit', year: 'numeric'
              })}
            </span>
            {!showApproveActions && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Letzter Login: {formatLastLogin(userProfile.last_login_at)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {showApproveActions ? (
          <>
            <Button
              onClick={() => approveUser(userProfile.id)}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Freischalten
            </Button>
            <Button
              onClick={() => rejectUser(userProfile.id)}
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Ablehnen
            </Button>
          </>
        ) : (
          <>
            {userProfile.id !== user?.id && (
              <>
                <Button
                  onClick={() => openEditDialog(userProfile)}
                  variant="outline"
                  size="icon"
                  title="Namen bearbeiten"
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Select
                  value={userProfile.role}
                  onValueChange={(value: 'user' | 'admin' | 'super_admin') =>
                    updateUserRole(userProfile.id, value)
                  }
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Benutzer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super-Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => setDeleteTarget(userProfile)}
                  variant="outline"
                  size="icon"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                  title="Benutzer löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Benutzerverwaltung</h1>
            <p className="text-gray-600">Registrierungen freischalten und Benutzer verwalten</p>
          </div>
        </div>

        <Tabs defaultValue={pendingUsers.length > 0 ? 'pending' : 'approved'}>
          <TabsList className="mb-6 h-12">
            <TabsTrigger value="pending" className="gap-2 px-6 relative">
              <Bell className="w-4 h-4" />
              Ausstehend
              {pendingUsers.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingUsers.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-2 px-6">
              <CheckCircle2 className="w-4 h-4" />
              Freigeschaltet
              {approvedUsers.length > 0 && (
                <span className="ml-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {approvedUsers.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Pending registrations */}
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Ausstehende Registrierungen
                </CardTitle>
                <CardDescription>
                  Diese Benutzer haben sich registriert und warten auf Ihre Freischaltung.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Keine ausstehenden Registrierungen</p>
                    <p className="text-sm text-gray-400 mt-1">Alle Registrierungen wurden bearbeitet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingUsers.map((u) => (
                      <UserRow key={u.id} userProfile={u} showApproveActions />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Approved users */}
          <TabsContent value="approved">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-500" />
                  Freigeschaltete Benutzer
                </CardTitle>
                <CardDescription>
                  {approvedUsers.length} {approvedUsers.length === 1 ? 'Benutzer' : 'Benutzer'} mit Zugang
                </CardDescription>
              </CardHeader>
              <CardContent>
                {approvedUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Noch keine freigeschalteten Benutzer</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvedUsers.map((u) => (
                      <UserRow key={u.id} userProfile={u} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit name dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open && !saving) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Namen bearbeiten</DialogTitle>
            <DialogDescription>
              Ändern Sie den Vor- und Nachnamen des Benutzers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-first-name">Vorname *</Label>
              <Input
                id="edit-first-name"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                placeholder="Max"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="edit-last-name">Nachname *</Label>
              <Input
                id="edit-last-name"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                placeholder="Mustermann"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              Benutzer löschen?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  Der Benutzer <strong>
                    {deleteTarget?.first_name && deleteTarget?.last_name
                      ? `${deleteTarget.first_name} ${deleteTarget.last_name}`
                      : deleteTarget?.full_name || deleteTarget?.email}
                  </strong> wird unwiderruflich aus der Benutzerverwaltung entfernt.
                </p>
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                  Der Benutzer verliert sofort den Zugang zur Anwendung.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
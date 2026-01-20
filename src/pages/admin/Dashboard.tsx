import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Profile, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, BarChart3, LogOut, Eye, Trash2, Edit, Users, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Dashboard = () => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  const [duplicateSurvey, setDuplicateSurvey] = useState<Survey | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  useEffect(() => {
    loadUserProfile();
    loadSurveys();
  }, []);

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);

      if (data.role === 'user') {
        toast.error('Sie haben keine Berechtigung, Umfragen zu erstellen');
        signOut();
      }
    } catch (error) {
      toast.error('Fehler beim Laden des Benutzerprofils');
    }
  };

  const loadSurveys = async () => {
    try {
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSurveys(data || []);
    } catch (error) {
      toast.error('Fehler beim Laden der Umfragen');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('surveys')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      toast.success('Umfrage gelöscht');
      loadSurveys();
    } catch (error) {
      toast.error('Fehler beim Löschen der Umfrage');
    } finally {
      setDeleteId(null);
    }
  };

  const suggestedDuplicateTitle = useMemo(() => {
    if (!duplicateSurvey) return '';
    return `${duplicateSurvey.title} (Kopie)`;
  }, [duplicateSurvey]);

  const openDuplicateDialog = (survey: Survey) => {
    setDuplicateSurvey(survey);
    setDuplicateTitle(`${survey.title} (Kopie)`);
  };

  const closeDuplicateDialog = () => {
    if (duplicating) return;
    setDuplicateSurvey(null);
    setDuplicateTitle('');
  };

  const handleDuplicate = async () => {
    if (!duplicateSurvey) return;
    if (!user?.id) {
      toast.error('Nicht angemeldet');
      return;
    }

    const title = duplicateTitle.trim();
    if (!title) {
      toast.error('Bitte geben Sie einen Namen für die Kopie ein');
      return;
    }

    setDuplicating(true);

    try {
      // 1) Survey kopieren
      const { data: newSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert({
          title,
          description: duplicateSurvey.description,
          created_by: user.id,
          is_active: duplicateSurvey.is_active,
        })
        .select('*')
        .single();

      if (surveyError) throw surveyError;

      // 2) Fragen laden und kopieren
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', duplicateSurvey.id)
        .order('order_index');

      if (questionsError) throw questionsError;

      const oldQuestions = (questions || []) as Question[];
      const questionIdMap = new Map<string, string>();

      for (const q of oldQuestions) {
        const { data: insertedQuestion, error: insertQError } = await supabase
          .from('questions')
          .insert({
            survey_id: newSurvey.id,
            question_text: q.question_text,
            question_type: q.question_type,
            order_index: q.order_index,
          })
          .select('*')
          .single();

        if (insertQError) throw insertQError;
        questionIdMap.set(q.id, insertedQuestion.id);
      }

      // 3) Optionen laden und kopieren
      const oldQuestionIds = oldQuestions.map((q) => q.id);
      if (oldQuestionIds.length > 0) {
        const { data: options, error: optionsError } = await supabase
          .from('options')
          .select('*')
          .in('question_id', oldQuestionIds)
          .order('order_index');

        if (optionsError) throw optionsError;

        const optionInserts = (options || []).map((opt: Option) => ({
          question_id: questionIdMap.get(opt.question_id)!,
          option_text: opt.option_text,
          order_index: opt.order_index,
        }));

        if (optionInserts.length > 0) {
          const { error: insertOptionsError } = await supabase
            .from('options')
            .insert(optionInserts);

          if (insertOptionsError) throw insertOptionsError;
        }
      }

      toast.success('Umfrage dupliziert');
      closeDuplicateDialog();
      loadSurveys();
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Duplizieren der Umfrage');
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Verwalten Sie Ihre Umfragen</p>
            </div>
          </div>
          <div className="flex gap-3">
            {userProfile?.role === 'super_admin' && (
              <Button onClick={() => navigate('/admin/users')} variant="outline" size="lg">
                <Users className="w-5 h-5 mr-2" />
                Benutzer
              </Button>
            )}
            <Button onClick={() => navigate('/admin/create')} size="lg" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-5 h-5 mr-2" />
              Neue Umfrage
            </Button>
            <Button onClick={signOut} variant="outline" size="lg">
              <LogOut className="w-5 h-5 mr-2" />
              Abmelden
            </Button>
          </div>
        </div>

        {surveys.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BarChart3 className="w-16 h-16 text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Keine Umfragen vorhanden</h3>
              <p className="text-gray-600 mb-6">Erstellen Sie Ihre erste Umfrage</p>
              <Button onClick={() => navigate('/admin/create')} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-5 h-5 mr-2" />
                Umfrage erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {surveys.map((survey) => (
              <Card key={survey.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{survey.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {survey.description || 'Keine Beschreibung'}
                      </CardDescription>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      survey.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {survey.is_active ? 'Aktiv' : 'Inaktiv'}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => navigate(`/admin/results/${survey.id}`)}
                      variant="outline"
                      className="flex-1"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Ergebnisse
                    </Button>
                    <Button
                      onClick={() => openDuplicateDialog(survey)}
                      variant="outline"
                      size="icon"
                      title="Duplizieren"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => navigate(`/admin/edit/${survey.id}`)}
                      variant="outline"
                      size="icon"
                      title="Bearbeiten"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => setDeleteId(survey.id)}
                      variant="outline"
                      size="icon"
                      className="text-red-600 hover:text-red-700"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Umfrage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Alle Fragen und Antworten werden ebenfalls gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!duplicateSurvey} onOpenChange={(open) => !open && closeDuplicateDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Umfrage duplizieren</DialogTitle>
            <DialogDescription>
              Die Fragen und Antwortoptionen werden 1:1 kopiert. Ergebnisse/Antworten werden nicht übernommen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="duplicate-title">Neuer Name</Label>
            <Input
              id="duplicate-title"
              value={duplicateTitle}
              onChange={(e) => setDuplicateTitle(e.target.value)}
              placeholder={suggestedDuplicateTitle || 'z.B. Mitarbeiterumfrage (Kopie)'}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDuplicateDialog} disabled={duplicating}>
              Abbrechen
            </Button>
            <Button onClick={handleDuplicate} disabled={duplicating} className="bg-blue-600 hover:bg-blue-700">
              {duplicating ? 'Dupliziere…' : 'Duplizieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
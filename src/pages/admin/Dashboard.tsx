import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Profile, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, BarChart3, LogOut, Eye, Trash2, Edit, Users, Copy,
  Rocket, FileText, QrCode, Share2, Lock, Clock, UserCheck, CalendarClock, CalendarX2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { decodeDescriptionWithMeta, encodeDescriptionWithMeta } from '@/utils/surveyMeta';
import { QRCodeSVG } from 'qrcode.react';

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizeSurvey(s: any): Survey {
  const decoded = decodeDescriptionWithMeta(s.description);
  return {
    ...s,
    description: decoded.description,
    max_votes: s.max_votes ?? decoded.meta.max_votes ?? null,
    expires_at: s.expires_at ?? decoded.meta.expires_at ?? null,
    status: s.status ?? 'draft',
  } as Survey;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ── component ─────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [responseCounts, setResponseCounts] = useState<{ [surveyId: string]: number }>({});

  // dialogs
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; status: 'draft' | 'published'; title: string } | null>(null);
  const [deleteResponseCount, setDeleteResponseCount] = useState<number | null>(null);
  const [loadingResponseCount, setLoadingResponseCount] = useState(false);
  const [publishSurvey, setPublishSurvey] = useState<Survey | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [duplicateSurvey, setDuplicateSurvey] = useState<Survey | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const drafts = useMemo(() => surveys.filter((s) => s.status === 'draft'), [surveys]);
  const published = useMemo(() => surveys.filter((s) => s.status === 'published'), [surveys]);

  useEffect(() => {
    loadUserProfile();
    loadSurveys();
  }, []);

  // ── data ────────────────────────────────────────────────────────────────────

  const loadUserProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) throw error;
      setUserProfile(data);
      if (data.role === 'user') { toast.error('Keine Berechtigung'); signOut(); }
    } catch { toast.error('Fehler beim Laden des Benutzerprofils'); }
  };

  const loadSurveys = async () => {
    try {
      const { data, error } = await supabase.from('surveys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const normalized = (data || []).map(normalizeSurvey);
      setSurveys(normalized);

      const publishedSurveys = normalized.filter((s) => s.status === 'published');
      if (publishedSurveys.length > 0) loadResponseCounts(publishedSurveys.map((s) => s.id));
    } catch { toast.error('Fehler beim Laden der Umfragen'); }
    finally { setLoading(false); }
  };

  const loadResponseCounts = async (surveyIds: string[]) => {
    try {
      const { data: questions } = await supabase
        .from('questions').select('id, survey_id').in('survey_id', surveyIds);
      if (!questions || questions.length === 0) return;

      const qIds = questions.map((q: any) => q.id);
      const { data: responses } = await supabase
        .from('responses').select('question_id, participant_id').in('question_id', qIds);

      const counts: { [surveyId: string]: Set<string> } = {};
      for (const q of questions) {
        if (!counts[q.survey_id]) counts[q.survey_id] = new Set();
      }
      for (const r of (responses || [])) {
        const q = questions.find((q: any) => q.id === r.question_id);
        if (q) counts[q.survey_id]?.add(r.participant_id);
      }

      const result: { [surveyId: string]: number } = {};
      for (const [sid, set] of Object.entries(counts)) result[sid] = set.size;
      setResponseCounts(result);
    } catch { /* ignore */ }
  };

  // ── actions ─────────────────────────────────────────────────────────────────

  const openDeleteDialog = async (survey: Survey) => {
    setDeleteTarget({ id: survey.id, status: survey.status, title: survey.title });
    if (survey.status === 'published') {
      setLoadingResponseCount(true);
      setDeleteResponseCount(null);
      try {
        const { data: qs } = await supabase.from('questions').select('id').eq('survey_id', survey.id);
        const qIds = (qs || []).map((q: any) => q.id);
        if (qIds.length > 0) {
          const { data: rs } = await supabase.from('responses').select('participant_id').in('question_id', qIds);
          setDeleteResponseCount(new Set((rs || []).map((r: any) => r.participant_id)).size);
        } else {
          setDeleteResponseCount(0);
        }
      } catch { setDeleteResponseCount(0); }
      finally { setLoadingResponseCount(false); }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from('surveys').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Umfrage gelöscht');
      loadSurveys();
    } catch { toast.error('Fehler beim Löschen'); }
    finally { setDeleteTarget(null); setDeleteResponseCount(null); }
  };

  /**
   * Produktiv schalten: Die Vorlage bleibt als Draft erhalten.
   * Es wird eine interne Kopie erstellt, die sofort auf "published" gesetzt wird.
   */
  const handlePublish = async () => {
    if (!publishSurvey || !user?.id) return;
    setPublishing(true);
    try {
      const now = new Date().toISOString();
      const descriptionWithMeta = encodeDescriptionWithMeta(publishSurvey.description ?? '', {
        max_votes: publishSurvey.max_votes ?? null,
        expires_at: publishSurvey.expires_at ?? null,
      });

      // 1. Neue Kopie als "published" anlegen
      const { data: newSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert({
          title: publishSurvey.title,
          description: descriptionWithMeta,
          created_by: user.id,
          is_active: true,
          status: 'published',
          published_at: now,
          max_votes: publishSurvey.max_votes ?? null,
          expires_at: publishSurvey.expires_at ?? null,
        })
        .select('*').single();
      if (surveyError) throw surveyError;

      // 2. Fragen kopieren
      const { data: questions, error: qErr } = await supabase
        .from('questions').select('*').eq('survey_id', publishSurvey.id).order('order_index');
      if (qErr) throw qErr;

      const oldQuestions = (questions || []) as Question[];
      const qIdMap = new Map<string, string>();

      for (const q of oldQuestions) {
        const { data: iq, error: iqErr } = await supabase
          .from('questions')
          .insert({
            survey_id: newSurvey.id,
            question_text: q.question_text,
            question_type: q.question_type,
            order_index: q.order_index,
          })
          .select('*').single();
        if (iqErr) throw iqErr;
        qIdMap.set(q.id, iq.id);
      }

      // 3. Optionen kopieren
      const oldQIds = oldQuestions.map((q) => q.id);
      if (oldQIds.length > 0) {
        const { data: options, error: oErr } = await supabase
          .from('options').select('*').in('question_id', oldQIds).order('order_index');
        if (oErr) throw oErr;
        const inserts = (options || []).map((opt: Option) => ({
          question_id: qIdMap.get(opt.question_id)!,
          option_text: opt.option_text,
          order_index: opt.order_index,
        }));
        if (inserts.length > 0) {
          const { error: iErr } = await supabase.from('options').insert(inserts);
          if (iErr) throw iErr;
        }
      }

      toast.success('Umfrage ist jetzt produktiv! Die Vorlage bleibt erhalten.');
      loadSurveys();
    } catch (e) { console.error(e); toast.error('Fehler beim Produktivschalten'); }
    finally { setPublishing(false); setPublishSurvey(null); }
  };

  const handleDuplicate = async () => {
    if (!duplicateSurvey || !user?.id) return;
    const title = duplicateTitle.trim();
    if (!title) { toast.error('Bitte einen Namen eingeben'); return; }

    setDuplicating(true);
    try {
      const descriptionWithMeta = encodeDescriptionWithMeta(duplicateSurvey.description ?? '', {
        max_votes: duplicateSurvey.max_votes ?? null,
        expires_at: duplicateSurvey.expires_at ?? null,
      });

      const { data: newSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert({ title, description: descriptionWithMeta, created_by: user.id, is_active: false, status: 'draft' })
        .select('*').single();
      if (surveyError) throw surveyError;

      const { data: questions, error: qErr } = await supabase
        .from('questions').select('*').eq('survey_id', duplicateSurvey.id).order('order_index');
      if (qErr) throw qErr;

      const oldQuestions = (questions || []) as Question[];
      const qIdMap = new Map<string, string>();

      for (const q of oldQuestions) {
        const { data: iq, error: iqErr } = await supabase
          .from('questions')
          .insert({ survey_id: newSurvey.id, question_text: q.question_text, question_type: q.question_type, order_index: q.order_index })
          .select('*').single();
        if (iqErr) throw iqErr;
        qIdMap.set(q.id, iq.id);
      }

      const oldQIds = oldQuestions.map((q) => q.id);
      if (oldQIds.length > 0) {
        const { data: options, error: oErr } = await supabase
          .from('options').select('*').in('question_id', oldQIds).order('order_index');
        if (oErr) throw oErr;
        const inserts = (options || []).map((opt: Option) => ({
          question_id: qIdMap.get(opt.question_id)!,
          option_text: opt.option_text,
          order_index: opt.order_index,
        }));
        if (inserts.length > 0) {
          const { error: iErr } = await supabase.from('options').insert(inserts);
          if (iErr) throw iErr;
        }
      }

      toast.success('Als neue Vorlage dupliziert');
      setDuplicateSurvey(null);
      setDuplicateTitle('');
      loadSurveys();
    } catch (e) { console.error(e); toast.error('Fehler beim Duplizieren'); }
    finally { setDuplicating(false); }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const SurveyCardDraft = ({ survey }: { survey: Survey }) => (
    <Card className="hover:shadow-lg transition-all border-2 border-dashed border-amber-200 bg-amber-50/30">
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <CardTitle className="text-lg truncate">{survey.title}</CardTitle>
            </div>
            <CardDescription className="line-clamp-2">
              {survey.description || 'Keine Beschreibung'}
            </CardDescription>
          </div>
          <Badge className="bg-amber-100 text-amber-700 border-amber-300 flex-shrink-0">Vorlage</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Timestamp */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
          <span>Zuletzt bearbeitet: <span className="font-medium text-gray-700">{formatTimestamp(survey.updated_at || survey.created_at)}</span></span>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate(`/admin/edit/${survey.id}`)}
            variant="outline"
            className="flex-1 border-amber-300 hover:bg-amber-50"
          >
            <Edit className="w-4 h-4 mr-2" />
            Bearbeiten
          </Button>
          <Button
            onClick={() => { setDuplicateSurvey(survey); setDuplicateTitle(`${survey.title} (Kopie)`); }}
            variant="outline" size="icon" title="Als neue Vorlage duplizieren"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => openDeleteDialog(survey)}
            variant="outline" size="icon"
            className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Löschen"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setPublishSurvey(survey)} className="w-full bg-blue-600 hover:bg-blue-700">
          <Rocket className="w-4 h-4 mr-2" />
          Produktiv schalten
        </Button>
      </CardContent>
    </Card>
  );

  const SurveyCardPublished = ({ survey }: { survey: Survey }) => {
    const url = `${window.location.origin}/survey/${survey.id}`;
    const count = responseCounts[survey.id] ?? null;
    const expired = isExpired(survey.expires_at);
    return (
      <Card className="hover:shadow-lg transition-all border-2 border-green-200 bg-green-50/20">
        <CardHeader>
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Rocket className="w-4 h-4 text-green-600 flex-shrink-0" />
                <CardTitle className="text-lg truncate">{survey.title}</CardTitle>
              </div>
              <CardDescription className="line-clamp-2">
                {survey.description || 'Keine Beschreibung'}
              </CardDescription>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-300 flex-shrink-0">Produktiv</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Teilnehmeranzahl */}
          <div className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <UserCheck className="w-3.5 h-3.5 flex-shrink-0 text-green-600" />
            <span className="text-gray-600">Teilnehmer:</span>
            {count === null
              ? <span className="text-gray-400 italic">wird geladen…</span>
              : <span className="font-semibold text-green-700">{count} {count === 1 ? 'Person' : 'Personen'}</span>}
          </div>

          {/* Produktiv seit */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <CalendarClock className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            <span>Produktiv seit: <span className="font-medium text-gray-700">{formatTimestamp(survey.published_at)}</span></span>
          </div>

          {/* Ablaufdatum */}
          {survey.expires_at && (
            <div className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${expired ? 'bg-red-50 border border-red-100' : 'bg-blue-50 border border-blue-100'}`}>
              <CalendarX2 className={`w-3.5 h-3.5 flex-shrink-0 ${expired ? 'text-red-500' : 'text-blue-500'}`} />
              <span className={expired ? 'text-red-700' : 'text-gray-600'}>
                {expired ? 'Abgelaufen am: ' : 'Läuft ab am: '}
                <span className="font-medium">{formatDateOnly(survey.expires_at)}</span>
              </span>
              {expired && <span className="ml-auto bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">Abgelaufen</span>}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => navigate(`/admin/results/${survey.id}`)}
              variant="outline"
              className="flex-1 border-green-300 hover:bg-green-50"
            >
              <Eye className="w-4 h-4 mr-2" />
              Auswertung
            </Button>
            <Button
              onClick={() => setShareUrl(url)}
              variant="outline" size="icon" title="Teilen / QR-Code"
              className="border-green-300 hover:bg-green-50"
            >
              <QrCode className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => { setDuplicateSurvey(survey); setDuplicateTitle(`${survey.title} (Kopie)`); }}
              variant="outline" size="icon" title="Als neue Vorlage duplizieren"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => openDeleteDialog(survey)}
              variant="outline" size="icon"
              className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Löschen"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <Lock className="w-3 h-3 flex-shrink-0" />
            <span>Gesperrt – kann nicht mehr bearbeitet werden</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const EmptyState = ({ mode }: { mode: 'draft' | 'published' }) => (
    <Card className="border-2 border-dashed col-span-full">
      <CardContent className="flex flex-col items-center justify-center py-16">
        {mode === 'draft'
          ? <FileText className="w-16 h-16 text-amber-400 mb-4" />
          : <Rocket className="w-16 h-16 text-green-400 mb-4" />}
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {mode === 'draft' ? 'Keine Vorlagen vorhanden' : 'Keine produktiven Umfragen'}
        </h3>
        <p className="text-gray-600 mb-6 text-center max-w-sm">
          {mode === 'draft'
            ? 'Erstellen Sie eine neue Vorlage und gestalten Sie Ihre Umfrage.'
            : 'Schalten Sie eine Vorlage produktiv, um sie mit Teilnehmern zu teilen.'}
        </p>
        {mode === 'draft' && (
          <Button onClick={() => navigate('/admin/create')} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-5 h-5 mr-2" />
            Neue Vorlage erstellen
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">

        {/* Header */}
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
          <div className="flex gap-3 flex-wrap justify-end">
            {userProfile?.role === 'super_admin' && (
              <Button onClick={() => navigate('/admin/users')} variant="outline" size="lg">
                <Users className="w-5 h-5 mr-2" />
                Benutzer
              </Button>
            )}
            <Button onClick={() => navigate('/admin/create')} size="lg" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-5 h-5 mr-2" />
              Neue Vorlage
            </Button>
            <Button onClick={signOut} variant="outline" size="lg">
              <LogOut className="w-5 h-5 mr-2" />
              Abmelden
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="drafts">
          <TabsList className="mb-6 h-12">
            <TabsTrigger value="drafts" className="gap-2 px-6">
              <FileText className="w-4 h-4" />
              Vorlagen
              {drafts.length > 0 && (
                <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {drafts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="published" className="gap-2 px-6">
              <Rocket className="w-4 h-4" />
              Produktiv
              {published.length > 0 && (
                <span className="ml-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {published.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drafts">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {drafts.length === 0
                ? <EmptyState mode="draft" />
                : drafts.map((s) => <SurveyCardDraft key={s.id} survey={s} />)}
            </div>
          </TabsContent>

          <TabsContent value="published">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {published.length === 0
                ? <EmptyState mode="published" />
                : published.map((s) => <SurveyCardPublished key={s.id} survey={s} />)}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Publish confirmation */}
      <AlertDialog open={!!publishSurvey} onOpenChange={() => { if (!publishing) setPublishSurvey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-blue-600" />
              Umfrage produktiv schalten?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  Von der Vorlage <strong>„{publishSurvey?.title}"</strong> wird eine Kopie erstellt und sofort für Teilnehmer freigegeben.
                </p>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-blue-800">
                  ✅ Die Vorlage bleibt unverändert erhalten und kann weiterhin bearbeitet werden.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={publishing} className="bg-blue-600 hover:bg-blue-700">
              <Rocket className="w-4 h-4 mr-2" />
              {publishing ? 'Wird veröffentlicht…' : 'Produktiv schalten'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation – Draft */}
      <AlertDialog
        open={!!deleteTarget && deleteTarget.status === 'draft'}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Vorlage löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Die Vorlage <strong>„{deleteTarget?.title}"</strong> wird unwiderruflich gelöscht.
              Alle Fragen und Antwortoptionen werden ebenfalls entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="w-4 h-4 mr-2" />
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation – Published */}
      <AlertDialog
        open={!!deleteTarget && deleteTarget.status === 'published'}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteResponseCount(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              Produktive Umfrage löschen?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  Sie sind dabei, die produktive Umfrage{' '}
                  <strong>„{deleteTarget?.title}"</strong> dauerhaft zu löschen.
                </p>
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                  <p className="font-semibold text-red-800">Folgende Daten werden unwiderruflich gelöscht:</p>
                  <ul className="list-disc list-inside text-red-700 space-y-0.5">
                    <li>Die Umfrage und alle Fragen</li>
                    <li>Alle Antwortoptionen</li>
                    <li>
                      {loadingResponseCount
                        ? 'Antworten werden gezählt…'
                        : deleteResponseCount !== null
                          ? <>Alle Antworten von <strong>{deleteResponseCount} {deleteResponseCount === 1 ? 'Teilnehmer' : 'Teilnehmern'}</strong></>
                          : 'Alle gesammelten Antworten'}
                    </li>
                  </ul>
                </div>
                <p className="font-medium text-gray-900">Diese Aktion kann nicht rückgängig gemacht werden.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loadingResponseCount}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Ja, alles löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate dialog */}
      <Dialog open={!!duplicateSurvey} onOpenChange={(open) => { if (!open && !duplicating) { setDuplicateSurvey(null); setDuplicateTitle(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Als neue Vorlage duplizieren</DialogTitle>
            <DialogDescription>
              Fragen und Antwortoptionen werden kopiert. Antworten werden nicht übernommen. Die Kopie startet als Vorlage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dup-title">Name der neuen Vorlage</Label>
            <Input
              id="dup-title"
              value={duplicateTitle}
              onChange={(e) => setDuplicateTitle(e.target.value)}
              placeholder="z.B. Mitarbeiterumfrage (Kopie)"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDuplicateSurvey(null); setDuplicateTitle(''); }} disabled={duplicating}>
              Abbrechen
            </Button>
            <Button onClick={handleDuplicate} disabled={duplicating} className="bg-blue-600 hover:bg-blue-700">
              {duplicating ? 'Dupliziere…' : 'Duplizieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share / QR dialog */}
      <Dialog open={!!shareUrl} onOpenChange={() => setShareUrl(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Umfrage teilen</DialogTitle>
            <DialogDescription>Scannen Sie den QR-Code oder kopieren Sie den Link.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="bg-white p-4 rounded-xl border-2">
              {shareUrl && <QRCodeSVG value={shareUrl} size={220} />}
            </div>
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={shareUrl ?? ''}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50"
              />
              <Button
                size="icon"
                onClick={() => { navigator.clipboard.writeText(shareUrl ?? ''); toast.success('Link kopiert!'); }}
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;

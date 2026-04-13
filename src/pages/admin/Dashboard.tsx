import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, BarChart3, LogOut, Eye, Trash2, Edit, Users, Copy,
  Rocket, FileText, QrCode, Share2, Lock, Clock, UserCheck, CalendarClock, CalendarX2, ScanEye, Download,
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
import { QRCodeSVG } from 'qrcode.react';

// ── helpers ──────────────────────────────────────────────────────────────────

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
  const [responseCounts, setResponseCounts] = useState<{ [surveyId: string]: number }>({});
  const [pendingCount, setPendingCount] = useState(0);

  // dialogs
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; status: 'draft' | 'published'; title: string } | null>(null);
  const [deleteResponseCount, setDeleteResponseCount] = useState<number | null>(null);
  const [loadingResponseCount, setLoadingResponseCount] = useState(false);
  const [publishSurvey, setPublishSurvey] = useState<Survey | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishExpiresAt, setPublishExpiresAt] = useState('');
  const [publishMaxVotes, setPublishMaxVotes] = useState('');
  const [duplicateSurvey, setDuplicateSurvey] = useState<Survey | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareSurveyTitle, setShareSurveyTitle] = useState<string>('');

  const navigate = useNavigate();
  // Use profile from AuthContext — no extra DB call needed
  const { signOut, user, profile } = useAuth();

  const drafts = useMemo(() => surveys.filter((s) => s.status === 'draft'), [surveys]);
  
  // Published surveys: only show surveys created by current user
  const published = useMemo(() =>
    surveys.filter((s) => s.status === 'published' && s.created_by === user?.id),
    [surveys, user?.id]
  );
  
  // Private templates: created by current user
  const privateTemplates = useMemo(() =>
    drafts.filter((s) => s.created_by === user?.id),
    [drafts, user?.id]
  );
  
  // Public templates: created by others and marked as public
  const publicTemplates = useMemo(() =>
    drafts.filter((s) => s.created_by !== user?.id && s.visibility === 'public'),
    [drafts, user?.id]
  );

  useEffect(() => {
    loadSurveys();
  }, []);

  // Load pending count only for super_admins
  useEffect(() => {
    if (profile?.role === 'super_admin') {
      loadPendingCount();
    }
  }, [profile]);

  const loadPendingCount = async () => {
    try {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('approved', false)
        .neq('role', 'super_admin');
      setPendingCount(count ?? 0);
    } catch { /* ignore */ }
  };

  // ── data ────────────────────────────────────────────────────────────────────

  const loadSurveys = async () => {
    try {
      const { data, error } = await supabase.from('surveys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSurveys(data || []);

      const publishedSurveys = (data || []).filter((s: Survey) => s.status === 'published');
      if (publishedSurveys.length > 0) loadResponseCounts(publishedSurveys.map((s: Survey) => s.id));
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

  const handlePublish = async () => {
    if (!publishSurvey || !user?.id) return;
    
    // Validate
    if (!publishExpiresAt.trim()) {
      toast.error('Bitte geben Sie ein Ablaufdatum an');
      return;
    }
    const expiresAtDate = new Date(publishExpiresAt);
    if (Number.isNaN(expiresAtDate.getTime())) {
      toast.error('Ungültiges Ablaufdatum');
      return;
    }
    if (expiresAtDate.getTime() <= Date.now()) {
      toast.error('Das Ablaufdatum muss in der Zukunft liegen');
      return;
    }
    const parsedMaxVotes = publishMaxVotes.trim() ? Number.parseInt(publishMaxVotes, 10) : null;
    if (publishMaxVotes.trim() && (!Number.isFinite(parsedMaxVotes) || (parsedMaxVotes ?? 0) < 1)) {
      toast.error('Das Stimmen-Limit muss ≥ 1 sein');
      return;
    }
    
    setPublishing(true);
    try {
      const now = new Date().toISOString();

      const { data: newSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert({
          title: publishSurvey.title,
          description: publishSurvey.description,
          created_by: user.id,
          is_active: true,
          status: 'published',
          published_at: now,
          max_votes: parsedMaxVotes,
          expires_at: expiresAtDate.toISOString(),
          visibility: 'private', // Published surveys are not templates
          allow_copy: true,
          allow_edit: false,
        })
        .select('*').single();
      if (surveyError) throw surveyError;

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
            max_text_answers: (q as any).max_text_answers ?? null,
          })
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

      toast.success('Umfrage ist jetzt produktiv! Die Vorlage bleibt erhalten.');
      loadSurveys();
    } catch (e) { console.error(e); toast.error('Fehler beim Produktivschalten'); }
    finally {
      setPublishing(false);
      setPublishSurvey(null);
      setPublishExpiresAt('');
      setPublishMaxVotes('');
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateSurvey || !user?.id) return;
    const title = duplicateTitle.trim();
    if (!title) { toast.error('Bitte einen Namen eingeben'); return; }

    setDuplicating(true);
    try {
      const { data: newSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert({
          title,
          description: duplicateSurvey.description,
          created_by: user.id,
          is_active: false,
          status: 'draft',
          max_votes: duplicateSurvey.max_votes ?? null,
          expires_at: duplicateSurvey.expires_at ?? null,
          visibility: 'private', // Always private when duplicating
          allow_copy: true,
          allow_edit: false,
        })
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
          .insert({
            survey_id: newSurvey.id,
            question_text: q.question_text,
            question_type: q.question_type,
            order_index: q.order_index,
            max_text_answers: (q as any).max_text_answers ?? null,
          })
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

  const openShareDialog = (survey: Survey) => {
    setShareUrl(`${window.location.origin}/survey/${survey.id}`);
    setShareSurveyTitle(survey.title);
  };

  const downloadQrCode = (containerId: string, title: string) => {
    const svg = document.querySelector(`#${containerId} svg`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `QR_${title.replace(/[^a-z0-9]/gi, '_')}.png`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('QR-Code heruntergeladen!');
      });
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
          <span>Zuletzt bearbeitet: <span className="font-medium text-gray-700">{formatTimestamp(survey.updated_at || survey.created_at)}</span></span>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate(`/admin/edit/${survey.id}`)} variant="outline" className="flex-1 border-amber-300 hover:bg-amber-50">
            <Edit className="w-4 h-4 mr-2" />Bearbeiten
          </Button>
          <Button onClick={() => { setDuplicateSurvey(survey); setDuplicateTitle(`${survey.title} (Kopie)`); }} variant="outline" size="icon" title="Duplizieren">
            <Copy className="w-4 h-4" />
          </Button>
          <Button onClick={() => openDeleteDialog(survey)} variant="outline" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Löschen">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setPublishSurvey(survey)} className="w-full bg-blue-600 hover:bg-blue-700">
          <Rocket className="w-4 h-4 mr-2" />Produktiv schalten
        </Button>
      </CardContent>
    </Card>
  );

  const SurveyCardPublished = ({ survey }: { survey: Survey }) => {
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
              <CardDescription className="line-clamp-2">{survey.description || 'Keine Beschreibung'}</CardDescription>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-300 flex-shrink-0">Produktiv</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <UserCheck className="w-3.5 h-3.5 flex-shrink-0 text-green-600" />
            <span className="text-gray-600">Teilnehmer:</span>
            {count === null
              ? <span className="text-gray-400 italic">wird geladen…</span>
              : <span className="font-semibold text-green-700">{count} {count === 1 ? 'Person' : 'Personen'}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <CalendarClock className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            <span>Produktiv seit: <span className="font-medium text-gray-700">{formatTimestamp(survey.published_at)}</span></span>
          </div>
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
            <Button onClick={() => navigate(`/admin/results/${survey.id}`)} variant="outline" className="flex-1 border-green-300 hover:bg-green-50">
              <Eye className="w-4 h-4 mr-2" />Auswertung
            </Button>
            <Button onClick={() => navigate(`/admin/preview/${survey.id}`)} variant="outline" size="icon" title="Vorschau" className="border-blue-300 hover:bg-blue-50 text-blue-600">
              <ScanEye className="w-4 h-4" />
            </Button>
            <Button onClick={() => openShareDialog(survey)} variant="outline" size="icon" title="Teilen / QR-Code" className="border-green-300 hover:bg-green-50">
              <QrCode className="w-4 h-4" />
            </Button>
            <Button onClick={() => { setDuplicateSurvey(survey); setDuplicateTitle(`${survey.title} (Kopie)`); }} variant="outline" size="icon" title="Duplizieren">
              <Copy className="w-4 h-4" />
            </Button>
            <Button onClick={() => openDeleteDialog(survey)} variant="outline" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Löschen">
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

  const SurveyCardPublic = ({ survey }: { survey: Survey }) => {
    const canEdit = survey.allow_edit;
    const canCopy = survey.allow_copy;
    const isCollaborative = canEdit; // Collaborative if editing is allowed
    
    return (
      <Card className={`hover:shadow-lg transition-all border-2 ${isCollaborative ? 'border-green-200 bg-green-50/30' : 'border-purple-200 bg-purple-50/30'}`}>
        <CardHeader>
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Users className={`w-4 h-4 flex-shrink-0 ${isCollaborative ? 'text-green-600' : 'text-purple-600'}`} />
                <CardTitle className="text-lg truncate">{survey.title}</CardTitle>
              </div>
              <CardDescription className="line-clamp-2">
                {survey.description || 'Keine Beschreibung'}
              </CardDescription>
            </div>
            <Badge className={isCollaborative ? 'bg-green-100 text-green-700 border-green-300 flex-shrink-0' : 'bg-purple-100 text-purple-700 border-purple-300 flex-shrink-0'}>
              {isCollaborative ? 'Kollaborativ' : 'Öffentlich'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <UserCheck className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
            <span>Erstellt von anderem Benutzer</span>
          </div>
          {isCollaborative && (
            <div className="flex items-start gap-2 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Users className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Diese Vorlage kann von allen Benutzern gemeinsam bearbeitet werden</span>
            </div>
          )}
          {!isCollaborative && canCopy && (
            <div className="flex items-start gap-2 text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
              <Copy className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Sie können eine private Kopie erstellen und diese bearbeiten</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {canEdit && (
                <Button onClick={() => navigate(`/admin/edit/${survey.id}`)} variant="outline" className={`flex-1 ${isCollaborative ? 'border-green-300 hover:bg-green-50' : 'border-purple-300 hover:bg-purple-50'}`}>
                  <Edit className="w-4 h-4 mr-2" />Bearbeiten
                </Button>
              )}
              {canCopy && (
                <Button onClick={() => { setDuplicateSurvey(survey); setDuplicateTitle(`${survey.title} (Kopie)`); }} variant="outline" className={canEdit ? '' : 'flex-1'}>
                  <Copy className="w-4 h-4 mr-2" />Kopie erstellen
                </Button>
              )}
              {!canEdit && !canCopy && (
                <Button onClick={() => navigate(`/admin/edit/${survey.id}`)} variant="outline" className="flex-1 border-purple-300 hover:bg-purple-50">
                  <Eye className="w-4 h-4 mr-2" />Ansehen
                </Button>
              )}
            </div>
            {canCopy && (
              <Button onClick={() => setPublishSurvey(survey)} className="w-full bg-blue-600 hover:bg-blue-700">
                <Rocket className="w-4 h-4 mr-2" />Produktiv schalten
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const EmptyState = ({ mode }: { mode: 'draft' | 'published' | 'public' }) => (
    <Card className="border-2 border-dashed col-span-full">
      <CardContent className="flex flex-col items-center justify-center py-16">
        {mode === 'draft' && <FileText className="w-16 h-16 text-amber-400 mb-4" />}
        {mode === 'published' && <Rocket className="w-16 h-16 text-green-400 mb-4" />}
        {mode === 'public' && <Users className="w-16 h-16 text-purple-400 mb-4" />}
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {mode === 'draft' && 'Keine Vorlagen vorhanden'}
          {mode === 'published' && 'Keine produktiven Umfragen'}
          {mode === 'public' && 'Keine öffentlichen Vorlagen'}
        </h3>
        <p className="text-gray-600 mb-6 text-center max-w-sm">
          {mode === 'draft' && 'Erstellen Sie eine neue Vorlage und gestalten Sie Ihre Umfrage.'}
          {mode === 'published' && 'Schalten Sie eine Vorlage produktiv, um sie mit Teilnehmern zu teilen.'}
          {mode === 'public' && 'Andere Benutzer haben noch keine Vorlagen öffentlich geteilt.'}
        </p>
        {mode === 'draft' && (
          <Button onClick={() => navigate('/admin/create')} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-5 h-5 mr-2" />Neue Vorlage erstellen
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
            {profile?.role === 'super_admin' && (
              <Button onClick={() => navigate('/admin/users')} variant="outline" size="lg" className="relative">
                <Users className="w-5 h-5 mr-2" />
                Benutzer
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </Button>
            )}
            <Button onClick={() => navigate('/admin/create')} size="lg" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-5 h-5 mr-2" />Neue Vorlage
            </Button>
            <Button onClick={signOut} variant="outline" size="lg">
              <LogOut className="w-5 h-5 mr-2" />Abmelden
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="private">
          <TabsList className="mb-6 h-12">
            <TabsTrigger value="private" className="gap-2 px-6">
              <Lock className="w-4 h-4" />
              Meine Vorlagen
              {privateTemplates.length > 0 && (
                <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">{privateTemplates.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="public" className="gap-2 px-6">
              <Users className="w-4 h-4" />
              Öffentliche Vorlagen
              {publicTemplates.length > 0 && (
                <span className="ml-1 bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full">{publicTemplates.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="published" className="gap-2 px-6">
              <Rocket className="w-4 h-4" />
              Produktiv
              {published.length > 0 && (
                <span className="ml-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{published.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="private">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {privateTemplates.length === 0 ? <EmptyState mode="draft" /> : privateTemplates.map((s) => <SurveyCardDraft key={s.id} survey={s} />)}
            </div>
          </TabsContent>

          <TabsContent value="public">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicTemplates.length === 0 ? <EmptyState mode="public" /> : publicTemplates.map((s) => <SurveyCardPublic key={s.id} survey={s} />)}
            </div>
          </TabsContent>

          <TabsContent value="published">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {published.length === 0 ? <EmptyState mode="published" /> : published.map((s) => <SurveyCardPublished key={s.id} survey={s} />)}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Publish confirmation */}
      <AlertDialog open={!!publishSurvey} onOpenChange={() => { if (!publishing) { setPublishSurvey(null); setPublishExpiresAt(''); setPublishMaxVotes(''); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-blue-600" />Umfrage produktiv schalten?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm text-gray-700">
                <p>Von der Vorlage <strong>„{publishSurvey?.title}"</strong> wird eine Kopie erstellt und sofort für Teilnehmer freigegeben.</p>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-blue-800">
                  ✅ Die Vorlage bleibt unverändert erhalten und kann weiterhin bearbeitet werden.
                </div>
                
                {/* Settings for published survey */}
                <div className="space-y-3 pt-2">
                  <div>
                    <Label htmlFor="publishExpiresAt" className="text-gray-900">Ablaufdatum *</Label>
                    <Input
                      id="publishExpiresAt"
                      type="datetime-local"
                      value={publishExpiresAt}
                      onChange={(e) => setPublishExpiresAt(e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Nach diesem Datum können keine neuen Antworten mehr abgegeben werden</p>
                  </div>
                  <div>
                    <Label htmlFor="publishMaxVotes" className="text-gray-900">Stimmen-Limit (optional)</Label>
                    <Input
                      id="publishMaxVotes"
                      type="number"
                      min={1}
                      value={publishMaxVotes}
                      onChange={(e) => setPublishMaxVotes(e.target.value)}
                      placeholder="z.B. 100"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximale Anzahl an Teilnehmern (leer = unbegrenzt)</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={publishing} className="bg-blue-600 hover:bg-blue-700">
              <Rocket className="w-4 h-4 mr-2" />{publishing ? 'Wird veröffentlicht…' : 'Produktiv schalten'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation – Draft */}
      <AlertDialog open={!!deleteTarget && deleteTarget.status === 'draft'} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />Vorlage löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Die Vorlage <strong>„{deleteTarget?.title}"</strong> wird unwiderruflich gelöscht. Alle Fragen und Antwortoptionen werden ebenfalls entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="w-4 h-4 mr-2" />Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation – Published */}
      <AlertDialog open={!!deleteTarget && deleteTarget.status === 'published'} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteResponseCount(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />Produktive Umfrage löschen?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-700">
                <p>Sie sind dabei, die produktive Umfrage <strong>„{deleteTarget?.title}"</strong> dauerhaft zu löschen.</p>
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                  <p className="font-semibold text-red-800">Folgende Daten werden unwiderruflich gelöscht:</p>
                  <ul className="list-disc list-inside text-red-700 space-y-0.5">
                    <li>Die Umfrage und alle Fragen</li>
                    <li>Alle Antwortoptionen</li>
                    <li>
                      {loadingResponseCount ? 'Antworten werden gezählt…'
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
            <AlertDialogAction onClick={handleDelete} disabled={loadingResponseCount} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="w-4 h-4 mr-2" />Ja, alles löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate dialog */}
      <Dialog open={!!duplicateSurvey} onOpenChange={(open) => { if (!open && !duplicating) { setDuplicateSurvey(null); setDuplicateTitle(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-blue-600" />
              Kopie erstellen
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Erstellen Sie eine private Kopie dieser Vorlage in Ihren eigenen Vorlagen.</p>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-blue-800">
                  ✅ Alle Fragen und Antwortoptionen werden kopiert<br/>
                  ✅ Die Kopie wird in "Meine Vorlagen" gespeichert<br/>
                  ✅ Sie können die Kopie frei bearbeiten
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dup-title">Name der neuen Vorlage</Label>
            <Input id="dup-title" value={duplicateTitle} onChange={(e) => setDuplicateTitle(e.target.value)} placeholder="z.B. Mitarbeiterumfrage (Kopie)" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDuplicateSurvey(null); setDuplicateTitle(''); }} disabled={duplicating}>Abbrechen</Button>
            <Button onClick={handleDuplicate} disabled={duplicating} className="bg-blue-600 hover:bg-blue-700">
              <Copy className="w-4 h-4 mr-2" />
              {duplicating ? 'Erstelle Kopie…' : 'Kopie erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share / QR dialog */}
      <Dialog open={!!shareUrl} onOpenChange={() => { setShareUrl(null); setShareSurveyTitle(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Umfrage teilen</DialogTitle>
            <DialogDescription>Scannen Sie den QR-Code oder kopieren Sie den Link.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="bg-white p-4 rounded-xl border-2" id="dashboard-qr-container">
              {shareUrl && <QRCodeSVG value={shareUrl} size={220} />}
            </div>
            <div className="flex gap-2 w-full">
              <input type="text" value={shareUrl ?? ''} readOnly className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50" />
              <Button size="icon" onClick={() => { navigator.clipboard.writeText(shareUrl ?? ''); toast.success('Link kopiert!'); }}>
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => downloadQrCode('dashboard-qr-container', shareSurveyTitle)}>
              <Download className="w-4 h-4 mr-2" />QR-Code als PNG herunterladen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;

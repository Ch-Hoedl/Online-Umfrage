import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Plus, Trash2, ArrowLeft, Save, ChevronUp, ChevronDown, MessageSquare, Tag, Users, Lock, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

// ── Meta-option helpers ───────────────────────────────────────────────────────

const META_PREFIX = '__dyad_meta__:';
const buildTextMetaOption = (maxAnswers: number) => `${META_PREFIX}${JSON.stringify({ kind: 'text', maxAnswers })}`;
const buildCommentMetaOption = () => `${META_PREFIX}${JSON.stringify({ kind: 'comment' })}`;
const buildCategoryMetaOption = () => `${META_PREFIX}${JSON.stringify({ kind: 'category' })}`;
const isMetaOption = (text: string) => text.startsWith(META_PREFIX);

function parseTextMaxAnswers(optionText: string): number | null {
  if (!isMetaOption(optionText)) return null;
  try {
    const parsed = JSON.parse(optionText.slice(META_PREFIX.length));
    if (parsed?.kind === 'text' && typeof parsed?.maxAnswers === 'number') return parsed.maxAnswers;
  } catch { /* ignore */ }
  return null;
}
const isCommentMetaOption = (t: string) => { try { return isMetaOption(t) && JSON.parse(t.slice(META_PREFIX.length))?.kind === 'comment'; } catch { return false; } };
const isCategoryMetaOption = (t: string) => { try { return isMetaOption(t) && JSON.parse(t.slice(META_PREFIX.length))?.kind === 'category'; } catch { return false; } };

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = 'single' | 'multiple' | 'rating' | 'text' | 'longtext';

interface OptionData { id: string; text: string; }
interface QuestionData {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: OptionData[];
  text_max_answers: number;
  allow_comment: boolean;
  is_category: boolean;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Einfachauswahl',
  multiple: 'Mehrfachauswahl',
  rating: 'Bewertung (1–5)',
  text: 'Offene Frage (Begriffe)',
  longtext: 'Offene Frage (Freier Text)',
};

// ── QuestionCard ──────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: QuestionData;
  index: number;
  total: number;
  categoryTaken: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onAddOption: (id: string) => void;
  onRemoveOption: (qId: string, oId: string) => void;
  onUpdateOption: (qId: string, oId: string, text: string) => void;
}

const QuestionCard = memo(({
  question, index, total, categoryTaken,
  onMove, onRemove, onUpdate, onAddOption, onRemoveOption, onUpdateOption,
}: QuestionCardProps) => {
  const categoryDisabled = categoryTaken && !question.is_category;

  return (
    <Card className={`overflow-hidden ${question.is_category ? 'border-purple-300 bg-purple-50/20' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg flex-1 flex items-center gap-2">
            Frage {index + 1}
            {question.is_category && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                <Tag className="w-3 h-3" /> Kategorie
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button onClick={() => onMove(index, index - 1)} disabled={index === 0} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></Button>
            <Button onClick={() => onMove(index, index + 1)} disabled={index === total - 1} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></Button>
            <Button onClick={() => onRemove(question.id)} variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Question text */}
        <div>
          <Label>Fragetext *</Label>
          <Input
            value={question.question_text}
            onChange={(e) => onUpdate(question.id, 'question_text', e.target.value)}
            placeholder="Ihre Frage hier eingeben"
          />
        </div>

        {/* Question type – plain <select> to avoid Radix loop bug */}
        <div>
          <Label htmlFor={`type-${question.id}`}>Fragetyp</Label>
          <select
            id={`type-${question.id}`}
            value={question.question_type}
            onChange={(e) => onUpdate(question.id, 'question_type', e.target.value as QuestionType)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Text max answers */}
        {question.question_type === 'text' && (
          <div>
            <Label>Max. Antworten</Label>
            <Input
              type="number" min={1} max={10}
              value={question.text_max_answers}
              onChange={(e) => onUpdate(question.id, 'text_max_answers', Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10))))}
              placeholder="z.B. 3"
            />
            <p className="text-xs text-gray-500 mt-1">Teilnehmer können bis zu so viele Begriffe eingeben.</p>
          </div>
        )}

        {/* Longtext info */}
        {question.question_type === 'longtext' && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            Teilnehmer können einen freien Text (bis zu 2048 Zeichen) eingeben.
          </p>
        )}

        {/* Rating info */}
        {question.question_type === 'rating' && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            Für Bewertungen werden automatisch die Optionen 1–5 angelegt.
          </p>
        )}

        {/* Options */}
        {question.question_type !== 'rating' && question.question_type !== 'text' && question.question_type !== 'longtext' && (
          <div>
            <Label>Antwortmöglichkeiten *</Label>
            <div className="space-y-2 mt-2">
              {question.options.map((option, oIndex) => (
                <div key={option.id} className="flex gap-2">
                  <Input
                    value={option.text}
                    onChange={(e) => onUpdateOption(question.id, option.id, e.target.value)}
                    placeholder={`Option ${oIndex + 1}`}
                  />
                  {question.options.length > 2 && (
                    <Button onClick={() => onRemoveOption(question.id, option.id)} variant="outline" size="icon">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button onClick={() => onAddOption(question.id)} variant="outline" size="sm" className="w-full">
                <Plus className="w-4 h-4 mr-2" />Option hinzufügen
              </Button>
            </div>
          </div>
        )}

        {/* Checkboxes */}
        <div className="space-y-3 pt-2 border-t border-gray-100">
          {question.question_type === 'single' && (
            <div className="flex items-start gap-3">
              <Checkbox
                id={`category-${question.id}`}
                checked={question.is_category}
                disabled={categoryDisabled}
                onCheckedChange={(checked) => onUpdate(question.id, 'is_category', !!checked)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor={`category-${question.id}`} className={`cursor-pointer flex items-center gap-1.5 font-medium ${categoryDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                  <Tag className="w-4 h-4 text-purple-500" />Als Kategorie verwenden
                </Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  {categoryDisabled ? 'Es kann nur eine Frage als Kategorie markiert werden.' : 'In der Auswertung können Antworten nach dieser Frage gefiltert werden.'}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <Checkbox
              id={`comment-${question.id}`}
              checked={question.allow_comment}
              onCheckedChange={(checked) => onUpdate(question.id, 'allow_comment', !!checked)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor={`comment-${question.id}`} className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700">
                <MessageSquare className="w-4 h-4 text-blue-500" />Persönlichen Kommentar erlauben
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">Teilnehmer können optional einen freien Kommentar hinterlassen.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
QuestionCard.displayName = 'QuestionCard';

// ── Main component ────────────────────────────────────────────────────────────

const CreateSurvey = () => {
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = !!editId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  // Start as false – the effect sets it to true once user is ready
  const [loadingData, setLoadingData] = useState(false);

  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [allowCopy, setAllowCopy] = useState(true);
  const [allowEdit, setAllowEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(true);

  const [currentVersion, setCurrentVersion] = useState(1);
  const [editingBy, setEditingBy] = useState<string | null>(null);
  const [editingByName, setEditingByName] = useState<string | null>(null);
  const [editingSince, setEditingSince] = useState<string | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);

  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Ref to cancel in-flight loadExistingSurvey when component unmounts
  const loadAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const lockReleasedRef = useRef(false);

  useEffect(() => {
    if (profile && profile.role === 'user') { toast.error('Keine Berechtigung'); navigate('/admin'); }
  }, [profile]);

  useEffect(() => {
    // Wait until user is available before loading
    if (!isEditMode || !editId || !user?.id) return;

    // Reset abort flag for this mount
    const abortToken = { cancelled: false };
    loadAbortRef.current = abortToken;
    lockReleasedRef.current = false;

    setLoadingData(true);
    loadExistingSurvey(editId, abortToken);
    acquireEditLock(editId, user.id);

    const interval = setInterval(() => refreshEditLock(editId, user.id), 5 * 60 * 1000);

    return () => {
      abortToken.cancelled = true;
      clearInterval(interval);
      if (!lockReleasedRef.current) releaseEditLock(editId, user.id);
    };
  }, [editId, user?.id]);

  const acquireEditLock = async (surveyId: string, userId: string) => {
    await supabase.from('surveys')
      .update({ editing_by: userId, editing_since: new Date().toISOString() })
      .eq('id', surveyId);
  };

  const releaseEditLock = async (surveyId: string, userId: string) => {
    lockReleasedRef.current = true;
    await supabase.from('surveys')
      .update({ editing_by: null, editing_since: null })
      .eq('id', surveyId)
      .eq('editing_by', userId);
  };

  const refreshEditLock = async (surveyId: string, userId: string) => {
    await supabase.from('surveys')
      .update({ editing_since: new Date().toISOString() })
      .eq('id', surveyId)
      .eq('editing_by', userId);
  };

  const loadExistingSurvey = async (surveyId: string, abortToken: { cancelled: boolean }) => {
    try {
      const { data: s, error: sErr } = await supabase.from('surveys').select('*').eq('id', surveyId).single();
      if (abortToken.cancelled) return;
      if (sErr) throw sErr;

      setTitle(s.title);
      setDescription(s.description || '');
      setVisibility(s.visibility || 'private');
      setAllowCopy(s.allow_copy ?? true);
      setAllowEdit(s.allow_edit ?? false);
      setIsOwner(s.created_by === user?.id);
      setCurrentVersion(s.version ?? 1);
      setEditingBy(s.editing_by);
      setEditingSince(s.editing_since);

      if (s.editing_by && s.editing_by !== user?.id) {
        const { data: ep } = await supabase.from('profiles').select('first_name, last_name').eq('id', s.editing_by).single();
        if (!abortToken.cancelled && ep) {
          setEditingByName(`${ep.first_name || ''} ${ep.last_name || ''}`.trim() || 'Unbekannter Benutzer');
        }
      }

      const { data: qs, error: qErr } = await supabase.from('questions').select('*').eq('survey_id', surveyId).order('order_index');
      if (abortToken.cancelled) return;
      if (qErr) throw qErr;

      const qIds = (qs || []).map((q: any) => q.id);
      let opts: any[] = [];
      if (qIds.length > 0) {
        const { data: o, error: oErr } = await supabase.from('options').select('*').in('question_id', qIds).order('order_index');
        if (abortToken.cancelled) return;
        if (oErr) throw oErr;
        opts = o || [];
      }

      const optsByQ: Record<string, any[]> = {};
      opts.forEach((o) => { (optsByQ[o.question_id] ??= []).push(o); });

      setQuestions((qs || []).map((q: any) => {
        const qOpts = optsByQ[q.id] || [];
        const metaOpt = qOpts.find((o: any) => parseTextMaxAnswers(o.option_text) !== null);
        const isTextQ = q.question_type === 'multiple' && !!metaOpt;
        const qType: QuestionType = isTextQ ? 'text' : (q.question_type as QuestionType);
        return {
          id: crypto.randomUUID(),
          question_text: q.question_text,
          question_type: qType,
          text_max_answers: metaOpt ? (parseTextMaxAnswers(metaOpt.option_text) ?? 3) : (q.max_text_answers ?? 3),
          allow_comment: qOpts.some((o: any) => isCommentMetaOption(o.option_text)),
          is_category: qOpts.some((o: any) => isCategoryMetaOption(o.option_text)),
          options: qOpts.filter((o: any) => !isMetaOption(o.option_text)).map((o: any) => ({ id: crypto.randomUUID(), text: o.option_text })),
        };
      }));
    } catch (err) {
      if (abortToken.cancelled) return;
      console.error(err);
      toast.error('Fehler beim Laden der Umfrage');
      navigate('/admin');
    } finally {
      if (!abortToken.cancelled) setLoadingData(false);
    }
  };

  // ── Stable callbacks ──────────────────────────────────────────────────────

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, {
      id: crypto.randomUUID(), question_text: '', question_type: 'single',
      text_max_answers: 3, allow_comment: false, is_category: false,
      options: [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }],
    }]);
  }, []);

  const removeQuestion = useCallback((id: string) => setQuestions((prev) => prev.filter((q) => q.id !== id)), []);

  const moveQuestion = useCallback((from: number, to: number) => {
    setQuestions((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const updateQuestion = useCallback((id: string, field: string, value: unknown) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== id) return q;
      const next = { ...q, [field]: value } as QuestionData;
      if (field === 'question_type') {
        if (value === 'text' && !next.text_max_answers) next.text_max_answers = 3;
        if (value !== 'single') next.is_category = false;
      }
      return next;
    }));
  }, []);

  const addOption = useCallback((qId: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, options: [...q.options, { id: crypto.randomUUID(), text: '' }] } : q
    ));
  }, []);

  const removeOption = useCallback((qId: string, oId: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, options: q.options.filter((o) => o.id !== oId) } : q
    ));
  }, []);

  const updateOption = useCallback((qId: string, oId: string, text: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, options: q.options.map((o) => o.id === oId ? { ...o, text } : o) } : q
    ));
  }, []);

  // ── Validation & Save ─────────────────────────────────────────────────────

  const questionsRef = useRef<QuestionData[]>([]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  const validate = (qs: QuestionData[]): boolean => {
    console.log('[CreateSurvey] validate called, questions:', qs.length, 'title:', title);
    if (!title.trim()) { toast.error('Bitte geben Sie einen Titel ein'); return false; }
    if (qs.length === 0) { toast.error('Bitte fügen Sie mindestens eine Frage hinzu'); return false; }
    if (qs.filter((q) => q.is_category).length > 1) { toast.error('Es kann nur eine Frage als Kategorie markiert werden'); return false; }
    for (const q of qs) {
      if (!q.question_text.trim()) { toast.error('Alle Fragen müssen einen Text haben'); return false; }
      if (q.question_type === 'text') {
        const m = Number(q.text_max_answers);
        if (!Number.isFinite(m) || m < 1 || m > 10) { toast.error('Max. Antworten muss zwischen 1 und 10 liegen'); return false; }
      }
      if (q.question_type !== 'rating' && q.question_type !== 'text' && q.question_type !== 'longtext') {
        const emptyOpt = q.options.find((o) => !o.text.trim());
        if (emptyOpt) {
          console.log('[CreateSurvey] validate FAIL: empty option in question', q.question_text, 'type:', q.question_type, 'options:', JSON.stringify(q.options));
          toast.error('Alle Antwortoptionen müssen ausgefüllt sein');
          return false;
        }
      }
    }
    console.log('[CreateSurvey] validate PASS');
    return true;
  };

  const handleSave = async () => {
    const qs = questionsRef.current;
    console.log('[CreateSurvey] handleSave called, questionsRef:', qs.length, 'saving:', saving);
    if (!validate(qs)) return;
    setSaving(true);
    try {
      if (isEditMode && editId) {
        await doUpdate(editId, false, qs);
      } else {
        await doCreate(qs);
      }
      // Mark lock as released so cleanup doesn't double-release
      lockReleasedRef.current = true;
      toast.success(isEditMode ? 'Umfrage aktualisiert' : 'Umfrage erstellt');
      navigate('/admin');
    } catch (err: any) {
      const msg = err?.message || err?.details || err?.hint || JSON.stringify(err) || 'Unbekannter Fehler';
      console.error('[CreateSurvey] Save error:', JSON.stringify(err));
      if (msg !== 'VERSION_CONFLICT') toast.error(`Fehler: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const doCreate = async (qs: QuestionData[]) => {
    const { data: survey, error } = await supabase.from('surveys')
      .insert({ title, description, created_by: user?.id, status: 'draft', is_active: false, visibility, allow_copy: allowCopy, allow_edit: allowEdit, last_modified_by: user?.id })
      .select().single();
    if (error) throw error;
    await saveQuestions(survey.id, qs);
  };

  const doUpdate = async (surveyId: string, force: boolean, qs: QuestionData[]) => {
    const { data: cur, error: fetchErr } = await supabase.from('surveys').select('version, title, description').eq('id', surveyId).single();
    if (fetchErr) throw fetchErr;
    const dbVersion = cur.version ?? 1;
    if (!force && dbVersion !== currentVersion) {
      setConflictData({ currentTitle: cur.title, myTitle: title });
      setShowConflictDialog(true);
      throw new Error('VERSION_CONFLICT');
    }
    const { error: updateErr } = await supabase.from('surveys')
      .update({ title, description, updated_at: new Date().toISOString(), visibility, allow_copy: allowCopy, allow_edit: allowEdit, version: dbVersion + 1, editing_by: null, editing_since: null, last_modified_by: user?.id })
      .eq('id', surveyId);
    if (updateErr) throw updateErr;
    const { error: delErr } = await supabase.from('questions').delete().eq('survey_id', surveyId);
    if (delErr) throw delErr;
    await saveQuestions(surveyId, qs);
    setCurrentVersion(dbVersion + 1);
  };

  const saveQuestions = async (surveyId: string, qs: QuestionData[]) => {
    if (qs.length === 0) return;
    const qRows = qs.map((q, i) => ({
      survey_id: surveyId,
      question_text: q.question_text,
      question_type: q.question_type === 'text' ? 'multiple' : q.question_type,
      order_index: i,
      max_text_answers: q.question_type === 'text' ? Number(q.text_max_answers) : null,
    }));
    const { data: inserted, error: qErr } = await supabase.from('questions').insert(qRows).select('id, order_index');
    if (qErr) throw qErr;
    const sorted = [...(inserted || [])].sort((a, b) => a.order_index - b.order_index);
    const optRows: { question_id: string; option_text: string; order_index: number }[] = [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const qId = sorted[i]?.id;
      if (!qId) continue;
      if (q.question_type === 'rating') {
        for (let j = 1; j <= 5; j++) optRows.push({ question_id: qId, option_text: j.toString(), order_index: j - 1 });
      } else if (q.question_type === 'text') {
        optRows.push({ question_id: qId, option_text: buildTextMetaOption(Number(q.text_max_answers)), order_index: 9999 });
      } else if (q.question_type !== 'longtext') {
        q.options.forEach((o, j) => optRows.push({ question_id: qId, option_text: o.text, order_index: j }));
      }
      if (q.allow_comment) optRows.push({ question_id: qId, option_text: buildCommentMetaOption(), order_index: 9998 });
      if (q.is_category && q.question_type === 'single') optRows.push({ question_id: qId, option_text: buildCategoryMetaOption(), order_index: 9997 });
    }
    if (optRows.length > 0) {
      const { error: oErr } = await supabase.from('options').insert(optRows);
      if (oErr) throw oErr;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const categoryTakenId = questions.find((q) => q.is_category)?.id ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{isEditMode ? 'Umfrage bearbeiten' : 'Neue Umfrage erstellen'}</h1>
            <p className="text-gray-600">{isEditMode ? 'Ändern Sie Titel, Fragen und Antwortmöglichkeiten' : 'Erstellen Sie Fragen und Antwortmöglichkeiten'}</p>
          </div>
        </div>

        {/* Edit Lock Warning */}
        {isEditMode && editingBy && editingBy !== user?.id && editingByName && (
          <Card className="mb-6 border-amber-300 bg-amber-50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900">⚠️ Wird gerade bearbeitet</p>
                  <p className="text-sm text-amber-800 mt-1">
                    <strong>{editingByName}</strong> bearbeitet diese Vorlage gerade.
                    {editingSince && (() => {
                      const minutes = Math.floor((Date.now() - new Date(editingSince).getTime()) / 60000);
                      return minutes > 0 ? ` (seit ${minutes} Minute${minutes === 1 ? '' : 'n'})` : ' (gerade eben)';
                    })()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Survey Details */}
        <Card className="mb-6">
          <CardHeader><CardTitle>Umfrage-Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Kundenzufriedenheit 2024" />
            </div>
            <div>
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionale Beschreibung" rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Sharing Settings */}
        {isOwner && (
          <Card className="mb-6 border-purple-200">
            <CardHeader><CardTitle className="flex items-center gap-2 text-purple-800"><Users className="w-5 h-5" />Freigabe-Einstellungen</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Sichtbarkeit</Label>
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setVisibility('private')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${visibility === 'private' ? 'border-gray-500 bg-gray-100 text-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <Lock className="w-4 h-4" />Privat
                  </button>
                  <button onClick={() => setVisibility('public')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${visibility === 'public' ? 'border-purple-500 bg-purple-100 text-purple-800' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                    <Users className="w-4 h-4" />Öffentlich
                  </button>
                </div>
              </div>
              {visibility === 'public' && (
                <div className="space-y-3 pt-2 border-t border-purple-100">
                  <div className="flex items-start gap-3">
                    <Checkbox id="allow-copy" checked={allowCopy} onCheckedChange={(c) => setAllowCopy(!!c)} className="mt-0.5" />
                    <div>
                      <Label htmlFor="allow-copy" className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700"><Copy className="w-4 h-4 text-blue-500" />Kopieren erlauben</Label>
                      <p className="text-xs text-gray-500 mt-0.5">Andere Benutzer können eine private Kopie erstellen.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox id="allow-edit" checked={allowEdit} onCheckedChange={(c) => setAllowEdit(!!c)} className="mt-0.5" />
                    <div>
                      <Label htmlFor="allow-edit" className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700"><RefreshCw className="w-4 h-4 text-green-500" />Kollaboratives Bearbeiten</Label>
                      <p className="text-xs text-gray-500 mt-0.5">Alle Benutzer können diese Vorlage direkt bearbeiten.</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Questions */}
        <div className="space-y-3 mb-6">
          {questions.map((question, qIndex) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={qIndex}
              total={questions.length}
              categoryTaken={categoryTakenId !== null && categoryTakenId !== question.id}
              onMove={moveQuestion}
              onRemove={removeQuestion}
              onUpdate={updateQuestion}
              onAddOption={addOption}
              onRemoveOption={removeOption}
              onUpdateOption={updateOption}
            />
          ))}
        </div>

        <div className="flex gap-3">
          <Button onClick={addQuestion} variant="outline" className="flex-1">
            <Plus className="w-5 h-5 mr-2" />Frage hinzufügen
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Speichern...' : isEditMode ? 'Änderungen speichern' : 'Umfrage speichern'}
          </Button>
        </div>
      </div>

      {/* Version conflict dialog */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700"><AlertTriangle className="w-5 h-5" />Bearbeitungskonflikt</DialogTitle>
            <DialogDescription>Diese Vorlage wurde von jemand anderem geändert, während Sie sie bearbeitet haben.</DialogDescription>
          </DialogHeader>
          {conflictData && (
            <div className="space-y-3 text-sm">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="font-semibold text-blue-800 mb-1">Aktuelle Version:</p>
                <p className="text-blue-700">Titel: {conflictData.currentTitle}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="font-semibold text-amber-800 mb-1">Ihre Version:</p>
                <p className="text-amber-700">Titel: {conflictData.myTitle}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowConflictDialog(false);
              if (editId) loadExistingSurvey(editId, loadAbortRef.current);
            }}>Aktuelle Version laden</Button>
            <Button onClick={async () => {
              setShowConflictDialog(false);
              if (!editId) return;
              setSaving(true);
              try {
                await doUpdate(editId, true, questionsRef.current);
                lockReleasedRef.current = true;
                toast.success('Umfrage aktualisiert');
                navigate('/admin');
              } catch { toast.error('Fehler beim Speichern'); }
              finally { setSaving(false); }
            }} className="bg-amber-600 hover:bg-amber-700">Meine Version überschreiben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateSurvey;
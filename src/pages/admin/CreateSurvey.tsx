import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Plus, Trash2, ArrowLeft, Save, GripVertical, ChevronUp, ChevronDown, MessageSquare, Tag, Users, Lock, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const META_PREFIX = '__dyad_meta__:';

function buildTextMetaOption(maxAnswers: number) {
  return `${META_PREFIX}${JSON.stringify({ kind: 'text', maxAnswers })}`;
}
function buildCommentMetaOption() {
  return `${META_PREFIX}${JSON.stringify({ kind: 'comment' })}`;
}
function buildCategoryMetaOption() {
  return `${META_PREFIX}${JSON.stringify({ kind: 'category' })}`;
}
function isMetaOption(text: string) { return text.startsWith(META_PREFIX); }
function parseTextMaxAnswers(optionText: string): number | null {
  if (!isMetaOption(optionText)) return null;
  try {
    const raw = optionText.slice(META_PREFIX.length);
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'text' && typeof parsed?.maxAnswers === 'number') return parsed.maxAnswers;
  } catch { /* ignore */ }
  return null;
}
function isCommentMetaOption(optionText: string): boolean {
  if (!isMetaOption(optionText)) return false;
  try { return JSON.parse(optionText.slice(META_PREFIX.length))?.kind === 'comment'; }
  catch { return false; }
}
function isCategoryMetaOption(optionText: string): boolean {
  if (!isMetaOption(optionText)) return false;
  try { return JSON.parse(optionText.slice(META_PREFIX.length))?.kind === 'category'; }
  catch { return false; }
}

interface QuestionData {
  id: string;
  dbId?: string;
  question_text: string;
  question_type: Question['question_type'];
  options: { id: string; dbId?: string; text: string }[];
  text_max_answers: number;
  allow_comment: boolean;
  is_category: boolean;
}

const CreateSurvey = () => {
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = !!editId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode);

  // Template sharing settings
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [allowCopy, setAllowCopy] = useState(true);
  const [allowEdit, setAllowEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(true);

  // Version control and edit lock
  const [currentVersion, setCurrentVersion] = useState(1);
  const [editingBy, setEditingBy] = useState<string | null>(null);
  const [editingByName, setEditingByName] = useState<string | null>(null);
  const [editingSince, setEditingSince] = useState<string | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIndex = useRef<number>(-1);

  const navigate = useNavigate();
  const { user, profile } = useAuth();

  useEffect(() => {
    if (profile && profile.role === 'user') { toast.error('Keine Berechtigung'); navigate('/admin'); }
  }, [profile]);

  useEffect(() => {
    if (isEditMode && editId) {
      loadExistingSurvey(editId);
      acquireEditLock(editId);
    }
    return () => { if (isEditMode && editId) releaseEditLock(editId); };
  }, [editId]);

  // Heartbeat to keep lock alive
  useEffect(() => {
    if (!isEditMode || !editId) return;
    const interval = setInterval(() => refreshEditLock(editId), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isEditMode, editId]);

  const acquireEditLock = async (surveyId: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('surveys').update({ editing_by: user.id, editing_since: new Date().toISOString() }).eq('id', surveyId);
    } catch (error) { console.error('Failed to acquire edit lock:', error); }
  };

  const releaseEditLock = async (surveyId: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('surveys').update({ editing_by: null, editing_since: null }).eq('id', surveyId).eq('editing_by', user.id);
    } catch (error) { console.error('Failed to release edit lock:', error); }
  };

  const refreshEditLock = async (surveyId: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('surveys').update({ editing_since: new Date().toISOString() }).eq('id', surveyId).eq('editing_by', user.id);
    } catch (error) { console.error('Failed to refresh edit lock:', error); }
  };

  const loadExistingSurvey = async (surveyId: string) => {
    setLoadingData(true);
    try {
      const { data: surveyData, error: surveyError } = await supabase.from('surveys').select('*').eq('id', surveyId).single();
      if (surveyError) throw surveyError;

      setTitle(surveyData.title);
      setDescription(surveyData.description || '');
      setVisibility(surveyData.visibility || 'private');
      setAllowCopy(surveyData.allow_copy ?? true);
      setAllowEdit(surveyData.allow_edit ?? false);
      setIsOwner(surveyData.created_by === user?.id);
      setCurrentVersion(surveyData.version || 1);
      setEditingBy(surveyData.editing_by);
      setEditingSince(surveyData.editing_since);

      if (surveyData.editing_by && surveyData.editing_by !== user?.id) {
        const { data: editorProfile } = await supabase.from('profiles').select('first_name, last_name').eq('id', surveyData.editing_by).single();
        if (editorProfile) {
          setEditingByName(`${editorProfile.first_name || ''} ${editorProfile.last_name || ''}`.trim() || 'Unbekannter Benutzer');
        }
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions').select('*').eq('survey_id', surveyId).order('order_index');
      if (questionsError) throw questionsError;

      const loadedQuestions = questionsData || [];
      const questionIds = loadedQuestions.map((q) => q.id);
      let optionsData: any[] = [];
      if (questionIds.length > 0) {
        const { data: opts, error: optsError } = await supabase
          .from('options').select('*').in('question_id', questionIds).order('order_index');
        if (optsError) throw optsError;
        optionsData = opts || [];
      }

      const optionsByQuestion: { [key: string]: any[] } = {};
      optionsData.forEach((opt) => {
        if (!optionsByQuestion[opt.question_id]) optionsByQuestion[opt.question_id] = [];
        optionsByQuestion[opt.question_id].push(opt);
      });

      const mappedQuestions: QuestionData[] = loadedQuestions.map((q) => {
        const qOptions = optionsByQuestion[q.id] || [];
        const metaOpt = qOptions.find((o: any) => parseTextMaxAnswers(o.option_text) !== null);
        const hasComment = qOptions.some((o: any) => isCommentMetaOption(o.option_text));
        const hasCategory = qOptions.some((o: any) => isCategoryMetaOption(o.option_text));
        const isTextQ = q.question_type === 'text' || !!metaOpt;
        const visibleOptions = qOptions.filter((o: any) => !isMetaOption(o.option_text));

        let textMaxAnswers = 3;
        if (metaOpt) { textMaxAnswers = parseTextMaxAnswers(metaOpt.option_text) ?? 3; }
        else if (q.max_text_answers) { textMaxAnswers = q.max_text_answers; }

        return {
          id: crypto.randomUUID(),
          dbId: q.id,
          question_text: q.question_text,
          question_type: isTextQ ? 'text' : q.question_type,
          text_max_answers: textMaxAnswers,
          allow_comment: hasComment,
          is_category: hasCategory,
          options: visibleOptions.map((o: any) => ({ id: crypto.randomUUID(), dbId: o.id, text: o.option_text })),
        };
      });

      setQuestions(mappedQuestions);
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Laden der Umfrage');
      navigate('/admin');
    } finally { setLoadingData(false); }
  };

  // ── Question helpers ──────────────────────────────────────────────────────

  const addQuestion = () => {
    setQuestions([...questions, {
      id: crypto.randomUUID(), question_text: '', question_type: 'single',
      text_max_answers: 3, allow_comment: false, is_category: false,
      options: [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }],
    }]);
  };

  const removeQuestion = (questionId: string) => setQuestions(questions.filter((q) => q.id !== questionId));

  const moveQuestion = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setQuestions(next);
  };

  const updateQuestion = (questionId: string, field: string, value: any) => {
    setQuestions(questions.map((q) => {
      if (q.id !== questionId) return q;
      const next = { ...q, [field]: value } as QuestionData;
      if (field === 'question_type' && value === 'text' && !next.text_max_answers) next.text_max_answers = 3;
      if (field === 'question_type' && value !== 'single') next.is_category = false;
      return next;
    }));
  };

  const addOption = (questionId: string) => setQuestions(questions.map((q) =>
    q.id === questionId ? { ...q, options: [...q.options, { id: crypto.randomUUID(), text: '' }] } : q
  ));
  const removeOption = (questionId: string, optionId: string) => setQuestions(questions.map((q) =>
    q.id === questionId ? { ...q, options: q.options.filter((o) => o.id !== optionId) } : q
  ));
  const updateOption = (questionId: string, optionId: string, text: string) => setQuestions(questions.map((q) =>
    q.id === questionId ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, text } : o)) } : q
  ));

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string, index: number) => {
    setDraggedId(id); draggedIndex.current = index; e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div'); ghost.style.position = 'absolute'; ghost.style.top = '-9999px';
    document.body.appendChild(ghost); e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (id !== draggedId) setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const fromIndex = draggedIndex.current;
    const toIndex = questions.findIndex((q) => q.id === targetId);
    if (fromIndex !== -1 && toIndex !== -1) moveQuestion(fromIndex, toIndex);
    setDraggedId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    if (!title.trim()) { toast.error('Bitte geben Sie einen Titel ein'); return false; }
    if (questions.length === 0) { toast.error('Bitte fügen Sie mindestens eine Frage hinzu'); return false; }
    const categoryCount = questions.filter((q) => q.is_category).length;
    if (categoryCount > 1) { toast.error('Es kann nur eine Frage als Kategorie markiert werden'); return false; }
    for (const q of questions) {
      if (!q.question_text.trim()) { toast.error('Alle Fragen müssen einen Text haben'); return false; }
      if (q.question_type === 'text') {
        const m = Number(q.text_max_answers);
        if (!Number.isFinite(m) || m < 1 || m > 10) { toast.error('Max. Antworten muss zwischen 1 und 10 liegen'); return false; }
      }
      if (q.question_type !== 'rating' && q.question_type !== 'text' && q.question_type !== 'longtext' && q.options.some((o) => !o.text.trim())) {
        toast.error('Alle Antwortoptionen müssen ausgefüllt sein'); return false;
      }
    }
    return true;
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEditMode && editId) await updateSurvey(editId);
      else await createSurvey();
      toast.success(isEditMode ? 'Umfrage aktualisiert' : 'Umfrage erstellt');
      navigate('/admin');
    } catch (error) {
      console.error('[CreateSurvey] Save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      if (errorMessage !== 'VERSION_CONFLICT') {
        toast.error(isEditMode ? `Fehler beim Aktualisieren: ${errorMessage}` : `Fehler beim Erstellen: ${errorMessage}`);
      }
    } finally { setSaving(false); }
  };

  const createSurvey = async () => {
    const { data: survey, error } = await supabase
      .from('surveys')
      .insert({ title, description, created_by: user?.id, status: 'draft', is_active: false, visibility, allow_copy: allowCopy, allow_edit: allowEdit, last_modified_by: user?.id })
      .select().single();
    if (error) throw error;
    await saveQuestions(survey.id, questions);
  };

  const updateSurvey = async (surveyId: string) => {
    const { data: currentData, error: fetchError } = await supabase.from('surveys').select('version, title, description').eq('id', surveyId).single();
    if (fetchError) throw fetchError;

    if (currentData.version !== currentVersion) {
      setConflictData({ currentTitle: currentData.title, currentDescription: currentData.description, myTitle: title, myDescription: description });
      setShowConflictDialog(true);
      throw new Error('VERSION_CONFLICT');
    }

    const { error } = await supabase.from('surveys')
      .update({ title, description, updated_at: new Date().toISOString(), visibility, allow_copy: allowCopy, allow_edit: allowEdit, version: currentVersion + 1, editing_by: null, editing_since: null, last_modified_by: user?.id })
      .eq('id', surveyId).eq('version', currentVersion);
    if (error) throw error;

    setCurrentVersion(currentVersion + 1);
    const { error: delErr } = await supabase.from('questions').delete().eq('survey_id', surveyId);
    if (delErr) throw delErr;
    await saveQuestions(surveyId, questions);
  };

  const saveQuestions = async (surveyId: string, qs: QuestionData[]) => {
    for (let i = 0; i < qs.length; i++) {
      const question = qs[i];
      const dbQuestionType = question.question_type === 'text' ? 'multiple' : question.question_type;

      const { data: questionData, error: questionError } = await supabase
        .from('questions')
        .insert({ survey_id: surveyId, question_text: question.question_text, question_type: dbQuestionType, order_index: i, max_text_answers: question.question_type === 'text' ? Number(question.text_max_answers) : null })
        .select().single();
      if (questionError) throw questionError;

      if (question.question_type === 'rating') {
        for (let j = 1; j <= 5; j++) {
          const { error } = await supabase.from('options').insert({ question_id: questionData.id, option_text: j.toString(), order_index: j - 1 });
          if (error) throw error;
        }
      } else if (question.question_type === 'text') {
        const { error } = await supabase.from('options').insert({ question_id: questionData.id, option_text: buildTextMetaOption(Number(question.text_max_answers)), order_index: 9999 });
        if (error) throw error;
      } else if (question.question_type === 'longtext') {
        // No options needed
      } else {
        for (let j = 0; j < question.options.length; j++) {
          const { error } = await supabase.from('options').insert({ question_id: questionData.id, option_text: question.options[j].text, order_index: j });
          if (error) throw error;
        }
      }

      if (question.allow_comment) {
        const { error } = await supabase.from('options').insert({ question_id: questionData.id, option_text: buildCommentMetaOption(), order_index: 9998 });
        if (error) throw error;
      }
      if (question.is_category && question.question_type === 'single') {
        const { error } = await supabase.from('options').insert({ question_id: questionData.id, option_text: buildCategoryMetaOption(), order_index: 9997 });
        if (error) throw error;
      }
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

  const categoryCount = questions.filter((q) => q.is_category).length;

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
                  <p className="text-xs text-amber-700 mt-1">Sie können trotzdem Änderungen vornehmen, aber es kann zu Konflikten kommen, wenn beide gleichzeitig speichern.</p>
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
                  <button
                    onClick={() => setVisibility('private')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${visibility === 'private' ? 'border-gray-500 bg-gray-100 text-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    <Lock className="w-4 h-4" />Privat
                  </button>
                  <button
                    onClick={() => setVisibility('public')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${visibility === 'public' ? 'border-purple-500 bg-purple-100 text-purple-800' : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}
                  >
                    <Users className="w-4 h-4" />Öffentlich
                  </button>
                </div>
              </div>
              {visibility === 'public' && (
                <div className="space-y-3 pt-2 border-t border-purple-100">
                  <div className="flex items-start gap-3">
                    <Checkbox id="allow-copy" checked={allowCopy} onCheckedChange={(c) => setAllowCopy(!!c)} className="mt-0.5" />
                    <div>
                      <Label htmlFor="allow-copy" className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700">
                        <Copy className="w-4 h-4 text-blue-500" />Kopieren erlauben
                      </Label>
                      <p className="text-xs text-gray-500 mt-0.5">Andere Benutzer können eine private Kopie dieser Vorlage erstellen.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox id="allow-edit" checked={allowEdit} onCheckedChange={(c) => setAllowEdit(!!c)} className="mt-0.5" />
                    <div>
                      <Label htmlFor="allow-edit" className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700">
                        <RefreshCw className="w-4 h-4 text-green-500" />Kollaboratives Bearbeiten
                      </Label>
                      <p className="text-xs text-gray-500 mt-0.5">Alle Benutzer können diese Vorlage direkt bearbeiten (wie ein geteiltes Dokument).</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {questions.length > 0 && (
          <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
            <GripVertical className="w-4 h-4" />Fragen per Drag &amp; Drop oder mit den Pfeilen verschieben
          </p>
        )}

        <div className="space-y-3 mb-6">
          {questions.map((question, qIndex) => {
            const isDragging = draggedId === question.id;
            const isDragOver = dragOverId === question.id;
            return (
              <div
                key={question.id}
                draggable
                onDragStart={(e) => handleDragStart(e, question.id, qIndex)}
                onDragOver={(e) => handleDragOver(e, question.id)}
                onDrop={(e) => handleDrop(e, question.id)}
                onDragEnd={handleDragEnd}
                className={`transition-all duration-150 ${isDragging ? 'opacity-40 scale-[0.98]' : 'opacity-100'} ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-2 rounded-xl' : ''}`}
              >
                <Card className={`overflow-hidden ${question.is_category ? 'border-purple-300 bg-purple-50/20' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 flex-shrink-0">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-lg flex-1 flex items-center gap-2">
                        Frage {qIndex + 1}
                        {question.is_category && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            <Tag className="w-3 h-3" /> Kategorie
                          </span>
                        )}
                      </CardTitle>
                      <div className="flex gap-1">
                        <Button onClick={() => moveQuestion(qIndex, qIndex - 1)} disabled={qIndex === 0} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></Button>
                        <Button onClick={() => moveQuestion(qIndex, qIndex + 1)} disabled={qIndex === questions.length - 1} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></Button>
                        <Button onClick={() => removeQuestion(question.id)} variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Fragetext *</Label>
                      <Input value={question.question_text} onChange={(e) => updateQuestion(question.id, 'question_text', e.target.value)} placeholder="Ihre Frage hier eingeben" />
                    </div>
                    <div>
                      <Label>Fragetyp</Label>
                      <Select value={question.question_type} onValueChange={(value) => updateQuestion(question.id, 'question_type', value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Einfachauswahl</SelectItem>
                          <SelectItem value="multiple">Mehrfachauswahl</SelectItem>
                          <SelectItem value="rating">Bewertung (1-5)</SelectItem>
                          <SelectItem value="text">Offene Frage (Begriffe)</SelectItem>
                          <SelectItem value="longtext">Offene Frage (Freier Text)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {question.question_type === 'text' && (
                      <div>
                        <Label>Max. Antworten</Label>
                        <Input type="number" min={1} max={10} value={question.text_max_answers}
                          onChange={(e) => updateQuestion(question.id, 'text_max_answers', Number.parseInt(e.target.value || '1', 10))} placeholder="z.B. 3" />
                        <p className="text-xs text-gray-500 mt-1">Teilnehmer können bis zu so viele Begriffe eingeben.</p>
                      </div>
                    )}

                    {question.question_type === 'longtext' && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">Teilnehmer können einen freien Text (bis zu 2048 Zeichen) eingeben.</p>
                    )}

                    {question.question_type !== 'rating' && question.question_type !== 'text' && question.question_type !== 'longtext' && (
                      <div>
                        <Label>Antwortmöglichkeiten *</Label>
                        <div className="space-y-2 mt-2">
                          {question.options.map((option, oIndex) => (
                            <div key={option.id} className="flex gap-2">
                              <Input value={option.text} onChange={(e) => updateOption(question.id, option.id, e.target.value)} placeholder={`Option ${oIndex + 1}`} />
                              {question.options.length > 2 && (
                                <Button onClick={() => removeOption(question.id, option.id)} variant="outline" size="icon"><Trash2 className="w-4 h-4" /></Button>
                              )}
                            </div>
                          ))}
                          <Button onClick={() => addOption(question.id)} variant="outline" size="sm" className="w-full">
                            <Plus className="w-4 h-4 mr-2" />Option hinzufügen
                          </Button>
                        </div>
                      </div>
                    )}

                    {question.question_type === 'rating' && (
                      <p className="text-sm text-gray-600">Für Bewertungen werden automatisch die Optionen 1–5 angelegt.</p>
                    )}

                    {/* Checkboxes */}
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      {question.question_type === 'single' && (
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`category-${question.id}`}
                            checked={question.is_category}
                            disabled={!question.is_category && categoryCount >= 1}
                            onCheckedChange={(checked) => updateQuestion(question.id, 'is_category', !!checked)}
                            className="mt-0.5"
                          />
                          <div>
                            <Label htmlFor={`category-${question.id}`} className={`cursor-pointer flex items-center gap-1.5 font-medium ${!question.is_category && categoryCount >= 1 ? 'text-gray-400' : 'text-gray-700'}`}>
                              <Tag className="w-4 h-4 text-purple-500" />Als Kategorie verwenden
                            </Label>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {!question.is_category && categoryCount >= 1
                                ? 'Es kann nur eine Frage als Kategorie markiert werden.'
                                : 'In der Auswertung können Antworten nach dieser Frage gefiltert werden.'}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`comment-${question.id}`}
                          checked={question.allow_comment}
                          onCheckedChange={(checked) => updateQuestion(question.id, 'allow_comment', !!checked)}
                          className="mt-0.5"
                        />
                        <div>
                          <Label htmlFor={`comment-${question.id}`} className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700">
                            <MessageSquare className="w-4 h-4 text-blue-500" />Persönlichen Kommentar erlauben
                          </Label>
                          <p className="text-xs text-gray-500 mt-0.5">Teilnehmer können optional einen freien Kommentar (max. 1024 Zeichen) zur Frage hinterlassen.</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
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
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />Bearbeitungskonflikt
            </DialogTitle>
            <DialogDescription>
              Diese Vorlage wurde von jemand anderem geändert, während Sie sie bearbeitet haben.
            </DialogDescription>
          </DialogHeader>
          {conflictData && (
            <div className="space-y-3 text-sm">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="font-semibold text-blue-800 mb-1">Aktuelle Version (von anderem Benutzer):</p>
                <p className="text-blue-700">Titel: {conflictData.currentTitle}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="font-semibold text-amber-800 mb-1">Ihre Version:</p>
                <p className="text-amber-700">Titel: {conflictData.myTitle}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowConflictDialog(false); if (editId) loadExistingSurvey(editId); }}>
              Aktuelle Version laden
            </Button>
            <Button onClick={() => { setShowConflictDialog(false); if (editId) { setCurrentVersion(currentVersion + 1); handleSave(); } }} className="bg-amber-600 hover:bg-amber-700">
              Meine Version überschreiben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateSurvey;
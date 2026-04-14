import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Question } from '@/integrations/supabase/types';
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

// ── Meta-option helpers ───────────────────────────────────────────────────────

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
    const parsed = JSON.parse(optionText.slice(META_PREFIX.length));
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

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = 'single' | 'multiple' | 'rating' | 'text' | 'longtext';

interface OptionData { id: string; dbId?: string; text: string; }

interface QuestionData {
  id: string;
  dbId?: string;
  question_text: string;
  question_type: QuestionType;
  options: OptionData[];
  text_max_answers: number;
  allow_comment: boolean;
  is_category: boolean;
}

// ── QuestionCard (memoized to prevent re-renders of sibling cards) ────────────

interface QuestionCardProps {
  question: QuestionData;
  index: number;
  total: number;
  categoryCount: number;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, id: string, index: number) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onAddOption: (id: string) => void;
  onRemoveOption: (qId: string, oId: string) => void;
  onUpdateOption: (qId: string, oId: string, text: string) => void;
}

const QuestionCard = memo(({
  question, index, total, categoryCount,
  isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onMove, onRemove, onUpdate, onAddOption, onRemoveOption, onUpdateOption,
}: QuestionCardProps) => (
  <div
    draggable
    onDragStart={(e) => onDragStart(e, question.id, index)}
    onDragOver={(e) => onDragOver(e, question.id)}
    onDrop={(e) => onDrop(e, question.id)}
    onDragEnd={onDragEnd}
    className={`transition-all duration-150 ${isDragging ? 'opacity-40 scale-[0.98]' : 'opacity-100'} ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-2 rounded-xl' : ''}`}
  >
    <Card className={`overflow-hidden ${question.is_category ? 'border-purple-300 bg-purple-50/20' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 flex-shrink-0">
            <GripVertical className="w-5 h-5" />
          </div>
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
        <div>
          <Label>Fragetext *</Label>
          <Input
            value={question.question_text}
            onChange={(e) => onUpdate(question.id, 'question_text', e.target.value)}
            placeholder="Ihre Frage hier eingeben"
          />
        </div>
        <div>
          <Label>Fragetyp</Label>
          <Select value={question.question_type} onValueChange={(value) => onUpdate(question.id, 'question_type', value)}>
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
            <Input
              type="number" min={1} max={10}
              value={question.text_max_answers}
              onChange={(e) => onUpdate(question.id, 'text_max_answers', Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10))))}
              placeholder="z.B. 3"
            />
            <p className="text-xs text-gray-500 mt-1">Teilnehmer können bis zu so viele Begriffe eingeben.</p>
          </div>
        )}

        {question.question_type === 'longtext' && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            Teilnehmer können einen freien Text (bis zu 2048 Zeichen) eingeben.
          </p>
        )}

        {question.question_type === 'rating' && (
          <p className="text-sm text-gray-600">Für Bewertungen werden automatisch die Optionen 1–5 angelegt.</p>
        )}

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
                disabled={!question.is_category && categoryCount >= 1}
                onCheckedChange={(checked) => onUpdate(question.id, 'is_category', !!checked)}
                className="mt-0.5"
              />
              <div>
                <Label
                  htmlFor={`category-${question.id}`}
                  className={`cursor-pointer flex items-center gap-1.5 font-medium ${!question.is_category && categoryCount >= 1 ? 'text-gray-400' : 'text-gray-700'}`}
                >
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
              onCheckedChange={(checked) => onUpdate(question.id, 'allow_comment', !!checked)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor={`comment-${question.id}`} className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700">
                <MessageSquare className="w-4 h-4 text-blue-500" />Persönlichen Kommentar erlauben
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Teilnehmer können optional einen freien Kommentar (max. 1024 Zeichen) zur Frage hinterlassen.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
));
QuestionCard.displayName = 'QuestionCard';

// ── Main component ────────────────────────────────────────────────────────────

const CreateSurvey = () => {
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = !!editId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode);

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

  useEffect(() => {
    if (!isEditMode || !editId) return;
    const interval = setInterval(() => refreshEditLock(editId), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isEditMode, editId]);

  const acquireEditLock = async (surveyId: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('surveys').update({ editing_by: user.id, editing_since: new Date().toISOString() }).eq('id', surveyId);
    } catch { /* ignore */ }
  };

  const releaseEditLock = async (surveyId: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('surveys').update({ editing_by: null, editing_since: null }).eq('id', surveyId).eq('editing_by', user.id);
    } catch { /* ignore */ }
  };

  const refreshEditLock = async (surveyId: string) => {
    if (!user?.id) return;
    try {
      await supabase.from('surveys').update({ editing_since: new Date().toISOString() }).eq('id', surveyId).eq('editing_by', user.id);
    } catch { /* ignore */ }
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
      setCurrentVersion(surveyData.version ?? 1);
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
        const isTextQ = q.question_type === 'multiple' && !!metaOpt;
        const isLongTextQ = q.question_type === 'longtext';
        const visibleOptions = qOptions.filter((o: any) => !isMetaOption(o.option_text));

        let textMaxAnswers = 3;
        if (metaOpt) textMaxAnswers = parseTextMaxAnswers(metaOpt.option_text) ?? 3;
        else if (q.max_text_answers) textMaxAnswers = q.max_text_answers;

        let questionType: QuestionType = q.question_type as QuestionType;
        if (isTextQ) questionType = 'text';
        else if (isLongTextQ) questionType = 'longtext';

        return {
          id: crypto.randomUUID(),
          dbId: q.id,
          question_text: q.question_text,
          question_type: questionType,
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

  // ── Question helpers (stable with useCallback) ────────────────────────────

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, {
      id: crypto.randomUUID(), question_text: '', question_type: 'single',
      text_max_answers: 3, allow_comment: false, is_category: false,
      options: [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }],
    }]);
  }, []);

  const removeQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  }, []);

  const moveQuestion = useCallback((fromIndex: number, toIndex: number) => {
    setQuestions((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const updateQuestion = useCallback((questionId: string, field: string, value: unknown) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== questionId) return q;
      const next = { ...q, [field]: value } as QuestionData;
      if (field === 'question_type') {
        if (value === 'text' && !next.text_max_answers) next.text_max_answers = 3;
        if (value !== 'single') next.is_category = false;
      }
      return next;
    }));
  }, []);

  const addOption = useCallback((questionId: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === questionId ? { ...q, options: [...q.options, { id: crypto.randomUUID(), text: '' }] } : q
    ));
  }, []);

  const removeOption = useCallback((questionId: string, optionId: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === questionId ? { ...q, options: q.options.filter((o) => o.id !== optionId) } : q
    ));
  }, []);

  const updateOption = useCallback((questionId: string, optionId: string, text: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === questionId ? { ...q, options: q.options.map((o) => (o.id === optionId ? { ...o, text } : o)) } : q
    ));
  }, []);

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, id: string, index: number) => {
    setDraggedId(id);
    draggedIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div');
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId((prev) => (id !== draggedId ? id : prev));
  }, [draggedId]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDraggedId((currentDraggedId) => {
      if (!currentDraggedId || currentDraggedId === targetId) return null;
      const fromIndex = draggedIndex.current;
      setQuestions((prev) => {
        const toIndex = prev.findIndex((q) => q.id === targetId);
        if (fromIndex === -1 || toIndex === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
      return null;
    });
    setDragOverId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    if (!title.trim()) { toast.error('Bitte geben Sie einen Titel ein'); return false; }
    if (questions.length === 0) { toast.error('Bitte fügen Sie mindestens eine Frage hinzu'); return false; }
    const catCount = questions.filter((q) => q.is_category).length;
    if (catCount > 1) { toast.error('Es kann nur eine Frage als Kategorie markiert werden'); return false; }
    for (const q of questions) {
      if (!q.question_text.trim()) { toast.error('Alle Fragen müssen einen Text haben'); return false; }
      if (q.question_type === 'text') {
        const m = Number(q.text_max_answers);
        if (!Number.isFinite(m) || m < 1 || m > 10) { toast.error('Max. Antworten muss zwischen 1 und 10 liegen'); return false; }
      }
      if (q.question_type !== 'rating' && q.question_type !== 'text' && q.question_type !== 'longtext') {
        if (q.options.some((o) => !o.text.trim())) { toast.error('Alle Antwortoptionen müssen ausgefüllt sein'); return false; }
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

  const updateSurvey = async (surveyId: string, forceOverwrite = false) => {
    const { data: currentData, error: fetchError } = await supabase.from('surveys').select('version, title, description').eq('id', surveyId).single();
    if (fetchError) throw fetchError;

    const dbVersion = currentData.version ?? 1;

    if (!forceOverwrite && dbVersion !== currentVersion) {
      setConflictData({ currentTitle: currentData.title, currentDescription: currentData.description, myTitle: title, myDescription: description });
      setShowConflictDialog(true);
      throw new Error('VERSION_CONFLICT');
    }

    const newVersion = dbVersion + 1;
    const { error } = await supabase.from('surveys')
      .update({ title, description, updated_at: new Date().toISOString(), visibility, allow_copy: allowCopy, allow_edit: allowEdit, version: newVersion, editing_by: null, editing_since: null, last_modified_by: user?.id })
      .eq('id', surveyId);
    if (error) throw error;

    setCurrentVersion(newVersion);
    const { error: delErr } = await supabase.from('questions').delete().eq('survey_id', surveyId);
    if (delErr) throw delErr;
    await saveQuestions(surveyId, questions);
  };

  const saveQuestions = async (surveyId: string, qs: QuestionData[]) => {
    if (qs.length === 0) return;

    const questionRows = qs.map((q, i) => ({
      survey_id: surveyId,
      question_text: q.question_text,
      question_type: q.question_type === 'text' ? 'multiple' : q.question_type,
      order_index: i,
      max_text_answers: q.question_type === 'text' ? Number(q.text_max_answers) : null,
    }));

    const { data: insertedQuestions, error: questionsError } = await supabase
      .from('questions').insert(questionRows).select('id, order_index');
    if (questionsError) throw questionsError;

    const sortedInserted = [...(insertedQuestions || [])].sort((a, b) => a.order_index - b.order_index);

    const allOptionRows: { question_id: string; option_text: string; order_index: number }[] = [];

    for (let i = 0; i < qs.length; i++) {
      const question = qs[i];
      const questionId = sortedInserted[i]?.id;
      if (!questionId) continue;

      if (question.question_type === 'rating') {
        for (let j = 1; j <= 5; j++) {
          allOptionRows.push({ question_id: questionId, option_text: j.toString(), order_index: j - 1 });
        }
      } else if (question.question_type === 'text') {
        allOptionRows.push({ question_id: questionId, option_text: buildTextMetaOption(Number(question.text_max_answers)), order_index: 9999 });
      } else if (question.question_type !== 'longtext') {
        question.options.forEach((opt, j) => {
          allOptionRows.push({ question_id: questionId, option_text: opt.text, order_index: j });
        });
      }

      if (question.allow_comment) {
        allOptionRows.push({ question_id: questionId, option_text: buildCommentMetaOption(), order_index: 9998 });
      }
      if (question.is_category && question.question_type === 'single') {
        allOptionRows.push({ question_id: questionId, option_text: buildCategoryMetaOption(), order_index: 9997 });
      }
    }

    if (allOptionRows.length > 0) {
      const { error: optionsError } = await supabase.from('options').insert(allOptionRows);
      if (optionsError) throw optionsError;
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
                  <p className="text-xs text-amber-700 mt-1">Sie können trotzdem Änderungen vornehmen, aber es kann zu Konflikten kommen.</p>
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
                      <p className="text-xs text-gray-500 mt-0.5">Alle Benutzer können diese Vorlage direkt bearbeiten.</p>
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
          {questions.map((question, qIndex) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={qIndex}
              total={questions.length}
              categoryCount={categoryCount}
              isDragging={draggedId === question.id}
              isDragOver={dragOverId === question.id}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
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
            <Button onClick={async () => {
              setShowConflictDialog(false);
              if (!editId) return;
              setSaving(true);
              try {
                await updateSurvey(editId, true);
                toast.success('Umfrage aktualisiert');
                navigate('/admin');
              } catch (error) {
                toast.error('Fehler beim Speichern');
              } finally { setSaving(false); }
            }} className="bg-amber-600 hover:bg-amber-700">
              Meine Version überschreiben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateSurvey;

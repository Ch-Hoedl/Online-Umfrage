import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Question } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft, Save, GripVertical, ChevronUp, ChevronDown, MessageSquare, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { encodeDescriptionWithMeta, decodeDescriptionWithMeta } from '@/utils/surveyMeta';

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
  const [maxVotes, setMaxVotes] = useState('');
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIndex = useRef<number>(-1);

  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => { loadUserProfile(); }, []);
  useEffect(() => { if (isEditMode && editId) loadExistingSurvey(editId); }, [editId]);

  const loadUserProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) throw error;
      setUserProfile(data);
      if (data.role === 'user') { toast.error('Keine Berechtigung'); navigate('/admin'); }
    } catch { toast.error('Fehler beim Laden des Benutzerprofils'); navigate('/admin'); }
  };

  const loadExistingSurvey = async (surveyId: string) => {
    setLoadingData(true);
    try {
      const { data: surveyData, error: surveyError } = await supabase.from('surveys').select('*').eq('id', surveyId).single();
      if (surveyError) throw surveyError;

      const decoded = decodeDescriptionWithMeta(surveyData.description);
      setTitle(surveyData.title);
      setDescription(decoded.description || '');
      if (decoded.meta.max_votes) setMaxVotes(String(decoded.meta.max_votes));
      if (decoded.meta.expires_at) {
        const d = new Date(decoded.meta.expires_at);
        setExpiresAtLocal(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
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
        const isTextQ = !!metaOpt;
        const visibleOptions = qOptions.filter((o: any) => !isMetaOption(o.option_text));

        return {
          id: crypto.randomUUID(),
          dbId: q.id,
          question_text: q.question_text,
          question_type: isTextQ ? 'text' : q.question_type,
          text_max_answers: metaOpt ? (parseTextMaxAnswers(metaOpt.option_text) ?? 3) : 3,
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
    } finally {
      setLoadingData(false);
    }
  };

  // ── Question helpers ──────────────────────────────────────────────────────

  const addQuestion = () => {
    setQuestions([...questions, {
      id: crypto.randomUUID(),
      question_text: '',
      question_type: 'single',
      text_max_answers: 3,
      allow_comment: false,
      is_category: false,
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
      // Reset is_category if type changes away from single
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
    setDraggedId(id);
    draggedIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div');
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const fromIndex = draggedIndex.current;
    const toIndex = questions.findIndex((q) => q.id === targetId);
    if (fromIndex !== -1 && toIndex !== -1) moveQuestion(fromIndex, toIndex);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    if (!title.trim()) { toast.error('Bitte geben Sie einen Titel ein'); return false; }
    if (!expiresAtLocal.trim()) { toast.error('Bitte geben Sie ein Ablaufdatum an'); return false; }
    const expiresAtDate = new Date(expiresAtLocal);
    if (Number.isNaN(expiresAtDate.getTime())) { toast.error('Ungültiges Ablaufdatum'); return false; }
    if (expiresAtDate.getTime() <= Date.now()) { toast.error('Das Ablaufdatum muss in der Zukunft liegen'); return false; }
    const parsedMaxVotes = maxVotes.trim() ? Number.parseInt(maxVotes, 10) : null;
    if (maxVotes.trim() && (!Number.isFinite(parsedMaxVotes) || (parsedMaxVotes ?? 0) < 1)) {
      toast.error('Das Stimmen-Limit muss ≥ 1 sein'); return false;
    }
    if (questions.length === 0) { toast.error('Bitte fügen Sie mindestens eine Frage hinzu'); return false; }
    const categoryCount = questions.filter((q) => q.is_category).length;
    if (categoryCount > 1) { toast.error('Es kann nur eine Frage als Kategorie markiert werden'); return false; }
    for (const q of questions) {
      if (!q.question_text.trim()) { toast.error('Alle Fragen müssen einen Text haben'); return false; }
      if (q.question_type === 'text') {
        const m = Number(q.text_max_answers);
        if (!Number.isFinite(m) || m < 1 || m > 10) { toast.error('Max. Antworten muss zwischen 1 und 10 liegen'); return false; }
      }
      if (q.question_type !== 'rating' && q.question_type !== 'text' && q.options.some((o) => !o.text.trim())) {
        toast.error('Alle Antwortoptionen müssen ausgefüllt sein'); return false;
      }
    }
    return true;
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const expiresAt = new Date(expiresAtLocal).toISOString();
    const parsedMaxVotes = maxVotes.trim() ? Number.parseInt(maxVotes, 10) : null;
    const descriptionWithMeta = encodeDescriptionWithMeta(description, { max_votes: parsedMaxVotes, expires_at: expiresAt });
    try {
      if (isEditMode && editId) await updateSurvey(editId, descriptionWithMeta);
      else await createSurvey(descriptionWithMeta);
      toast.success(isEditMode ? 'Umfrage aktualisiert' : 'Umfrage erstellt');
      navigate('/admin');
    } catch (error) {
      console.error(error);
      toast.error(isEditMode ? 'Fehler beim Aktualisieren' : 'Fehler beim Erstellen');
    } finally { setSaving(false); }
  };

  const createSurvey = async (descriptionWithMeta: string) => {
    const { data: survey, error } = await supabase
      .from('surveys')
      .insert({ title, description: descriptionWithMeta, created_by: user?.id, status: 'draft', is_active: false })
      .select().single();
    if (error) throw error;
    await saveQuestions(survey.id, questions);
  };

  const updateSurvey = async (surveyId: string, descriptionWithMeta: string) => {
    const { error } = await supabase.from('surveys')
      .update({ title, description: descriptionWithMeta, updated_at: new Date().toISOString() })
      .eq('id', surveyId);
    if (error) throw error;
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
        .insert({ survey_id: surveyId, question_text: question.question_text, question_type: dbQuestionType, order_index: i })
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

      // Kategorie-Meta-Option speichern
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
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isEditMode ? 'Umfrage bearbeiten' : 'Neue Umfrage erstellen'}
            </h1>
            <p className="text-gray-600">
              {isEditMode ? 'Ändern Sie Titel, Fragen und Antwortmöglichkeiten' : 'Erstellen Sie Fragen und Antwortmöglichkeiten'}
            </p>
          </div>
        </div>

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxVotes">Stimmen-Limit (optional)</Label>
                <Input id="maxVotes" type="number" min={1} value={maxVotes} onChange={(e) => setMaxVotes(e.target.value)} placeholder="z.B. 100" />
              </div>
              <div>
                <Label htmlFor="expiresAt">Ablaufdatum *</Label>
                <Input id="expiresAt" type="datetime-local" value={expiresAtLocal} onChange={(e) => setExpiresAtLocal(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {questions.length > 0 && (
          <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
            <GripVertical className="w-4 h-4" />
            Fragen per Drag &amp; Drop oder mit den Pfeilen verschieben
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
                      <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 flex-shrink-0" title="Ziehen zum Verschieben">
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
                        <Button onClick={() => moveQuestion(qIndex, qIndex - 1)} disabled={qIndex === 0} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30" title="Nach oben">
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => moveQuestion(qIndex, qIndex + 1)} disabled={qIndex === questions.length - 1} variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600 disabled:opacity-30" title="Nach unten">
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => removeQuestion(question.id)} variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" title="Frage löschen">
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
                        </SelectContent>
                      </Select>
                    </div>

                    {question.question_type === 'text' && (
                      <div>
                        <Label>Max. Antworten</Label>
                        <Input type="number" min={1} max={10} value={question.text_max_answers}
                          onChange={(e) => updateQuestion(question.id, 'text_max_answers', Number.parseInt(e.target.value || '1', 10))}
                          placeholder="z.B. 3" />
                        <p className="text-xs text-gray-500 mt-1">Teilnehmer können bis zu so viele Begriffe eingeben.</p>
                      </div>
                    )}

                    {question.question_type !== 'rating' && question.question_type !== 'text' && (
                      <div>
                        <Label>Antwortmöglichkeiten *</Label>
                        <div className="space-y-2 mt-2">
                          {question.options.map((option, oIndex) => (
                            <div key={option.id} className="flex gap-2">
                              <Input value={option.text} onChange={(e) => updateOption(question.id, option.id, e.target.value)} placeholder={`Option ${oIndex + 1}`} />
                              {question.options.length > 2 && (
                                <Button onClick={() => removeOption(question.id, option.id)} variant="outline" size="icon">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
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

                      {/* Kategorie-Option – nur bei Einfachauswahl */}
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
                            <Label
                              htmlFor={`category-${question.id}`}
                              className={`cursor-pointer flex items-center gap-1.5 font-medium ${!question.is_category && categoryCount >= 1 ? 'text-gray-400' : 'text-gray-700'}`}
                            >
                              <Tag className="w-4 h-4 text-purple-500" />
                              Als Kategorie verwenden
                            </Label>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {!question.is_category && categoryCount >= 1
                                ? 'Es kann nur eine Frage als Kategorie markiert werden.'
                                : 'In der Auswertung können Antworten nach dieser Frage gefiltert werden.'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Kommentar-Option */}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`comment-${question.id}`}
                          checked={question.allow_comment}
                          onCheckedChange={(checked) => updateQuestion(question.id, 'allow_comment', !!checked)}
                          className="mt-0.5"
                        />
                        <div>
                          <Label htmlFor={`comment-${question.id}`} className="cursor-pointer flex items-center gap-1.5 font-medium text-gray-700">
                            <MessageSquare className="w-4 h-4 text-blue-500" />
                            Persönlichen Kommentar erlauben
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
    </div>
  );
};

export default CreateSurvey;
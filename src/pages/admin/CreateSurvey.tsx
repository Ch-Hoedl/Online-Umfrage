import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface QuestionData {
  id: string;
  dbId?: string;
  question_text: string;
  question_type: 'single' | 'multiple' | 'rating' | 'text';
  options: { id: string; dbId?: string; text: string }[];
  max_text_answers: number;
}

const CreateSurvey = () => {
  const { id: surveyId } = useParams();
  const isEditMode = !!surveyId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxVotes, setMaxVotes] = useState('');
  const [expiresAtLocal, setExpiresAtLocal] = useState('');

  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    loadUserProfile();
    if (isEditMode) {
      loadSurvey();
    }
  }, [surveyId]);

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
        navigate('/admin');
      }
    } catch (error) {
      toast.error('Fehler beim Laden des Benutzerprofils');
      navigate('/admin');
    }
  };

  const loadSurvey = async () => {
    if (!surveyId) return;

    setLoading(true);
    try {
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .single();

      if (surveyError) throw surveyError;

      setTitle(surveyData.title);
      setDescription(surveyData.description || '');
      setMaxVotes(surveyData.max_votes?.toString() || '');

      if (surveyData.expires_at) {
        const date = new Date(surveyData.expires_at);
        const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setExpiresAtLocal(localDateTime);
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', surveyId)
        .order('order_index');

      if (questionsError) throw questionsError;

      const { data: optionsData, error: optionsError } = await supabase
        .from('options')
        .select('*')
        .in('question_id', (questionsData || []).map((q) => q.id));

      if (optionsError) throw optionsError;

      const optionsByQuestion: { [key: string]: Option[] } = {};
      (optionsData || []).forEach((opt: Option) => {
        if (!optionsByQuestion[opt.question_id]) {
          optionsByQuestion[opt.question_id] = [];
        }
        optionsByQuestion[opt.question_id].push(opt);
      });

      const loadedQuestions: QuestionData[] = (questionsData || []).map((q: any) => ({
        id: crypto.randomUUID(),
        dbId: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        max_text_answers: q.max_text_answers ?? 3,
        options: (optionsByQuestion[q.id] || [])
          .sort((a, b) => a.order_index - b.order_index)
          .map((opt) => ({
            id: crypto.randomUUID(),
            dbId: opt.id,
            text: opt.option_text,
          })),
      }));

      setQuestions(loadedQuestions);
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Laden der Umfrage');
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: crypto.randomUUID(),
        question_text: '',
        question_type: 'single',
        max_text_answers: 3,
        options: [
          { id: crypto.randomUUID(), text: '' },
          { id: crypto.randomUUID(), text: '' },
        ],
      },
    ]);
  };

  const removeQuestion = (questionId: string) => {
    setQuestions(questions.filter((q) => q.id !== questionId));
  };

  const updateQuestion = (questionId: string, field: string, value: any) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== questionId) return q;

        const next = { ...q, [field]: value } as QuestionData;
        if (field === 'question_type' && value === 'text' && !next.max_text_answers) {
          next.max_text_answers = 3;
        }
        return next;
      })
    );
  };

  const addOption = (questionId: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? { ...q, options: [...q.options, { id: crypto.randomUUID(), text: '' }] }
          : q
      )
    );
  };

  const removeOption = (questionId: string, optionId: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.filter((o) => o.id !== optionId) }
          : q
      )
    );
  };

  const updateOption = (questionId: string, optionId: string, text: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((o) =>
                o.id === optionId ? { ...o, text } : o
              ),
            }
          : q
      )
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Bitte geben Sie einen Titel ein');
      return;
    }

    if (!expiresAtLocal.trim()) {
      toast.error('Bitte geben Sie ein Ablaufdatum an');
      return;
    }

    const expiresAtDate = new Date(expiresAtLocal);
    if (Number.isNaN(expiresAtDate.getTime())) {
      toast.error('Bitte geben Sie ein gültiges Ablaufdatum an');
      return;
    }

    if (expiresAtDate.getTime() <= Date.now()) {
      toast.error('Das Ablaufdatum muss in der Zukunft liegen');
      return;
    }

    const expiresAt = expiresAtDate.toISOString();

    const parsedMaxVotes = maxVotes.trim() ? Number.parseInt(maxVotes, 10) : null;
    if (maxVotes.trim() && (!Number.isFinite(parsedMaxVotes) || (parsedMaxVotes ?? 0) < 1)) {
      toast.error('Das Stimmen-Limit muss eine Zahl größer/gleich 1 sein');
      return;
    }

    if (questions.length === 0) {
      toast.error('Bitte fügen Sie mindestens eine Frage hinzu');
      return;
    }

    for (const question of questions) {
      if (!question.question_text.trim()) {
        toast.error('Alle Fragen müssen einen Text haben');
        return;
      }

      if (question.question_type === 'text') {
        const maxAnswers = Number(question.max_text_answers);
        if (!Number.isFinite(maxAnswers) || maxAnswers < 1 || maxAnswers > 10) {
          toast.error('Bei offenen Fragen muss „Max. Antworten" zwischen 1 und 10 liegen');
          return;
        }
      }

      if (
        question.question_type !== 'rating' &&
        question.question_type !== 'text' &&
        question.options.some((o) => !o.text.trim())
      ) {
        toast.error('Alle Antwortoptionen müssen ausgefüllt sein');
        return;
      }
    }

    setSaving(true);

    try {
      let surveyIdToUse = surveyId;

      if (isEditMode) {
        console.log('[CreateSurvey] Edit mode: updating survey', surveyId);
        
        // Update bestehende Umfrage
        const { error: surveyError } = await supabase
          .from('surveys')
          .update({
            title,
            description,
            max_votes: parsedMaxVotes,
            expires_at: expiresAt,
          })
          .eq('id', surveyId);

        if (surveyError) {
          console.error('[CreateSurvey] Error updating survey:', surveyError);
          throw surveyError;
        }

        console.log('[CreateSurvey] Survey updated, now deleting old questions...');

        // Lösche zuerst alle Responses, dann Options, dann Questions
        const { data: oldQuestions, error: fetchQuestionsError } = await supabase
          .from('questions')
          .select('id')
          .eq('survey_id', surveyId);

        if (fetchQuestionsError) {
          console.error('[CreateSurvey] Error fetching old questions:', fetchQuestionsError);
          throw fetchQuestionsError;
        }

        console.log('[CreateSurvey] Found old questions:', oldQuestions?.length || 0);

        if (oldQuestions && oldQuestions.length > 0) {
          const questionIds = oldQuestions.map((q) => q.id);

          // 1. Lösche Responses
          console.log('[CreateSurvey] Deleting responses...');
          const { error: deleteResponsesError } = await supabase
            .from('responses')
            .delete()
            .in('question_id', questionIds);

          if (deleteResponsesError) {
            console.error('[CreateSurvey] Error deleting responses:', deleteResponsesError);
            throw deleteResponsesError;
          }

          // 2. Lösche Options
          console.log('[CreateSurvey] Deleting options...');
          const { error: deleteOptionsError } = await supabase
            .from('options')
            .delete()
            .in('question_id', questionIds);

          if (deleteOptionsError) {
            console.error('[CreateSurvey] Error deleting options:', deleteOptionsError);
            throw deleteOptionsError;
          }

          // 3. Lösche Questions
          console.log('[CreateSurvey] Deleting questions...');
          const { error: deleteQuestionsError } = await supabase
            .from('questions')
            .delete()
            .eq('survey_id', surveyId);

          if (deleteQuestionsError) {
            console.error('[CreateSurvey] Error deleting questions:', deleteQuestionsError);
            throw deleteQuestionsError;
          }
        }

        console.log('[CreateSurvey] Old data deleted successfully');
      } else {
        console.log('[CreateSurvey] Create mode: inserting new survey');
        
        // Neue Umfrage erstellen
        const { data: survey, error: surveyError } = await supabase
          .from('surveys')
          .insert({
            title,
            description,
            created_by: user?.id,
            max_votes: parsedMaxVotes,
            expires_at: expiresAt,
          })
          .select()
          .single();

        if (surveyError) throw surveyError;
        surveyIdToUse = survey.id;
      }

      console.log('[CreateSurvey] Inserting questions...');
      // Fragen und Optionen speichern
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        console.log('[CreateSurvey] Inserting question', i + 1, ':', question.question_text);
        
        const { data: questionData, error: questionError } = await supabase
          .from('questions')
          .insert({
            survey_id: surveyIdToUse,
            question_text: question.question_text,
            question_type: question.question_type,
            order_index: i,
            max_text_answers: question.question_type === 'text' ? question.max_text_answers : null,
          })
          .select()
          .single();

        if (questionError) {
          console.error('[CreateSurvey] Error inserting question:', questionError);
          throw questionError;
        }

        if (question.question_type === 'rating') {
          for (let j = 1; j <= 5; j++) {
            const { error: optionError } = await supabase
              .from('options')
              .insert({
                question_id: questionData.id,
                option_text: j.toString(),
                order_index: j - 1,
              });

            if (optionError) {
              console.error('[CreateSurvey] Error inserting rating option:', optionError);
              throw optionError;
            }
          }
        } else if (question.question_type !== 'text') {
          for (let j = 0; j < question.options.length; j++) {
            const { error: optionError } = await supabase
              .from('options')
              .insert({
                question_id: questionData.id,
                option_text: question.options[j].text,
                order_index: j,
              });

            if (optionError) {
              console.error('[CreateSurvey] Error inserting option:', optionError);
              throw optionError;
            }
          }
        }
      }

      console.log('[CreateSurvey] All questions and options saved successfully');
      toast.success(isEditMode ? 'Umfrage erfolgreich aktualisiert' : 'Umfrage erfolgreich erstellt');
      navigate('/admin');
    } catch (error) {
      console.error('[CreateSurvey] Save error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unbekannter Fehler';
      toast.error(`Fehler beim Speichern: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
            <p className="text-gray-600">Erstellen Sie Fragen und Antwortmöglichkeiten</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Umfrage-Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Kundenzufriedenheit 2024"
              />
            </div>
            <div>
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optionale Beschreibung der Umfrage"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxVotes">Stimmen-Limit (optional)</Label>
                <Input
                  id="maxVotes"
                  type="number"
                  min={1}
                  value={maxVotes}
                  onChange={(e) => setMaxVotes(e.target.value)}
                  placeholder="z.B. 100"
                />
              </div>
              <div>
                <Label htmlFor="expiresAt">Ablaufdatum *</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAtLocal}
                  onChange={(e) => setExpiresAtLocal(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 mb-6">
          {questions.map((question, qIndex) => (
            <Card key={question.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">Frage {qIndex + 1}</CardTitle>
                  <Button
                    onClick={() => removeQuestion(question.id)}
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Fragetext *</Label>
                  <Input
                    value={question.question_text}
                    onChange={(e) =>
                      updateQuestion(question.id, 'question_text', e.target.value)
                    }
                    placeholder="Ihre Frage hier eingeben"
                  />
                </div>

                <div>
                  <Label>Fragetyp</Label>
                  <Select
                    value={question.question_type}
                    onValueChange={(value) =>
                      updateQuestion(question.id, 'question_type', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Einfachauswahl</SelectItem>
                      <SelectItem value="multiple">Mehrfachauswahl</SelectItem>
                      <SelectItem value="rating">Bewertung (1-5)</SelectItem>
                      <SelectItem value="text">Offene Frage (Begriffe)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {question.question_type === 'text' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Max. Antworten</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={question.max_text_answers}
                        onChange={(e) =>
                          updateQuestion(
                            question.id,
                            'max_text_answers',
                            Number.parseInt(e.target.value || '1', 10)
                          )
                        }
                        placeholder="z.B. 3"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Anzahl der Eingabefelder für Begriffe (1-10).
                      </p>
                    </div>
                  </div>
                )}

                {question.question_type !== 'rating' && question.question_type !== 'text' && (
                  <div>
                    <Label>Antwortmöglichkeiten *</Label>
                    <div className="space-y-2 mt-2">
                      {question.options.map((option, oIndex) => (
                        <div key={option.id} className="flex gap-2">
                          <Input
                            value={option.text}
                            onChange={(e) =>
                              updateOption(question.id, option.id, e.target.value)
                            }
                            placeholder={`Option ${oIndex + 1}`}
                          />
                          {question.options.length > 2 && (
                            <Button
                              onClick={() => removeOption(question.id, option.id)}
                              variant="outline"
                              size="icon"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        onClick={() => addOption(question.id)}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Option hinzufügen
                      </Button>
                    </div>
                  </div>
                )}

                {question.question_type === 'rating' && (
                  <p className="text-sm text-gray-600">
                    Für Bewertungen werden automatisch die Optionen 1–5 angelegt.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-3">
          <Button onClick={addQuestion} variant="outline" className="flex-1">
            <Plus className="w-5 h-5 mr-2" />
            Frage hinzufügen
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Speichern...' : (isEditMode ? 'Änderungen speichern' : 'Umfrage speichern')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateSurvey;
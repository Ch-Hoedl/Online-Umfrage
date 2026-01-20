import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
  question_text: string;
  question_type: 'single' | 'multiple' | 'rating';
  options: { id: string; text: string }[];
}

const CreateSurvey = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: crypto.randomUUID(),
        question_text: '',
        question_type: 'single',
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
      questions.map((q) =>
        q.id === questionId ? { ...q, [field]: value } : q
      )
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

    if (questions.length === 0) {
      toast.error('Bitte fügen Sie mindestens eine Frage hinzu');
      return;
    }

    for (const question of questions) {
      if (!question.question_text.trim()) {
        toast.error('Alle Fragen müssen einen Text haben');
        return;
      }
      if (question.question_type !== 'rating' && question.options.some((o) => !o.text.trim())) {
        toast.error('Alle Antwortoptionen müssen ausgefüllt sein');
        return;
      }
    }

    setSaving(true);

    try {
      const { data: survey, error: surveyError } = await supabase
        .from('surveys')
        .insert({
          title,
          description,
          created_by: user?.id,
        })
        .select()
        .single();

      if (surveyError) throw surveyError;

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const { data: questionData, error: questionError } = await supabase
          .from('questions')
          .insert({
            survey_id: survey.id,
            question_text: question.question_text,
            question_type: question.question_type,
            order_index: i,
          })
          .select()
          .single();

        if (questionError) throw questionError;

        if (question.question_type === 'rating') {
          for (let j = 1; j <= 5; j++) {
            const { error: optionError } = await supabase
              .from('options')
              .insert({
                question_id: questionData.id,
                option_text: j.toString(),
                order_index: j - 1,
              });

            if (optionError) throw optionError;
          }
        } else {
          for (let j = 0; j < question.options.length; j++) {
            const { error: optionError } = await supabase
              .from('options')
              .insert({
                question_id: questionData.id,
                option_text: question.options[j].text,
                order_index: j,
              });

            if (optionError) throw optionError;
          }
        }
      }

      toast.success('Umfrage erfolgreich erstellt');
      navigate('/admin');
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Erstellen der Umfrage');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button onClick={() => navigate('/admin')} variant="outline" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Neue Umfrage erstellen</h1>
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
                    </SelectContent>
                  </Select>
                </div>

                {question.question_type !== 'rating' && (
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
            {saving ? 'Speichern...' : 'Umfrage speichern'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateSurvey;
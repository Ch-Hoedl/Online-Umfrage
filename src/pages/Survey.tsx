import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, BarChart3 } from 'lucide-react';

const SurveyPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<{ [key: string]: Option[] }>({});
  const [answers, setAnswers] = useState<{ [key: string]: string[] }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadSurvey();
  }, [id]);

  const loadSurvey = async () => {
    try {
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (surveyError) throw surveyError;
      setSurvey(surveyData);

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', id)
        .order('order_index');

      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);

      const { data: optionsData, error: optionsError } = await supabase
        .from('options')
        .select('*')
        .in('question_id', questionsData?.map((q) => q.id) || []);

      if (optionsError) throw optionsError;

      const optionsByQuestion: { [key: string]: Option[] } = {};
      optionsData?.forEach((opt) => {
        if (!optionsByQuestion[opt.question_id]) {
          optionsByQuestion[opt.question_id] = [];
        }
        optionsByQuestion[opt.question_id].push(opt);
      });

      // Sortiere Optionen innerhalb jeder Frage (wichtig, damit Antworten korrekt angezeigt/ausgewählt werden können)
      Object.keys(optionsByQuestion).forEach((questionId) => {
        optionsByQuestion[questionId].sort((a, b) => a.order_index - b.order_index);
      });

      setOptions(optionsByQuestion);
    } catch (error) {
      toast.error('Umfrage nicht gefunden oder nicht aktiv');
    } finally {
      setLoading(false);
    }
  };

  const handleSingleChoice = (questionId: string, optionId: string) => {
    setAnswers({ ...answers, [questionId]: [optionId] });
  };

  const handleMultipleChoice = (questionId: string, optionId: string, checked: boolean) => {
    const currentAnswers = answers[questionId] || [];
    if (checked) {
      setAnswers({ ...answers, [questionId]: [...currentAnswers, optionId] });
    } else {
      setAnswers({
        ...answers,
        [questionId]: currentAnswers.filter((id) => id !== optionId),
      });
    }
  };

  const handleSubmit = async () => {
    for (const question of questions) {
      if (!answers[question.id] || answers[question.id].length === 0) {
        toast.error('Bitte beantworten Sie alle Fragen');
        return;
      }
    }

    setSubmitting(true);

    try {
      const participantId = crypto.randomUUID();

      for (const questionId in answers) {
        for (const optionId of answers[questionId]) {
          const { error } = await supabase.from('responses').insert({
            question_id: questionId,
            option_id: optionId,
            participant_id: participantId,
          });

          if (error) throw error;
        }
      }

      setSubmitted(true);
      toast.success('Vielen Dank für Ihre Teilnahme!');
    } catch (error) {
      toast.error('Fehler beim Absenden der Antworten');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Umfrage nicht gefunden</h2>
            <p className="text-gray-600">Diese Umfrage existiert nicht oder ist nicht mehr aktiv.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Vielen Dank!</h2>
            <p className="text-gray-600">Ihre Antworten wurden erfolgreich gespeichert.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{survey.title}</h1>
          {survey.description && (
            <p className="text-lg text-gray-600">{survey.description}</p>
          )}
        </div>

        <div className="space-y-6">
          {questions.map((question, index) => (
            <Card key={question.id}>
              <CardHeader>
                <CardTitle className="text-xl">
                  {index + 1}. {question.question_text}
                </CardTitle>
                <CardDescription>
                  {question.question_type === 'single' && 'Wählen Sie eine Antwort'}
                  {question.question_type === 'multiple' && 'Wählen Sie eine oder mehrere Antworten'}
                  {question.question_type === 'rating' && 'Bewerten Sie von 1 bis 5'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {question.question_type === 'single' && (
                  <RadioGroup
                    value={answers[question.id]?.[0] || ''}
                    onValueChange={(value) => handleSingleChoice(question.id, value)}
                  >
                    {options[question.id]?.map((option) => (
                      <div key={option.id} className="flex items-center space-x-2 mb-3">
                        <RadioGroupItem value={option.id} id={option.id} />
                        <Label htmlFor={option.id} className="cursor-pointer flex-1">
                          {option.option_text}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {question.question_type === 'multiple' && (
                  <div className="space-y-3">
                    {options[question.id]?.map((option) => (
                      <div key={option.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={option.id}
                          checked={answers[question.id]?.includes(option.id) || false}
                          onCheckedChange={(checked) =>
                            handleMultipleChoice(question.id, option.id, checked as boolean)
                          }
                        />
                        <Label htmlFor={option.id} className="cursor-pointer flex-1">
                          {option.option_text}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                {question.question_type === 'rating' && (
                  <RadioGroup
                    value={answers[question.id]?.[0] || ''}
                    onValueChange={(value) => handleSingleChoice(question.id, value)}
                  >
                    <div className="flex gap-4 justify-center">
                      {options[question.id]?.map((option) => (
                        <div key={option.id} className="flex flex-col items-center">
                          <RadioGroupItem value={option.id} id={option.id} className="mb-2" />
                          <Label htmlFor={option.id} className="cursor-pointer text-lg font-semibold">
                            {option.option_text}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-6"
          >
            {submitting ? 'Wird gesendet...' : 'Antworten absenden'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SurveyPage;
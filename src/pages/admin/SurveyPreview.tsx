import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { BarChart3, Eye, ArrowLeft, CheckCircle2 } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
import { SurveyNavigation, SurveyNavigationControls } from '@/components/SurveyNavigation';
import { useSurveyAnswers } from '@/hooks/useSurveyAnswers';
import {
  isQuestionAnswered,
  isMultiRatingQuestion as isMultiRatingQ,
} from '@/lib/surveyHelpers';

const SurveyPreview = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<{ [qid: string]: Option[] }>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [previewSubmitted, setPreviewSubmitted] = useState(false);

  const {
    answers, comments, resetAnswers,
    handleSingleChoice, handleMultipleChoice, handleTextChange,
    handleLongTextChange, handleCommentChange, handleMultiRatingChange,
  } = useSurveyAnswers();

  useEffect(() => { loadSurvey(); }, [id]);

  const loadSurvey = async () => {
    setLoading(true);
    try {
      const { data: surveyData, error } = await supabase
        .from('surveys').select('*').eq('id', id).single();
      if (error) throw error;

      setSurvey({
        ...surveyData,
        description: surveyData.description,
        expires_at: surveyData.expires_at ?? null,
        max_votes: surveyData.max_votes ?? null,
      } as Survey);

      const { data: questionsData, error: qErr } = await supabase
        .from('questions').select('*').eq('survey_id', id).order('order_index');
      if (qErr) throw qErr;
      const loadedQuestions = questionsData || [];
      setQuestions(loadedQuestions);

      const questionIds = loadedQuestions.map((q) => q.id);
      if (questionIds.length > 0) {
        const { data: optionsData } = await supabase
          .from('options').select('*').in('question_id', questionIds);
        const byQ: { [qid: string]: Option[] } = {};
        optionsData?.forEach((opt) => {
          if (!byQ[opt.question_id]) byQ[opt.question_id] = [];
          byQ[opt.question_id].push(opt);
        });
        Object.keys(byQ).forEach((qid) => byQ[qid].sort((a, b) => a.order_index - b.order_index));
        setOptions(byQ);
      }
    } catch { toast.error('Umfrage konnte nicht geladen werden'); }
    finally { setLoading(false); }
  };

  // ── navigation ────────────────────────────────────────────────────────────────

  const goNext = () => { if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1); };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); };

  const handlePreviewSubmit = () => {
    for (const question of questions) {
      if (!isQuestionAnswered(question.id, answers, options, questions)) {
        const msg = isMultiRatingQ(question.id, questions)
          ? 'Bitte bewerten Sie alle Eigenschaften'
          : 'Bitte beantworten Sie alle Fragen';
        toast.error(msg);
        setCurrentIndex(questions.indexOf(question));
        return;
      }
    }
    setPreviewSubmitted(true);
  };

  // ── render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Umfrage nicht gefunden</h2>
            <Button onClick={() => navigate('/admin')}>Zurück zum Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (previewSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="bg-amber-400 text-amber-900 text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          VORSCHAU-MODUS – Keine Daten werden gespeichert
        </div>
        <div className="flex items-center justify-center min-h-[calc(100vh-40px)] p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Vielen Dank!</h2>
            <p className="text-lg text-gray-600 mb-2">Ihre Antworten wurden erfolgreich gespeichert.</p>
            <p className="text-gray-500">Wir schätzen Ihre Teilnahme und Ihr wertvolles Feedback sehr.</p>
            <div className="mt-8 pt-6 border-t border-gray-100 space-y-3">
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                ⚠️ Vorschau: In der echten Umfrage würden die Antworten jetzt gespeichert.
              </p>
              <Button
                onClick={() => { setPreviewSubmitted(false); setCurrentIndex(0); resetAnswers(); }}
                variant="outline"
                className="w-full"
              >
                Vorschau neu starten
              </Button>
              <Button onClick={() => navigate('/admin')} className="w-full bg-blue-600 hover:bg-blue-700">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Zurück zum Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">

      <div className="bg-amber-400 text-amber-900 text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 sticky top-0 z-10">
        <Eye className="w-4 h-4 flex-shrink-0" />
        VORSCHAU-MODUS – Keine Daten werden gespeichert
        <button
          onClick={() => navigate('/admin')}
          className="ml-4 underline text-amber-800 hover:text-amber-900 font-normal text-xs"
        >
          ← Zurück zum Dashboard
        </button>
      </div>

      <div className="py-8">
        <div className="container mx-auto px-4 max-w-2xl">

          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-md">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{survey.title}</h1>
            {survey.description && <p className="text-gray-600">{survey.description}</p>}
          </div>

          {questions.length > 0 && (
            <>
              <SurveyNavigation
                questions={questions} currentIndex={currentIndex} answers={answers}
                options={options} onNavigate={setCurrentIndex} onPrev={goPrev}
                onNext={goNext} onSubmit={handlePreviewSubmit} submitLabel="Absenden"
              />

              {currentQuestion && (
                <QuestionRenderer
                  question={currentQuestion}
                  questionIndex={currentIndex}
                  answers={answers}
                  comments={comments}
                  options={options}
                  questions={questions}
                  idPrefix="prev-"
                  onSingleChoice={handleSingleChoice}
                  onMultipleChoice={handleMultipleChoice}
                  onMultiRatingChange={handleMultiRatingChange}
                  onTextChange={handleTextChange}
                  onLongTextChange={handleLongTextChange}
                  onCommentChange={handleCommentChange}
                />
              )}

              <SurveyNavigationControls
                questions={questions} currentIndex={currentIndex} answers={answers}
                options={options} onNavigate={setCurrentIndex} onPrev={goPrev}
                onNext={goNext} onSubmit={handlePreviewSubmit} submitLabel="Absenden"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurveyPreview;

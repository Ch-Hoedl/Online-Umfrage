import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { BarChart3, ChevronLeft, ChevronRight, Send, Eye, ArrowLeft, CheckCircle2 } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
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
  const [answers, setAnswers] = useState<{ [qid: string]: string[] }>({});
  const [comments, setComments] = useState<{ [qid: string]: string }>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [previewSubmitted, setPreviewSubmitted] = useState(false);

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

  // ── answer handlers ───────────────────────────────────────────────────────────

  const handleSingleChoice = (qid: string, optionId: string) =>
    setAnswers((prev) => ({ ...prev, [qid]: [optionId] }));

  const handleMultipleChoice = (qid: string, optionId: string, checked: boolean) =>
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: checked ? [...cur, optionId] : cur.filter((id) => id !== optionId) };
    });

  const handleMultiRatingChange = (qid: string, optionId: string, rating: string) => {
    setAnswers((prev) => {
      const cur = (prev[qid] || []).filter((v) => !v.startsWith(`${optionId}:`));
      return { ...prev, [qid]: [...cur, `${optionId}:${rating}`] };
    });
  };

  const handleTextChange = (qid: string, index: number, value: string) =>
    setAnswers((prev) => {
      const next = (prev[qid] || []).slice();
      while (next.length <= index) next.push('');
      next[index] = value;
      return { ...prev, [qid]: next };
    });

  const handleLongTextChange = (qid: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [qid]: [value] }));

  const handleCommentChange = (qid: string, value: string) =>
    setComments((prev) => ({ ...prev, [qid]: value }));

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
                onClick={() => { setPreviewSubmitted(false); setCurrentIndex(0); setAnswers({}); setComments({}); }}
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

  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const progressPercent = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
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

          {totalQuestions > 0 && (
            <>
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-600">
                    Frage <span className="text-blue-600 font-bold">{currentIndex + 1}</span> von <span className="font-bold">{totalQuestions}</span>
                  </span>
                  <span className="text-sm text-gray-500">{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2.5 rounded-full" />
              </div>

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

              <div className="mt-6 flex items-center gap-3">
                <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex items-center gap-2 px-5">
                  <ChevronLeft className="w-4 h-4" /> Zurück
                </Button>

                <div className="flex-1 flex justify-center gap-1.5 flex-wrap">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(i)}
                      title={`Frage ${i + 1}`}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        i === currentIndex
                          ? 'bg-blue-600 scale-125'
                          : isQuestionAnswered(q.id, answers, options, questions)
                          ? 'bg-blue-300'
                          : 'bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>

                {isLastQuestion ? (
                  <Button onClick={handlePreviewSubmit} className="flex items-center gap-2 px-5 bg-green-600 hover:bg-green-700 text-white font-semibold">
                    <Send className="w-4 h-4" /> Absenden
                  </Button>
                ) : (
                  <Button onClick={goNext} className="flex items-center gap-2 px-5 bg-blue-600 hover:bg-blue-700">
                    Weiter <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {isLastQuestion && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  Alle Antworten werden erst beim Klick auf <strong>„Absenden"</strong> gespeichert.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SurveyPreview;

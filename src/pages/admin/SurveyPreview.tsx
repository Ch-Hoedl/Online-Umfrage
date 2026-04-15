import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  BarChart3, MessageSquare, ChevronLeft, ChevronRight,
  Send, Eye, ArrowLeft, CheckCircle2,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────

const META_PREFIX = '__dyad_meta__:';
function isMetaOption(t: string) { return t.startsWith(META_PREFIX); }
function parseTextMaxAnswers(t: string): number | null {
  if (!isMetaOption(t)) return null;
  try {
    const p = JSON.parse(t.slice(META_PREFIX.length));
    if (p?.kind === 'text' && typeof p?.maxAnswers === 'number') return p.maxAnswers;
  } catch { /* ignore */ }
  return null;
}
function isCommentMetaOption(t: string): boolean {
  if (!isMetaOption(t)) return false;
  try { return JSON.parse(t.slice(META_PREFIX.length))?.kind === 'comment'; }
  catch { return false; }
}
function normalizeTextTerm(v: string) { return v.trim().replace(/\s+/g, ' '); }

// ── component ─────────────────────────────────────────────────────────────────

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
      // Load without is_active filter so admins can preview draft copies too
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

  // ── question helpers ──────────────────────────────────────────────────────────

  const getTextMaxAnswers = (qid: string) => {
    const meta = (options[qid] || []).find((o) => parseTextMaxAnswers(o.option_text) !== null);
    const parsed = meta ? parseTextMaxAnswers(meta.option_text) : null;
    if (parsed && parsed >= 1) return parsed;
    const q = questions.find((q) => q.id === qid);
    return q?.max_text_answers ?? 1;
  };
  const hasCommentOption = (qid: string) => (options[qid] || []).some((o) => isCommentMetaOption(o.option_text));
  const isTextQuestion = (qid: string) => {
    const q = questions.find((q) => q.id === qid);
    if (q?.question_type === 'text') return true;
    return (options[qid] || []).some((o) => parseTextMaxAnswers(o.option_text) !== null);
  };
  const isLongTextQuestion = (qid: string) => {
    const q = questions.find((q) => q.id === qid);
    return q?.question_type === 'longtext';
  };
  const getVisibleOptions = (qid: string) => (options[qid] || []).filter((o) => !isMetaOption(o.option_text));

  // ── answer handlers ───────────────────────────────────────────────────────────

  const handleSingleChoice = (qid: string, optionId: string) =>
    setAnswers((prev) => ({ ...prev, [qid]: [optionId] }));

  const handleMultipleChoice = (qid: string, optionId: string, checked: boolean) =>
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: checked ? [...cur, optionId] : cur.filter((id) => id !== optionId) };
    });

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

  // ── "submit" in preview mode ──────────────────────────────────────────────────

  const handlePreviewSubmit = () => {
    // Validate all questions (same as real survey)
    for (const question of questions) {
      if (isTextQuestion(question.id)) {
        const terms = (answers[question.id] || []).map(normalizeTextTerm).filter(Boolean);
        if (terms.length === 0) {
          toast.error('Bitte beantworten Sie alle Fragen');
          setCurrentIndex(questions.indexOf(question));
          return;
        }
        continue;
      }
      if (isLongTextQuestion(question.id)) {
        const text = (answers[question.id]?.[0] || '').trim();
        if (text.length === 0) {
          toast.error('Bitte beantworten Sie alle Fragen');
          setCurrentIndex(questions.indexOf(question));
          return;
        }
        continue;
      }
      if (!answers[question.id] || answers[question.id].length === 0) {
        toast.error('Bitte beantworten Sie alle Fragen');
        setCurrentIndex(questions.indexOf(question));
        return;
      }
    }
    // No DB write – just show the thank-you screen
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

  // Preview thank-you screen
  if (previewSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        {/* Preview banner */}
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

      {/* Preview banner */}
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

          {/* Survey header */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-md">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{survey.title}</h1>
            {survey.description && <p className="text-gray-600">{survey.description}</p>}
          </div>

          {totalQuestions > 0 && (
            <>
              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-600">
                    Frage <span className="text-blue-600 font-bold">{currentIndex + 1}</span> von <span className="font-bold">{totalQuestions}</span>
                  </span>
                  <span className="text-sm text-gray-500">{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2.5 rounded-full" />
              </div>

              {/* Question card */}
              {currentQuestion && (() => {
                const qid = currentQuestion.id;
                const visibleOptions = getVisibleOptions(qid);
                const textQuestion = isTextQuestion(qid);
                const longTextQuestion = isLongTextQuestion(qid);
                const textMax = textQuestion ? getTextMaxAnswers(qid) : 0;

                return (
                  <Card className="shadow-md">
                    <CardHeader className="pb-4">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
                          {currentIndex + 1}
                        </span>
                        <div>
                          <CardTitle className="text-xl leading-snug">{currentQuestion.question_text}</CardTitle>
                          <CardDescription className="mt-1">
                            {textQuestion && `Geben Sie bis zu ${textMax} Begriff(e) ein`}
                            {longTextQuestion && 'Schreiben Sie Ihre Antwort (bis zu 2048 Zeichen)'}
                            {!textQuestion && !longTextQuestion && currentQuestion.question_type === 'single' && 'Wählen Sie eine Antwort'}
                            {!textQuestion && !longTextQuestion && currentQuestion.question_type === 'multiple' && 'Wählen Sie eine oder mehrere Antworten'}
                            {!textQuestion && !longTextQuestion && currentQuestion.question_type === 'rating' && 'Bewerten Sie von 1 bis 5'}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">

                      {/* Single choice */}
                      {!textQuestion && !longTextQuestion && currentQuestion.question_type === 'single' && (
                        <RadioGroup value={answers[qid]?.[0] || ''} onValueChange={(v) => handleSingleChoice(qid, v)}>
                          <div className="space-y-2">
                            {visibleOptions.map((option) => (
                              <label
                                key={option.id}
                                htmlFor={`prev-${option.id}`}
                                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                                  answers[qid]?.[0] === option.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                }`}
                              >
                                <RadioGroupItem value={option.id} id={`prev-${option.id}`} />
                                <span className="flex-1 text-gray-800">{option.option_text}</span>
                              </label>
                            ))}
                          </div>
                        </RadioGroup>
                      )}

                      {/* Multiple choice */}
                      {!textQuestion && !longTextQuestion && currentQuestion.question_type === 'multiple' && (
                        <div className="space-y-2">
                          {visibleOptions.map((option) => (
                            <label
                              key={option.id}
                              htmlFor={`prev-${option.id}`}
                              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                                answers[qid]?.includes(option.id)
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                              }`}
                            >
                              <Checkbox
                                id={`prev-${option.id}`}
                                checked={answers[qid]?.includes(option.id) || false}
                                onCheckedChange={(checked) => handleMultipleChoice(qid, option.id, checked as boolean)}
                              />
                              <span className="flex-1 text-gray-800">{option.option_text}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Rating */}
                      {!textQuestion && !longTextQuestion && currentQuestion.question_type === 'rating' && (
                        <RadioGroup value={answers[qid]?.[0] || ''} onValueChange={(v) => handleSingleChoice(qid, v)}>
                          <div className="flex gap-3 justify-center flex-wrap">
                            {visibleOptions.map((option) => (
                              <label
                                key={option.id}
                                htmlFor={`prev-${option.id}`}
                                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 cursor-pointer transition-all font-bold text-lg ${
                                  answers[qid]?.[0] === option.id
                                    ? 'border-blue-500 bg-blue-600 text-white shadow-md'
                                    : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                                }`}
                              >
                                <RadioGroupItem value={option.id} id={`prev-${option.id}`} className="sr-only" />
                                {option.option_text}
                              </label>
                            ))}
                          </div>
                        </RadioGroup>
                      )}

                      {/* Text / word cloud */}
                      {textQuestion && (
                        <div className="space-y-3">
                          {Array.from({ length: textMax }).map((_, idx) => (
                            <div key={idx} className="space-y-1">
                              {textMax > 1 && <Label>Antwort {idx + 1}</Label>}
                              <Input
                                value={answers[qid]?.[idx] || ''}
                                onChange={(e) => handleTextChange(qid, idx, e.target.value)}
                                placeholder="Ihre Antwort…"
                              />
                            </div>
                          ))}
                          <p className="text-xs text-gray-500">Tipp: Kurze Begriffe funktionieren am besten für die Begriffswolke.</p>
                        </div>
                      )}

                      {/* Long text / free text */}
                      {longTextQuestion && (
                        <div className="space-y-2">
                          <Textarea
                            value={answers[qid]?.[0] || ''}
                            onChange={(e) => handleLongTextChange(qid, e.target.value)}
                            placeholder="Schreiben Sie hier Ihre ausführliche Antwort…"
                            maxLength={2048}
                            rows={8}
                            className="resize-none"
                          />
                          <p className="text-xs text-gray-400 text-right">{(answers[qid]?.[0] || '').length}/2048 Zeichen</p>
                        </div>
                      )}

                      {/* Comment field */}
                      {!longTextQuestion && hasCommentOption(qid) && (
                        <div className="mt-5 pt-4 border-t border-gray-100">
                          <Label htmlFor={`comment-${qid}`} className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5">
                            <MessageSquare className="w-4 h-4 text-blue-400" />
                            Persönlicher Kommentar <span className="text-gray-400">(optional)</span>
                          </Label>
                          <textarea
                            id={`comment-${qid}`}
                            value={comments[qid] || ''}
                            onChange={(e) => handleCommentChange(qid, e.target.value)}
                            maxLength={1024}
                            rows={3}
                            placeholder="Ihr persönlicher Kommentar zu dieser Frage…"
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                          />
                          <p className="text-xs text-gray-400 text-right mt-1">{(comments[qid] || '').length}/1024</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Navigation */}
              <div className="mt-6 flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-2 px-5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Zurück
                </Button>

                {/* Dot indicators */}
                <div className="flex-1 flex justify-center gap-1.5 flex-wrap">
                  {questions.map((q, i) => {
                    const answered = isTextQuestion(q.id)
                      ? (answers[q.id] || []).map(normalizeTextTerm).filter(Boolean).length > 0
                      : isLongTextQuestion(q.id)
                      ? (answers[q.id]?.[0] || '').trim().length > 0
                      : (answers[q.id] || []).length > 0;
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentIndex(i)}
                        title={`Frage ${i + 1}`}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${
                          i === currentIndex
                            ? 'bg-blue-600 scale-125'
                            : answered
                            ? 'bg-blue-300'
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                      />
                    );
                  })}
                </div>

                {isLastQuestion ? (
                  <Button
                    onClick={handlePreviewSubmit}
                    className="flex items-center gap-2 px-5 bg-green-600 hover:bg-green-700 text-white font-semibold"
                  >
                    <Send className="w-4 h-4" />
                    Absenden
                  </Button>
                ) : (
                  <Button onClick={goNext} className="flex items-center gap-2 px-5 bg-blue-600 hover:bg-blue-700">
                    Weiter
                    <ChevronRight className="w-4 h-4" />
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
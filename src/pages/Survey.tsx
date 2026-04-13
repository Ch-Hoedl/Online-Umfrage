import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle2, BarChart3, MessageSquare, ChevronLeft, ChevronRight, Send } from 'lucide-react';

// ── constants & helpers ───────────────────────────────────────────────────────

const DEVICE_ID_STORAGE_KEY = 'survey_device_id_v1';
const VOTED_SURVEY_PREFIX = 'survey_voted_v1:';
const META_PREFIX = '__dyad_meta__:';
const SURVEY_META_PREFIXES = ['__dyad_meta__:', '__dyad_survey_meta__:'];

function stripMetaFromDescription(desc: string | null | undefined): string {
  if (!desc) return '';
  // Remove any line that starts with a known meta prefix
  return desc
    .split('\n')
    .filter((line) => !SURVEY_META_PREFIXES.some((p) => line.trim().startsWith(p)))
    .join('\n')
    .trim();
}

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

function getDeviceId() {
  const e = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (e) return e;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}
function hasVotedLocally(sid: string) { return localStorage.getItem(`${VOTED_SURVEY_PREFIX}${sid}`) === '1'; }
function markVotedLocally(sid: string) { localStorage.setItem(`${VOTED_SURVEY_PREFIX}${sid}`, '1'); }
function normalizeTextTerm(v: string) { return v.trim().replace(/\s+/g, ' '); }

// ── component ─────────────────────────────────────────────────────────────────

const SurveyPage = () => {
  const { id } = useParams();

  // data
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<{ [qid: string]: Option[] }>({});

  // answers (stored locally until submit)
  const [answers, setAnswers] = useState<{ [qid: string]: string[] }>({});
  const [comments, setComments] = useState<{ [qid: string]: string }>({});

  // navigation
  const [currentIndex, setCurrentIndex] = useState(0);

  // status
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [expired, setExpired] = useState(false);

  const canVote = useMemo(
    () => !submitting && !submitted && !alreadyVoted && !limitReached && !expired,
    [alreadyVoted, expired, limitReached, submitted, submitting],
  );

  useEffect(() => { loadSurvey(); }, [id]);

  // ── data loading ─────────────────────────────────────────────────────────────

  const loadSurvey = async () => {
    setLoading(true);
    try {
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys').select('*').eq('id', id).eq('is_active', true).single();
      if (surveyError) throw surveyError;

      const expiresAt = surveyData.expires_at ?? null;
      const maxVotes = surveyData.max_votes ?? null;
      setSurvey({ ...surveyData, description: stripMetaFromDescription(surveyData.description), expires_at: expiresAt, max_votes: maxVotes });

      setExpired(!!expiresAt && new Date(expiresAt).getTime() <= Date.now());
      setAlreadyVoted(hasVotedLocally(surveyData.id));

      const { data: questionsData, error: qErr } = await supabase
        .from('questions').select('*').eq('survey_id', id).order('order_index');
      if (qErr) throw qErr;
      const loadedQuestions = questionsData || [];
      setQuestions(loadedQuestions);

      const questionIds = loadedQuestions.map((q) => q.id);

      if (questionIds.length > 0) {
        const { data: respData } = await supabase
          .from('responses').select('participant_id').in('question_id', questionIds);
        const participants = new Set((respData || []).map((r) => r.participant_id));
        setParticipantCount(participants.size);
        const deviceId = getDeviceId();
        if (participants.has(deviceId)) { setAlreadyVoted(true); markVotedLocally(surveyData.id); }
        setLimitReached(!!maxVotes && participants.size >= maxVotes);

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
    } catch { toast.error('Umfrage nicht gefunden oder nicht aktiv'); }
    finally { setLoading(false); }
  };

  // ── question helpers ──────────────────────────────────────────────────────────

  const getTextMaxAnswers = (qid: string): number => {
    // First try meta-option approach (legacy)
    const metaOpt = (options[qid] || []).find((o) => parseTextMaxAnswers(o.option_text) !== null);
    if (metaOpt) {
      const parsed = parseTextMaxAnswers(metaOpt.option_text);
      if (parsed && parsed >= 1) return parsed;
    }
    // Fall back to question's max_text_answers column
    const q = questions.find((q) => q.id === qid);
    return q?.max_text_answers ?? 1;
  };

  const hasCommentOption = (qid: string) => (options[qid] || []).some((o) => isCommentMetaOption(o.option_text));

  const isTextQuestion = (qid: string) => {
    const q = questions.find((q) => q.id === qid);
    if (q?.question_type === 'text') return true;
    return (options[qid] || []).some((o) => parseTextMaxAnswers(o.option_text) !== null);
  };

  const getVisibleOptions = (qid: string) => (options[qid] || []).filter((o) => !isMetaOption(o.option_text));

  // ── answer handlers ───────────────────────────────────────────────────────────

  const handleSingleChoice = (qid: string, optionId: string) => {
    if (!canVote) return;
    setAnswers((prev) => ({ ...prev, [qid]: [optionId] }));
  };
  const handleMultipleChoice = (qid: string, optionId: string, checked: boolean) => {
    if (!canVote) return;
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: checked ? [...cur, optionId] : cur.filter((id) => id !== optionId) };
    });
  };
  const handleTextChange = (qid: string, index: number, value: string) => {
    if (!canVote) return;
    setAnswers((prev) => {
      const next = (prev[qid] || []).slice();
      while (next.length <= index) next.push('');
      next[index] = value;
      return { ...prev, [qid]: next };
    });
  };
  const handleCommentChange = (qid: string, value: string) => {
    if (!canVote) return;
    setComments((prev) => ({ ...prev, [qid]: value }));
  };

  // ── navigation ────────────────────────────────────────────────────────────────

  const isCurrentAnswered = () => {
    if (!questions[currentIndex]) return false;
    const q = questions[currentIndex];
    if (isTextQuestion(q.id)) {
      const terms = (answers[q.id] || []).map(normalizeTextTerm).filter(Boolean);
      return terms.length > 0;
    }
    return (answers[q.id] || []).length > 0;
  };

  const goNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  // ── submit ────────────────────────────────────────────────────────────────────

  const getOrCreateTextOptionId = async (qid: string, term: string) => {
    const normalized = normalizeTextTerm(term);
    if (!normalized) throw new Error('empty term');
    const existingInState = getVisibleOptions(qid).find((o) => o.option_text.toLowerCase() === normalized.toLowerCase());
    if (existingInState) return existingInState.id;
    const { data: existing } = await supabase.from('options').select('*').eq('question_id', qid).ilike('option_text', normalized).maybeSingle();
    if (existing) return (existing as Option).id;
    const { data: created, error } = await supabase.from('options').insert({ question_id: qid, option_text: normalized, order_index: 0 }).select('*').single();
    if (error) throw error;
    return (created as Option).id;
  };

  const handleSubmit = async () => {
    if (!survey) return;
    if (expired) { toast.error('Diese Umfrage ist abgelaufen'); return; }
    if (limitReached) { toast.error('Das Stimmen-Limit wurde erreicht'); return; }
    if (alreadyVoted || hasVotedLocally(survey.id)) { toast.error('Sie haben bereits teilgenommen'); return; }

    // Validate all questions
    for (const question of questions) {
      if (isTextQuestion(question.id)) {
        const terms = (answers[question.id] || []).map(normalizeTextTerm).filter(Boolean);
        if (terms.length === 0) { toast.error('Bitte beantworten Sie alle Fragen'); setCurrentIndex(questions.indexOf(question)); return; }
        continue;
      }
      if (!answers[question.id] || answers[question.id].length === 0) {
        toast.error('Bitte beantworten Sie alle Fragen');
        setCurrentIndex(questions.indexOf(question));
        return;
      }
    }

    setSubmitting(true);
    try {
      const participantId = getDeviceId();
      const questionIds = questions.map((q) => q.id);

      // Re-check before insert
      if (questionIds.length > 0) {
        const { data: respData } = await supabase.from('responses').select('participant_id').in('question_id', questionIds);
        const participants = new Set((respData || []).map((r) => r.participant_id));
        if (participants.has(participantId)) { setAlreadyVoted(true); markVotedLocally(survey.id); toast.error('Sie haben bereits teilgenommen'); return; }
        if (survey.max_votes && participants.size >= survey.max_votes) { setLimitReached(true); toast.error('Das Stimmen-Limit wurde erreicht'); return; }
      }

      for (const question of questions) {
        if (isTextQuestion(question.id)) {
          const max = getTextMaxAnswers(question.id);
          const terms = (answers[question.id] || []).slice(0, max).map(normalizeTextTerm).filter(Boolean);
          for (const term of terms) {
            const optionId = await getOrCreateTextOptionId(question.id, term);
            const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: optionId, participant_id: participantId });
            if (error) throw error;
          }
        } else {
          for (const optionId of (answers[question.id] || [])) {
            const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: optionId, participant_id: participantId });
            if (error) throw error;
          }
        }

        // Save comment if present
        const comment = comments[question.id]?.trim();
        if (comment && hasCommentOption(question.id)) {
          const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: null, participant_id: participantId, text_response: comment.slice(0, 1024) });
          if (error) throw error;
        }
      }

      markVotedLocally(survey.id);
      setSubmitted(true);
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Absenden der Antworten');
    } finally {
      setSubmitting(false);
    }
  };

  // ── render states ─────────────────────────────────────────────────────────────

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
            <p className="text-gray-600">Diese Umfrage existiert nicht oder ist nicht mehr aktiv.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Thank-you screen
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Vielen Dank!</h2>
          <p className="text-lg text-gray-600 mb-2">Ihre Antworten wurden erfolgreich gespeichert.</p>
          <p className="text-gray-500">Wir schätzen Ihre Teilnahme und Ihr wertvolles Feedback sehr.</p>
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-400">Sie können dieses Fenster nun schließen.</p>
          </div>
        </div>
      </div>
    );
  }

  const showClosedBanner = expired || limitReached || alreadyVoted;
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const progressPercent = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const currentQuestion = questions[currentIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">

        {/* Survey header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-md">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{survey.title}</h1>
          {survey.description && <p className="text-gray-600">{survey.description}</p>}
        </div>

        {/* Closed banner */}
        {showClosedBanner && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-4 pb-4">
              {alreadyVoted && <p className="text-amber-900 font-medium">Sie haben bereits an dieser Umfrage teilgenommen.</p>}
              {expired && <p className="text-amber-900 font-medium">Diese Umfrage ist abgelaufen und kann nicht mehr beantwortet werden.</p>}
              {limitReached && <p className="text-amber-900 font-medium">Das Stimmen-Limit wurde erreicht.</p>}
            </CardContent>
          </Card>
        )}

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
              const textMax = textQuestion ? getTextMaxAnswers(qid) : 0;

              return (
                <Card className={`shadow-md transition-all ${!canVote ? 'opacity-75' : ''}`}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
                        {currentIndex + 1}
                      </span>
                      <div>
                        <CardTitle className="text-xl leading-snug">{currentQuestion.question_text}</CardTitle>
                        <CardDescription className="mt-1">
                          {textQuestion && `Geben Sie bis zu ${textMax} Begriff(e) ein`}
                          {!textQuestion && currentQuestion.question_type === 'single' && 'Wählen Sie eine Antwort'}
                          {!textQuestion && currentQuestion.question_type === 'multiple' && 'Wählen Sie eine oder mehrere Antworten'}
                          {!textQuestion && currentQuestion.question_type === 'rating' && 'Bewerten Sie von 1 bis 5'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">

                    {/* Single choice */}
                    {!textQuestion && currentQuestion.question_type === 'single' && (
                      <RadioGroup value={answers[qid]?.[0] || ''} onValueChange={(v) => handleSingleChoice(qid, v)}>
                        <div className="space-y-2">
                          {visibleOptions.map((option) => (
                            <label
                              key={option.id}
                              htmlFor={option.id}
                              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                                answers[qid]?.[0] === option.id
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                              } ${!canVote ? 'cursor-default' : ''}`}
                            >
                              <RadioGroupItem value={option.id} id={option.id} disabled={!canVote} />
                              <span className="flex-1 text-gray-800">{option.option_text}</span>
                            </label>
                          ))}
                        </div>
                      </RadioGroup>
                    )}

                    {/* Multiple choice */}
                    {!textQuestion && currentQuestion.question_type === 'multiple' && (
                      <div className="space-y-2">
                        {visibleOptions.map((option) => (
                          <label
                            key={option.id}
                            htmlFor={option.id}
                            className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                              answers[qid]?.includes(option.id)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            } ${!canVote ? 'cursor-default' : ''}`}
                          >
                            <Checkbox
                              id={option.id}
                              disabled={!canVote}
                              checked={answers[qid]?.includes(option.id) || false}
                              onCheckedChange={(checked) => handleMultipleChoice(qid, option.id, checked as boolean)}
                            />
                            <span className="flex-1 text-gray-800">{option.option_text}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Rating */}
                    {!textQuestion && currentQuestion.question_type === 'rating' && (
                      <RadioGroup value={answers[qid]?.[0] || ''} onValueChange={(v) => handleSingleChoice(qid, v)}>
                        <div className="flex gap-3 justify-center flex-wrap">
                          {visibleOptions.map((option) => (
                            <label
                              key={option.id}
                              htmlFor={option.id}
                              className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 cursor-pointer transition-all font-bold text-lg ${
                                answers[qid]?.[0] === option.id
                                  ? 'border-blue-500 bg-blue-600 text-white shadow-md'
                                  : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                              } ${!canVote ? 'cursor-default' : ''}`}
                            >
                              <RadioGroupItem value={option.id} id={option.id} disabled={!canVote} className="sr-only" />
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
                              disabled={!canVote}
                            />
                          </div>
                        ))}
                        <p className="text-xs text-gray-500">Tipp: Kurze Begriffe funktionieren am besten für die Begriffswolke.</p>
                      </div>
                    )}

                    {/* Comment field */}
                    {hasCommentOption(qid) && (
                      <div className="mt-5 pt-4 border-t border-gray-100">
                        <Label htmlFor={`comment-${qid}`} className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5">
                          <MessageSquare className="w-4 h-4 text-blue-400" />
                          Persönlicher Kommentar <span className="text-gray-400">(optional)</span>
                        </Label>
                        <textarea
                          id={`comment-${qid}`}
                          value={comments[qid] || ''}
                          onChange={(e) => handleCommentChange(qid, e.target.value)}
                          disabled={!canVote}
                          maxLength={1024}
                          rows={3}
                          placeholder="Ihr persönlicher Kommentar zu dieser Frage…"
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none disabled:opacity-50"
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
                  onClick={handleSubmit}
                  disabled={!canVote || submitting}
                  className="flex items-center gap-2 px-5 bg-green-600 hover:bg-green-700 text-white font-semibold"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Wird gesendet…' : 'Absenden'}
                </Button>
              ) : (
                <Button
                  onClick={goNext}
                  className="flex items-center gap-2 px-5 bg-blue-600 hover:bg-blue-700"
                >
                  Weiter
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Submit hint on last question */}
            {isLastQuestion && canVote && (
              <p className="text-center text-sm text-gray-500 mt-4">
                Alle Antworten werden erst beim Klick auf <strong>„Absenden"</strong> gespeichert.
              </p>
            )}

            {/* Participant count */}
            {typeof survey.max_votes === 'number' && (
              <p className="text-center text-xs text-gray-400 mt-3">
                Teilnehmer: {participantCount}/{survey.max_votes}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SurveyPage;

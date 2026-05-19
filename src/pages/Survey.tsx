import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle2, BarChart3, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
import {
  stripMetaFromDescription,
  normalizeTextTerm,
  getDeviceId,
  hasVotedLocally,
  markVotedLocally,
  isTextQuestion as isTextQ,
  isLongTextQuestion as isLongTextQ,
  isMultiRatingQuestion as isMultiRatingQ,
  getTextMaxAnswers as getTextMax,
  getVisibleOptions as getVisOpts,
  hasCommentOption as hasComment,
  isQuestionAnswered,
} from '@/lib/surveyHelpers';

const SurveyPage = () => {
  const { id } = useParams();

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<{ [qid: string]: Option[] }>({});
  const [answers, setAnswers] = useState<{ [qid: string]: string[] }>({});
  const [comments, setComments] = useState<{ [qid: string]: string }>({});
  const [currentIndex, setCurrentIndex] = useState(0);
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
  const handleLongTextChange = (qid: string, value: string) => {
    if (!canVote) return;
    setAnswers((prev) => ({ ...prev, [qid]: [value] }));
  };
  const handleCommentChange = (qid: string, value: string) => {
    if (!canVote) return;
    setComments((prev) => ({ ...prev, [qid]: value }));
  };
  const handleMultiRatingChange = (qid: string, optionId: string, rating: string) => {
    if (!canVote) return;
    setAnswers((prev) => {
      const cur = (prev[qid] || []).filter((v) => !v.startsWith(`${optionId}:`));
      return { ...prev, [qid]: [...cur, `${optionId}:${rating}`] };
    });
  };

  // ── navigation ────────────────────────────────────────────────────────────────

  const goNext = () => { if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1); };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); };

  // ── submit ────────────────────────────────────────────────────────────────────

  const getOrCreateTextOptionId = async (qid: string, term: string) => {
    const normalized = normalizeTextTerm(term);
    if (!normalized) throw new Error('empty term');
    const existingInState = getVisOpts(qid, options).find((o) => o.option_text.toLowerCase() === normalized.toLowerCase());
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

    setSubmitting(true);
    try {
      const participantId = getDeviceId();
      const questionIds = questions.map((q) => q.id);

      if (questionIds.length > 0) {
        const { data: respData } = await supabase.from('responses').select('participant_id').in('question_id', questionIds);
        const participants = new Set((respData || []).map((r) => r.participant_id));
        if (participants.has(participantId)) { setAlreadyVoted(true); markVotedLocally(survey.id); toast.error('Sie haben bereits teilgenommen'); return; }
        if (survey.max_votes && participants.size >= survey.max_votes) { setLimitReached(true); toast.error('Das Stimmen-Limit wurde erreicht'); return; }
      }

      for (const question of questions) {
        if (isTextQ(question.id, options, questions)) {
          const max = getTextMax(question.id, options, questions);
          const terms = (answers[question.id] || []).slice(0, max).map(normalizeTextTerm).filter(Boolean);
          for (const term of terms) {
            const optionId = await getOrCreateTextOptionId(question.id, term);
            const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: optionId, participant_id: participantId });
            if (error) throw error;
          }
        } else if (isLongTextQ(question.id, questions)) {
          const text = (answers[question.id]?.[0] || '').trim().slice(0, 2048);
          if (text) {
            const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: null, participant_id: participantId, text_response: text });
            if (error) throw error;
          }
        } else if (isMultiRatingQ(question.id, questions)) {
          const pairs = (answers[question.id] || []).filter((v) => v.includes(':'));
          for (const pair of pairs) {
            const [optionId, rating] = pair.split(':');
            const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: optionId, participant_id: participantId, text_response: rating });
            if (error) throw error;
          }
        } else {
          for (const optionId of (answers[question.id] || [])) {
            const { error } = await supabase.from('responses').insert({ question_id: question.id, option_id: optionId, participant_id: participantId });
            if (error) throw error;
          }
        }

        const comment = comments[question.id]?.trim();
        if (comment && hasComment(question.id, options)) {
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
            <p className="text-gray-600">Diese Umfrage existiert nicht oder ist nicht mehr aktiv.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-md">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{survey.title}</h1>
          {survey.description && <p className="text-gray-600">{survey.description}</p>}
        </div>

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
                disabled={!canVote}
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
                <Button onClick={handleSubmit} disabled={!canVote || submitting} className="flex items-center gap-2 px-5 bg-green-600 hover:bg-green-700 text-white font-semibold">
                  <Send className="w-4 h-4" />
                  {submitting ? 'Wird gesendet…' : 'Absenden'}
                </Button>
              ) : (
                <Button onClick={goNext} className="flex items-center gap-2 px-5 bg-blue-600 hover:bg-blue-700">
                  Weiter <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>

            {isLastQuestion && canVote && (
              <p className="text-center text-sm text-gray-500 mt-4">
                Alle Antworten werden erst beim Klick auf <strong>„Absenden"</strong> gespeichert.
              </p>
            )}

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

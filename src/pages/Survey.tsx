import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, BarChart3 } from 'lucide-react';
import QuestionRenderer from '@/components/QuestionRenderer';
import { SurveyNavigation, SurveyNavigationControls } from '@/components/SurveyNavigation';
import { useSurveyAnswers } from '@/hooks/useSurveyAnswers';
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

  const {
    answers, comments,
    handleSingleChoice, handleMultipleChoice, handleTextChange,
    handleLongTextChange, handleCommentChange, handleMultiRatingChange,
  } = useSurveyAnswers(!canVote);

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

      const responseRows: { question_id: string; option_id: string | null; participant_id: string; text_response?: string }[] = [];

      for (const question of questions) {
        if (isTextQ(question.id, options, questions)) {
          const max = getTextMax(question.id, options, questions);
          const terms = (answers[question.id] || []).slice(0, max).map(normalizeTextTerm).filter(Boolean);
          for (const term of terms) {
            const optionId = await getOrCreateTextOptionId(question.id, term);
            responseRows.push({ question_id: question.id, option_id: optionId, participant_id: participantId });
          }
        } else if (isLongTextQ(question.id, questions)) {
          const text = (answers[question.id]?.[0] || '').trim().slice(0, 2048);
          if (text) {
            responseRows.push({ question_id: question.id, option_id: null, participant_id: participantId, text_response: text });
          }
        } else if (isMultiRatingQ(question.id, questions)) {
          const pairs = (answers[question.id] || []).filter((v) => v.includes(':'));
          for (const pair of pairs) {
            const [optionId, rating] = pair.split(':');
            responseRows.push({ question_id: question.id, option_id: optionId, participant_id: participantId, text_response: rating });
          }
        } else {
          for (const optionId of (answers[question.id] || [])) {
            responseRows.push({ question_id: question.id, option_id: optionId, participant_id: participantId });
          }
        }

        const comment = comments[question.id]?.trim();
        if (comment && hasComment(question.id, options)) {
          responseRows.push({ question_id: question.id, option_id: null, participant_id: participantId, text_response: comment.slice(0, 1024) });
        }
      }

      if (responseRows.length > 0) {
        const { error } = await supabase.from('responses').insert(responseRows);
        if (error) throw error;
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

        {questions.length > 0 && (
          <>
            <SurveyNavigation
              questions={questions} currentIndex={currentIndex} answers={answers}
              options={options} onNavigate={setCurrentIndex} onPrev={goPrev}
              onNext={goNext} onSubmit={handleSubmit} submitLabel="Absenden"
              submitDisabled={!canVote} submitting={submitting}
            />

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

            <SurveyNavigationControls
              questions={questions} currentIndex={currentIndex} answers={answers}
              options={options} onNavigate={setCurrentIndex} onPrev={goPrev}
              onNext={goNext} onSubmit={handleSubmit} submitLabel="Absenden"
              submitDisabled={!canVote} submitting={submitting}
              showSubmitHint={canVote}
            />

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

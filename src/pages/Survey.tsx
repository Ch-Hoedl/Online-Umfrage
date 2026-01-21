import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Survey, Question, Option } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CheckCircle2, BarChart3 } from 'lucide-react';
import { decodeDescriptionWithMeta } from '@/utils/surveyMeta';

const DEVICE_ID_STORAGE_KEY = 'survey_device_id_v1';
const VOTED_SURVEY_PREFIX = 'survey_voted_v1:';

const META_PREFIX = '__dyad_meta__:';

function isMetaOption(optionText: string) {
  return optionText.startsWith(META_PREFIX);
}

function parseTextMaxAnswers(optionText: string): number | null {
  if (!isMetaOption(optionText)) return null;
  try {
    const raw = optionText.slice(META_PREFIX.length);
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'text' && typeof parsed?.maxAnswers === 'number') {
      return parsed.maxAnswers;
    }
  } catch {
    // ignore
  }
  return null;
}

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
}

function hasVotedLocally(surveyId: string) {
  return localStorage.getItem(`${VOTED_SURVEY_PREFIX}${surveyId}`) === '1';
}

function markVotedLocally(surveyId: string) {
  localStorage.setItem(`${VOTED_SURVEY_PREFIX}${surveyId}`, '1');
}

function normalizeTextTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

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

  const [participantCount, setParticipantCount] = useState(0);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [expired, setExpired] = useState(false);

  const canVote = useMemo(() => {
    return !submitting && !submitted && !alreadyVoted && !limitReached && !expired;
  }, [alreadyVoted, expired, limitReached, submitted, submitting]);

  useEffect(() => {
    loadSurvey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadSurvey = async () => {
    setLoading(true);

    try {
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (surveyError) throw surveyError;

      // expires_at/max_votes liegen in dieser App in der description als Meta
      const decoded = decodeDescriptionWithMeta(surveyData.description);
      const expiresAt = surveyData.expires_at ?? decoded.meta.expires_at ?? null;
      const maxVotes = surveyData.max_votes ?? decoded.meta.max_votes ?? null;

      const normalizedSurvey: Survey = {
        ...surveyData,
        description: decoded.description,
        expires_at: expiresAt,
        max_votes: maxVotes,
      };

      setSurvey(normalizedSurvey);

      const isExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
      setExpired(isExpired);

      // Schnell-Check: wenn wir lokal schon markiert haben, direkt sperren.
      setAlreadyVoted(hasVotedLocally(normalizedSurvey.id));

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', id)
        .order('order_index');

      if (questionsError) throw questionsError;
      const loadedQuestions = questionsData || [];
      setQuestions(loadedQuestions);

      const questionIds = loadedQuestions.map((q) => q.id);

      // Antworten-Statistik: Limit prüfen + Geräte-Duplikate verhindern
      if (questionIds.length > 0) {
        const { data: respData, error: respError } = await supabase
          .from('responses')
          .select('participant_id')
          .in('question_id', questionIds);

        if (respError) throw respError;

        const participants = new Set((respData || []).map((r) => r.participant_id));
        setParticipantCount(participants.size);

        const deviceId = getDeviceId();
        // Server-seitig prüfen (zusätzlich zur lokalen Sperre)
        if (participants.has(deviceId)) {
          setAlreadyVoted(true);
          markVotedLocally(normalizedSurvey.id);
        }

        setLimitReached(!!maxVotes && participants.size >= maxVotes);
      } else {
        setParticipantCount(0);
        setLimitReached(false);
      }

      const { data: optionsData, error: optionsError } = await supabase
        .from('options')
        .select('*')
        .in('question_id', questionIds);

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
      console.error('Load survey error:', error);
      toast.error('Umfrage nicht gefunden oder nicht aktiv');
    } finally {
      setLoading(false);
    }
  };

  const getTextMaxAnswers = (questionId: string) => {
    const meta = (options[questionId] || []).find((o) => parseTextMaxAnswers(o.option_text) !== null);
    const parsed = meta ? parseTextMaxAnswers(meta.option_text) : null;
    return parsed && parsed >= 1 ? parsed : 1;
  };

  const isTextQuestion = (questionId: string) => {
    return (options[questionId] || []).some((o) => parseTextMaxAnswers(o.option_text) !== null);
  };

  const getVisibleOptions = (questionId: string) => {
    return (options[questionId] || []).filter((o) => !isMetaOption(o.option_text));
  };

  const handleSingleChoice = (questionId: string, optionId: string) => {
    if (!canVote) return;
    setAnswers({ ...answers, [questionId]: [optionId] });
  };

  const handleMultipleChoice = (questionId: string, optionId: string, checked: boolean) => {
    if (!canVote) return;
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

  const handleTextChange = (questionId: string, index: number, value: string) => {
    if (!canVote) return;
    const current = answers[questionId] || [];
    const next = current.slice();
    while (next.length <= index) next.push('');
    next[index] = value;
    setAnswers({ ...answers, [questionId]: next });
  };

  const getOrCreateTextOptionId = async (questionId: string, term: string) => {
    const normalized = normalizeTextTerm(term);
    if (!normalized) throw new Error('empty term');

    console.log('[Survey] Creating/finding option for term:', normalized, 'question:', questionId);

    // 1) In bereits geladenen Optionen suchen
    const existingInState = getVisibleOptions(questionId).find(
      (o) => o.option_text.toLowerCase() === normalized.toLowerCase()
    );
    if (existingInState) {
      console.log('[Survey] Found existing option in state:', existingInState.id);
      return existingInState.id;
    }

    // 2) Server-seitig prüfen (falls zwischenzeitlich angelegt)
    const { data: existing, error: existingError } = await supabase
      .from('options')
      .select('*')
      .eq('question_id', questionId)
      .ilike('option_text', normalized)
      .maybeSingle();

    if (existingError) {
      console.error('[Survey] Error checking existing option:', existingError);
      throw existingError;
    }
    
    if (existing) {
      console.log('[Survey] Found existing option on server:', existing.id);
      return (existing as Option).id;
    }

    // 3) Neu anlegen
    console.log('[Survey] Creating new option...');
    const { data: created, error: createError } = await supabase
      .from('options')
      .insert({
        question_id: questionId,
        option_text: normalized,
        order_index: 0,
      })
      .select('*')
      .single();

    if (createError) {
      console.error('[Survey] Error creating option:', createError);
      throw createError;
    }
    
    console.log('[Survey] Created new option:', created.id);
    return (created as Option).id;
  };

  const handleSubmit = async () => {
    if (!survey) {
      console.error('[Survey] No survey loaded');
      return;
    }

    console.log('[Survey] Starting submit...');

    if (expired) {
      toast.error('Diese Umfrage ist abgelaufen');
      return;
    }
    if (limitReached) {
      toast.error('Das Stimmen-Limit wurde erreicht');
      return;
    }
    if (alreadyVoted || hasVotedLocally(survey.id)) {
      toast.error('Sie haben bereits an dieser Umfrage teilgenommen');
      return;
    }

    // Validierung
    console.log('[Survey] Validating answers...');
    for (const question of questions) {
      if (isTextQuestion(question.id)) {
        const max = getTextMaxAnswers(question.id);
        const terms = (answers[question.id] || [])
          .slice(0, max)
          .map(normalizeTextTerm)
          .filter(Boolean);
        if (terms.length === 0) {
          console.error('[Survey] Text question not answered:', question.id);
          toast.error('Bitte beantworten Sie alle Fragen');
          return;
        }
        continue;
      }

      if (!answers[question.id] || answers[question.id].length === 0) {
        console.error('[Survey] Question not answered:', question.id);
        toast.error('Bitte beantworten Sie alle Fragen');
        return;
      }
    }

    setSubmitting(true);

    try {
      const participantId = getDeviceId();
      console.log('[Survey] Participant ID:', participantId);

      // Re-Check kurz vor dem Insert (reduziert Doppel-Abstimmungen bei mehreren Tabs)
      const questionIds = questions.map((q) => q.id);
      if (questionIds.length > 0) {
        const { data: respData, error: respError } = await supabase
          .from('responses')
          .select('participant_id')
          .in('question_id', questionIds);

        if (respError) throw respError;

        const participants = new Set((respData || []).map((r) => r.participant_id));
        if (participants.has(participantId)) {
          setAlreadyVoted(true);
          markVotedLocally(survey.id);
          toast.error('Sie haben bereits an dieser Umfrage teilgenommen');
          return;
        }

        const maxVotes = survey.max_votes ?? null;
        if (maxVotes && participants.size >= maxVotes) {
          setLimitReached(true);
          toast.error('Das Stimmen-Limit wurde erreicht');
          return;
        }
      }

      // Antworten speichern
      console.log('[Survey] Saving responses...');
      for (const question of questions) {
        console.log('[Survey] Processing question:', question.id, question.question_text);
        
        if (isTextQuestion(question.id)) {
          const max = getTextMaxAnswers(question.id);
          const terms = (answers[question.id] || [])
            .slice(0, max)
            .map(normalizeTextTerm)
            .filter(Boolean);

          console.log('[Survey] Text question terms:', terms);

          for (const term of terms) {
            try {
              const optionId = await getOrCreateTextOptionId(question.id, term);
              console.log('[Survey] Inserting text response:', { question: question.id, option: optionId, participant: participantId });
              
              const { error } = await supabase.from('responses').insert({
                question_id: question.id,
                option_id: optionId,
                participant_id: participantId,
              });
              
              if (error) {
                console.error('[Survey] Error inserting text response:', error);
                throw error;
              }
            } catch (err) {
              console.error('[Survey] Error processing text term:', term, err);
              throw err;
            }
          }

          continue;
        }

        const selectedOptionIds = answers[question.id] || [];
        console.log('[Survey] Selected options:', selectedOptionIds);
        
        for (const optionId of selectedOptionIds) {
          console.log('[Survey] Inserting response:', { question: question.id, option: optionId, participant: participantId });
          
          const { error } = await supabase.from('responses').insert({
            question_id: question.id,
            option_id: optionId,
            participant_id: participantId,
          });

          if (error) {
            console.error('[Survey] Error inserting response:', error);
            throw error;
          }
        }
      }

      console.log('[Survey] All responses saved successfully');
      markVotedLocally(survey.id);
      setSubmitted(true);
      toast.success('Vielen Dank für Ihre Teilnahme!');
    } catch (error) {
      console.error('[Survey] Submit error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      toast.error(`Fehler beim Absenden: ${errorMessage}`);
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

  const showClosedBanner = expired || limitReached || alreadyVoted;

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

        {showClosedBanner && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              {alreadyVoted && (
                <p className="text-amber-900 font-medium">Sie haben bereits an dieser Umfrage teilgenommen.</p>
              )}
              {expired && (
                <p className="text-amber-900 font-medium">Diese Umfrage ist abgelaufen und kann nicht mehr beantwortet werden.</p>
              )}
              {limitReached && (
                <p className="text-amber-900 font-medium">Das Stimmen-Limit wurde erreicht. Es können keine weiteren Antworten abgegeben werden.</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {questions.map((question, index) => {
            const visibleOptions = getVisibleOptions(question.id);
            const textQuestion = isTextQuestion(question.id);
            const textMax = textQuestion ? getTextMaxAnswers(question.id) : 0;

            return (
              <Card key={question.id} className={!canVote ? 'opacity-75' : ''}>
                <CardHeader>
                  <CardTitle className="text-xl">
                    {index + 1}. {question.question_text}
                  </CardTitle>
                  <CardDescription>
                    {textQuestion && `Geben Sie bis zu ${textMax} Begriff(e) ein`}
                    {!textQuestion && question.question_type === 'single' && 'Wählen Sie eine Antwort'}
                    {!textQuestion && question.question_type === 'multiple' && 'Wählen Sie eine oder mehrere Antworten'}
                    {!textQuestion && question.question_type === 'rating' && 'Bewerten Sie von 1 bis 5'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!textQuestion && question.question_type === 'single' && (
                    <RadioGroup
                      value={answers[question.id]?.[0] || ''}
                      onValueChange={(value) => handleSingleChoice(question.id, value)}
                    >
                      {visibleOptions.map((option) => (
                        <div key={option.id} className="flex items-center space-x-2 mb-3">
                          <RadioGroupItem value={option.id} id={option.id} disabled={!canVote} />
                          <Label htmlFor={option.id} className={canVote ? 'cursor-pointer flex-1' : 'flex-1'}>
                            {option.option_text}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {!textQuestion && question.question_type === 'multiple' && (
                    <div className="space-y-3">
                      {visibleOptions.map((option) => (
                        <div key={option.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={option.id}
                            disabled={!canVote}
                            checked={answers[question.id]?.includes(option.id) || false}
                            onCheckedChange={(checked) =>
                              handleMultipleChoice(question.id, option.id, checked as boolean)
                            }
                          />
                          <Label htmlFor={option.id} className={canVote ? 'cursor-pointer flex-1' : 'flex-1'}>
                            {option.option_text}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}

                  {!textQuestion && question.question_type === 'rating' && (
                    <RadioGroup
                      value={answers[question.id]?.[0] || ''}
                      onValueChange={(value) => handleSingleChoice(question.id, value)}
                    >
                      <div className="flex gap-4 justify-center">
                        {visibleOptions.map((option) => (
                          <div key={option.id} className="flex flex-col items-center">
                            <RadioGroupItem
                              value={option.id}
                              id={option.id}
                              className="mb-2"
                              disabled={!canVote}
                            />
                            <Label htmlFor={option.id} className={canVote ? 'cursor-pointer text-lg font-semibold' : 'text-lg font-semibold'}>
                              {option.option_text}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  )}

                  {textQuestion && (
                    <div className="space-y-3">
                      {Array.from({ length: textMax }).map((_, idx) => (
                        <div key={idx} className="space-y-1">
                          <Label>Antwort {idx + 1}</Label>
                          <Input
                            value={answers[question.id]?.[idx] || ''}
                            onChange={(e) => handleTextChange(question.id, idx, e.target.value)}
                            placeholder="z.B. Service, Preis, Qualität"
                            disabled={!canVote}
                          />
                        </div>
                      ))}
                      <p className="text-xs text-gray-500">
                        Tipp: Kurze Begriffe funktionieren am besten für die Begriffswolke.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 space-y-2">
          {typeof survey.max_votes === 'number' && (
            <p className="text-sm text-gray-600 text-center">
              Teilnehmer: {participantCount}/{survey.max_votes}
            </p>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!canVote}
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
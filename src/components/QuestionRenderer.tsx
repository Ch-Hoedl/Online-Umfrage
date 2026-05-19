import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquare } from 'lucide-react';
import type { Question, Option } from '@/integrations/supabase/types';
import {
  isTextQuestion,
  isLongTextQuestion,
  isMultiRatingQuestion,
  getTextMaxAnswers,
  getVisibleOptions,
  hasCommentOption,
} from '@/lib/surveyHelpers';

interface QuestionRendererProps {
  question: Question;
  questionIndex: number;
  answers: { [qid: string]: string[] };
  comments: { [qid: string]: string };
  options: { [qid: string]: Option[] };
  questions: Question[];
  disabled?: boolean;
  /** Prefix for HTML ids to avoid collisions (e.g. 'prev-' for preview) */
  idPrefix?: string;
  onSingleChoice: (qid: string, optionId: string) => void;
  onMultipleChoice: (qid: string, optionId: string, checked: boolean) => void;
  onMultiRatingChange: (qid: string, optionId: string, rating: string) => void;
  onTextChange: (qid: string, index: number, value: string) => void;
  onLongTextChange: (qid: string, value: string) => void;
  onCommentChange: (qid: string, value: string) => void;
}

const QuestionRenderer = ({
  question,
  questionIndex,
  answers,
  comments,
  options,
  questions,
  disabled = false,
  idPrefix = '',
  onSingleChoice,
  onMultipleChoice,
  onMultiRatingChange,
  onTextChange,
  onLongTextChange,
  onCommentChange,
}: QuestionRendererProps) => {
  const qid = question.id;
  const visibleOpts = getVisibleOptions(qid, options);
  const textQ = isTextQuestion(qid, options, questions);
  const longTextQ = isLongTextQuestion(qid, questions);
  const multiRatingQ = isMultiRatingQuestion(qid, questions);
  const textMax = textQ ? getTextMaxAnswers(qid, options, questions) : 0;

  return (
    <Card className={`shadow-md transition-all ${disabled ? 'opacity-75' : ''}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center mt-0.5">
            {questionIndex + 1}
          </span>
          <div>
            <CardTitle className="text-xl leading-snug">{question.question_text}</CardTitle>
            <CardDescription className="mt-1">
              {textQ && `Geben Sie bis zu ${textMax} Begriff(e) ein`}
              {longTextQ && 'Schreiben Sie Ihre Antwort (bis zu 2048 Zeichen)'}
              {!textQ && !longTextQ && question.question_type === 'single' && 'Wählen Sie eine Antwort'}
              {!textQ && !longTextQ && question.question_type === 'multiple' && 'Wählen Sie eine oder mehrere Antworten'}
              {!textQ && !longTextQ && question.question_type === 'rating' && 'Bewerten Sie von 1 bis 5'}
              {multiRatingQ && 'Bewerten Sie jede Eigenschaft von 1 (stimme voll zu) bis 5 (stimme überhaupt nicht zu)'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">

        {/* Single choice */}
        {!textQ && !longTextQ && question.question_type === 'single' && (
          <RadioGroup value={answers[qid]?.[0] || ''} onValueChange={(v) => onSingleChoice(qid, v)}>
            <div className="space-y-2">
              {visibleOpts.map((option) => (
                <label
                  key={option.id}
                  htmlFor={`${idPrefix}${option.id}`}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                    answers[qid]?.[0] === option.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  } ${disabled ? 'cursor-default' : ''}`}
                >
                  <RadioGroupItem value={option.id} id={`${idPrefix}${option.id}`} disabled={disabled} />
                  <span className="flex-1 text-gray-800">{option.option_text}</span>
                </label>
              ))}
            </div>
          </RadioGroup>
        )}

        {/* Multiple choice */}
        {!textQ && !longTextQ && question.question_type === 'multiple' && (
          <div className="space-y-2">
            {visibleOpts.map((option) => (
              <label
                key={option.id}
                htmlFor={`${idPrefix}${option.id}`}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                  answers[qid]?.includes(option.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                } ${disabled ? 'cursor-default' : ''}`}
              >
                <Checkbox
                  id={`${idPrefix}${option.id}`}
                  disabled={disabled}
                  checked={answers[qid]?.includes(option.id) || false}
                  onCheckedChange={(checked) => onMultipleChoice(qid, option.id, checked as boolean)}
                />
                <span className="flex-1 text-gray-800">{option.option_text}</span>
              </label>
            ))}
          </div>
        )}

        {/* Rating */}
        {!textQ && !longTextQ && question.question_type === 'rating' && (
          <RadioGroup value={answers[qid]?.[0] || ''} onValueChange={(v) => onSingleChoice(qid, v)}>
            <div className="flex gap-3 justify-center flex-wrap">
              {visibleOpts.map((option) => (
                <label
                  key={option.id}
                  htmlFor={`${idPrefix}${option.id}`}
                  className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 cursor-pointer transition-all font-bold text-lg ${
                    answers[qid]?.[0] === option.id
                      ? 'border-blue-500 bg-blue-600 text-white shadow-md'
                      : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                  } ${disabled ? 'cursor-default' : ''}`}
                >
                  <RadioGroupItem value={option.id} id={`${idPrefix}${option.id}`} disabled={disabled} className="sr-only" />
                  {option.option_text}
                </label>
              ))}
            </div>
          </RadioGroup>
        )}

        {/* Multirating */}
        {multiRatingQ && (
          <div className="space-y-1">
            {/* Header row */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_repeat(5,2.5rem)] gap-2 items-center px-3 pb-2 border-b border-gray-100">
              <span className="text-xs font-medium text-gray-500"></span>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className="text-xs font-semibold text-gray-500 text-center">{n}</span>
              ))}
            </div>
            {visibleOpts.map((option) => {
              const currentRating = (answers[qid] || []).find((v) => v.startsWith(`${option.id}:`))?.split(':')[1] || '';
              return (
                <div
                  key={option.id}
                  className={`rounded-xl border-2 px-3 py-3 transition-all ${
                    currentRating ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 bg-white'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800 mb-2 sm:hidden">{option.option_text}</p>
                  <div className="grid grid-cols-5 sm:grid-cols-[1fr_repeat(5,2.5rem)] gap-2 items-center">
                    <p className="hidden sm:block text-sm font-medium text-gray-800">{option.option_text}</p>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={disabled}
                        onClick={() => onMultiRatingChange(qid, option.id, n.toString())}
                        className={`w-10 h-10 sm:w-9 sm:h-9 mx-auto rounded-lg border-2 font-bold text-sm transition-all ${
                          currentRating === n.toString()
                            ? 'border-blue-500 bg-blue-600 text-white shadow-md'
                            : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                        } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between text-xs text-gray-400 pt-2 px-1">
              <span>1 = stimme voll zu</span>
              <span>5 = stimme überhaupt nicht zu</span>
            </div>
          </div>
        )}

        {/* Text / word cloud */}
        {textQ && (
          <div className="space-y-3">
            {Array.from({ length: textMax }).map((_, idx) => (
              <div key={idx} className="space-y-1">
                {textMax > 1 && <Label>Antwort {idx + 1}</Label>}
                <Input
                  value={answers[qid]?.[idx] || ''}
                  onChange={(e) => onTextChange(qid, idx, e.target.value)}
                  placeholder="Ihre Antwort…"
                  disabled={disabled}
                />
              </div>
            ))}
            <p className="text-xs text-gray-500">Tipp: Kurze Begriffe funktionieren am besten für die Begriffswolke.</p>
          </div>
        )}

        {/* Long text / free text */}
        {longTextQ && (
          <div className="space-y-2">
            <Textarea
              value={answers[qid]?.[0] || ''}
              onChange={(e) => onLongTextChange(qid, e.target.value)}
              placeholder="Schreiben Sie hier Ihre ausführliche Antwort…"
              disabled={disabled}
              maxLength={2048}
              rows={8}
              className="resize-none"
            />
            <p className="text-xs text-gray-400 text-right">{(answers[qid]?.[0] || '').length}/2048 Zeichen</p>
          </div>
        )}

        {/* Comment field – not shown for longtext */}
        {!longTextQ && hasCommentOption(qid, options) && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <Label htmlFor={`${idPrefix}comment-${qid}`} className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              Persönlicher Kommentar <span className="text-gray-400">(optional)</span>
            </Label>
            <textarea
              id={`${idPrefix}comment-${qid}`}
              value={comments[qid] || ''}
              onChange={(e) => onCommentChange(qid, e.target.value)}
              disabled={disabled}
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
};

export default QuestionRenderer;

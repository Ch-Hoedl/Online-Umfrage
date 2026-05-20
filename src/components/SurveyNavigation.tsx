import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';
import type { Question, Option } from '@/integrations/supabase/types';
import { isQuestionAnswered } from '@/lib/surveyHelpers';

interface SurveyNavigationProps {
  questions: Question[];
  currentIndex: number;
  answers: { [qid: string]: string[] };
  options: { [qid: string]: Option[] };
  onNavigate: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
  submitting?: boolean;
  showSubmitHint?: boolean;
  /** Content rendered between progress bar and controls (typically QuestionRenderer) */
  children: ReactNode;
}

const SurveyNavigation = ({
  questions,
  currentIndex,
  answers,
  options,
  onNavigate,
  onPrev,
  onNext,
  onSubmit,
  submitLabel,
  submitDisabled = false,
  submitting = false,
  showSubmitHint = true,
  children,
}: SurveyNavigationProps) => {
  const totalQuestions = questions.length;
  if (totalQuestions === 0) return null;

  const isLastQuestion = currentIndex === totalQuestions - 1;
  const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;

  return (
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

      {/* Question content slot */}
      {children}

      {/* Controls */}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="outline" onClick={onPrev} disabled={currentIndex === 0} className="flex items-center gap-2 px-5">
          <ChevronLeft className="w-4 h-4" /> Zurück
        </Button>

        <div className="flex-1 flex justify-center gap-1.5 flex-wrap">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => onNavigate(i)}
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
          <Button
            onClick={onSubmit}
            disabled={submitDisabled || submitting}
            className="flex items-center gap-2 px-5 bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Wird gesendet…' : submitLabel}
          </Button>
        ) : (
          <Button onClick={onNext} className="flex items-center gap-2 px-5 bg-blue-600 hover:bg-blue-700">
            Weiter <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      {isLastQuestion && showSubmitHint && (
        <p className="text-center text-sm text-gray-500 mt-4">
          Alle Antworten werden erst beim Klick auf <strong>„Absenden"</strong> gespeichert.
        </p>
      )}
    </>
  );
};

export default SurveyNavigation;

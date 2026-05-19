import { useState, useCallback } from 'react';

/**
 * Shared answer/comment state + handlers for Survey and SurveyPreview.
 * The optional `disabled` flag gates all mutations (used by Survey when voting is closed).
 */
export function useSurveyAnswers(disabled = false) {
  const [answers, setAnswers] = useState<{ [qid: string]: string[] }>({});
  const [comments, setComments] = useState<{ [qid: string]: string }>({});

  const handleSingleChoice = useCallback((qid: string, optionId: string) => {
    if (disabled) return;
    setAnswers((prev) => ({ ...prev, [qid]: [optionId] }));
  }, [disabled]);

  const handleMultipleChoice = useCallback((qid: string, optionId: string, checked: boolean) => {
    if (disabled) return;
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: checked ? [...cur, optionId] : cur.filter((id) => id !== optionId) };
    });
  }, [disabled]);

  const handleTextChange = useCallback((qid: string, index: number, value: string) => {
    if (disabled) return;
    setAnswers((prev) => {
      const next = (prev[qid] || []).slice();
      while (next.length <= index) next.push('');
      next[index] = value;
      return { ...prev, [qid]: next };
    });
  }, [disabled]);

  const handleLongTextChange = useCallback((qid: string, value: string) => {
    if (disabled) return;
    setAnswers((prev) => ({ ...prev, [qid]: [value] }));
  }, [disabled]);

  const handleCommentChange = useCallback((qid: string, value: string) => {
    if (disabled) return;
    setComments((prev) => ({ ...prev, [qid]: value }));
  }, [disabled]);

  const handleMultiRatingChange = useCallback((qid: string, optionId: string, rating: string) => {
    if (disabled) return;
    setAnswers((prev) => {
      const cur = (prev[qid] || []).filter((v) => !v.startsWith(`${optionId}:`));
      return { ...prev, [qid]: [...cur, `${optionId}:${rating}`] };
    });
  }, [disabled]);

  const resetAnswers = useCallback(() => {
    setAnswers({});
    setComments({});
  }, []);

  return {
    answers,
    comments,
    resetAnswers,
    handleSingleChoice,
    handleMultipleChoice,
    handleTextChange,
    handleLongTextChange,
    handleCommentChange,
    handleMultiRatingChange,
  };
}

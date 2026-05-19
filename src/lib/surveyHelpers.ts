// ── Shared survey meta-option helpers ─────────────────────────────────────────
// Used across CreateSurvey, Survey, SurveyPreview, and Results.

export const META_PREFIX = '__dyad_meta__:';

export const SURVEY_META_PREFIXES = ['__dyad_meta__:', '__dyad_survey_meta__:'];

// ── Build helpers (for CreateSurvey) ──────────────────────────────────────────

export const buildTextMetaOption = (maxAnswers: number) =>
  `${META_PREFIX}${JSON.stringify({ kind: 'text', maxAnswers })}`;

export const buildCommentMetaOption = () =>
  `${META_PREFIX}${JSON.stringify({ kind: 'comment' })}`;

export const buildCategoryMetaOption = () =>
  `${META_PREFIX}${JSON.stringify({ kind: 'category' })}`;

// ── Parse helpers ─────────────────────────────────────────────────────────────

export function isMetaOption(text: string): boolean {
  return text.startsWith(META_PREFIX);
}

export function parseMeta(text: string): Record<string, unknown> | null {
  if (!isMetaOption(text)) return null;
  try {
    return JSON.parse(text.slice(META_PREFIX.length));
  } catch {
    return null;
  }
}

export function parseTextMaxAnswers(optionText: string): number | null {
  const parsed = parseMeta(optionText);
  if (parsed?.kind === 'text' && typeof parsed?.maxAnswers === 'number') {
    return parsed.maxAnswers;
  }
  return null;
}

export function isCommentMetaOption(text: string): boolean {
  return parseMeta(text)?.kind === 'comment';
}

export function isTextMetaOption(text: string): boolean {
  return parseMeta(text)?.kind === 'text';
}

export function isCategoryMetaOption(text: string): boolean {
  return parseMeta(text)?.kind === 'category';
}

// ── Text helpers ──────────────────────────────────────────────────────────────

export function normalizeTextTerm(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

export function stripMetaFromDescription(desc: string | null | undefined): string {
  if (!desc) return '';
  return desc
    .split('\n')
    .filter((line) => !SURVEY_META_PREFIXES.some((p) => line.trim().startsWith(p)))
    .join('\n')
    .trim();
}

// ── Device / voting helpers ───────────────────────────────────────────────────

const DEVICE_ID_STORAGE_KEY = 'survey_device_id_v1';
const VOTED_SURVEY_PREFIX = 'survey_voted_v1:';

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

export function hasVotedLocally(surveyId: string): boolean {
  return localStorage.getItem(`${VOTED_SURVEY_PREFIX}${surveyId}`) === '1';
}

export function markVotedLocally(surveyId: string): void {
  localStorage.setItem(`${VOTED_SURVEY_PREFIX}${surveyId}`, '1');
}

// ── Question type helpers ─────────────────────────────────────────────────────

import type { Question, Option } from '@/integrations/supabase/types';

export function getTextMaxAnswers(
  qid: string,
  options: { [qid: string]: Option[] },
  questions: Question[],
): number {
  const metaOpt = (options[qid] || []).find((o) => parseTextMaxAnswers(o.option_text) !== null);
  if (metaOpt) {
    const parsed = parseTextMaxAnswers(metaOpt.option_text);
    if (parsed && parsed >= 1) return parsed;
  }
  const q = questions.find((q) => q.id === qid);
  return q?.max_text_answers ?? 1;
}

export function hasCommentOption(qid: string, options: { [qid: string]: Option[] }): boolean {
  return (options[qid] || []).some((o) => isCommentMetaOption(o.option_text));
}

export function isTextQuestion(
  qid: string,
  options: { [qid: string]: Option[] },
  questions: Question[],
): boolean {
  const q = questions.find((q) => q.id === qid);
  if (q?.question_type === 'text') return true;
  return (options[qid] || []).some((o) => parseTextMaxAnswers(o.option_text) !== null);
}

export function isLongTextQuestion(qid: string, questions: Question[]): boolean {
  const q = questions.find((q) => q.id === qid);
  return q?.question_type === 'longtext';
}

export function isMultiRatingQuestion(qid: string, questions: Question[]): boolean {
  const q = questions.find((q) => q.id === qid);
  return q?.question_type === 'multirating';
}

export function getVisibleOptions(qid: string, options: { [qid: string]: Option[] }): Option[] {
  return (options[qid] || []).filter((o) => !isMetaOption(o.option_text));
}

/** Check if a question is answered (for dot indicators & validation) */
export function isQuestionAnswered(
  qid: string,
  answers: { [qid: string]: string[] },
  options: { [qid: string]: Option[] },
  questions: Question[],
): boolean {
  if (isTextQuestion(qid, options, questions)) {
    return (answers[qid] || []).map(normalizeTextTerm).filter(Boolean).length > 0;
  }
  if (isLongTextQuestion(qid, questions)) {
    return (answers[qid]?.[0] || '').trim().length > 0;
  }
  if (isMultiRatingQuestion(qid, questions)) {
    const visibleOpts = getVisibleOptions(qid, options);
    const ratedCount = (answers[qid] || []).filter((v) => v.includes(':')).length;
    return ratedCount === visibleOpts.length;
  }
  return (answers[qid] || []).length > 0;
}

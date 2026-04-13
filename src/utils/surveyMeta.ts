const SURVEY_META_PREFIX = '__dyad_survey_meta__:';

export type SurveyMeta = {
  max_votes?: number | null;
  expires_at?: string | null;
};

export function encodeDescriptionWithMeta(description: string | null | undefined, meta: SurveyMeta) {
  const clean = (description || '').split('\n').filter((line) => !line.startsWith(SURVEY_META_PREFIX)).join('\n').trim();
  const metaLine = `${SURVEY_META_PREFIX}${JSON.stringify(meta)}`;
  if (!clean) return metaLine;
  return `${clean}\n\n${metaLine}`;
}

export function decodeDescriptionWithMeta(description: string | null | undefined): {
  description: string | null;
  meta: SurveyMeta;
} {
  const lines = (description || '').split('\n');
  const metaLine = lines.find((l) => l.startsWith(SURVEY_META_PREFIX));

  let meta: SurveyMeta = {};
  if (metaLine) {
    try {
      meta = JSON.parse(metaLine.slice(SURVEY_META_PREFIX.length)) || {};
    } catch {
      meta = {};
    }
  }

  const cleaned = lines.filter((l) => !l.startsWith(SURVEY_META_PREFIX)).join('\n').trim();

  return {
    description: cleaned ? cleaned : null,
    meta,
  };
}

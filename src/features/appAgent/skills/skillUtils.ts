import { createSkillMatch, noSkillMatch, type SkillMatchResult } from './types';

export const normalizeSkillText = (value: string) => (
  value.toLowerCase().replace(/\s+/g, ' ').trim()
);

export const findKeywordHits = (text: string, keywords: readonly string[]) => {
  const normalized = normalizeSkillText(text);
  return keywords.filter(keyword => normalized.includes(keyword.toLowerCase()));
};

export const matchKeywords = (
  text: string,
  keywords: readonly string[],
  options: { baseScore?: number; perHitScore?: number; maxScore?: number } = {},
): SkillMatchResult => {
  const hits = findKeywordHits(text, keywords);
  if (hits.length === 0) return noSkillMatch();
  const baseScore = options.baseScore ?? 0.45;
  const perHitScore = options.perHitScore ?? 0.08;
  const maxScore = options.maxScore ?? 0.95;
  return createSkillMatch(
    Math.min(maxScore, baseScore + hits.length * perHitScore),
    hits.map(hit => `keyword:${hit}`),
  );
};

export const uniqueStrings = <T extends string>(values: T[]) => (
  Array.from(new Set(values))
);

import { INSPIRATION_REFERENCE_ROLES } from './types';
import type { InspirationCandidate, InspirationReferenceRole } from './types';

const compact = (value: unknown, max = 180) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

export const shouldRankInspirationCandidates = (candidates: InspirationCandidate[]) => (
  candidates.filter(candidate => candidate.state === 'candidate').length >= 2
);

export function buildInspirationCandidateRankingPrompt(
  userRequest: string,
  candidates: InspirationCandidate[],
) {
  return JSON.stringify({
    task: 'Rank only the supplied inspiration candidates for the user request.',
    rules: [
      'Return JSON only.',
      'Do not analyze images; use summaries only.',
      'Do not add facts not present in the summaries.',
      'For each candidate return itemId, adopt, referenceRole and a concise reason.',
    ],
    userRequest: compact(userRequest, 500),
    candidates: candidates
      .filter(candidate => candidate.state === 'candidate')
      .slice(0, 8)
      .map(candidate => ({
        itemId: candidate.itemId,
        summary: compact(candidate.summary),
      })),
    outputSchema: {
      decisions: [{
        itemId: 'string',
        adopt: true,
        referenceRole: 'FORM_REF|CMF_REF|STRUCTURE_REF|INTERACTION_REF|MOOD_REF|SUBJECT_REF',
        reason: 'short string',
      }],
    },
  });
}

export function applyInspirationCandidateRanking(
  candidates: InspirationCandidate[],
  value: unknown,
): InspirationCandidate[] {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const decisions = Array.isArray(record.decisions) ? record.decisions : [];
  const byId = new Map(decisions.flatMap(decision => {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return [];
    const row = decision as Record<string, unknown>;
    const itemId = String(row.itemId || '').trim();
    if (!itemId) return [];
    const role = String(row.referenceRole || '').trim();
    return [[itemId, {
      adopt: row.adopt === true,
      role: INSPIRATION_REFERENCE_ROLES.includes(role as InspirationReferenceRole)
        ? role as InspirationReferenceRole
        : undefined,
      reason: compact(row.reason, 180),
    }] as const];
  }));

  return candidates.map(candidate => {
    if (candidate.state !== 'candidate') return candidate;
    const decision = byId.get(candidate.itemId);
    if (!decision) return candidate;
    return {
      ...candidate,
      state: decision.adopt ? 'candidate' : 'rejected',
      recommendedRole: decision.role || candidate.recommendedRole,
      reason: decision.reason || candidate.reason,
      llmRanked: true,
      llmRecommended: decision.adopt,
    };
  });
}

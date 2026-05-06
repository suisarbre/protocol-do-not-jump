import type {ModerationReport} from './types';

const redactionTerms = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'piss',
];

const blockedPatterns = [
  {label: 'explicit sexual content', pattern: /\b(pornographic|rape|incest)\b/i},
  {label: 'graphic cruelty', pattern: /\b(torture porn|dismemberment for pleasure)\b/i},
];

export function moderateText(input: string): {text: string; report: ModerationReport} {
  let text = input;
  const redactions: Array<{term: string; count: number}> = [];

  for (const term of redactionTerms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    const matches = text.match(pattern);
    if (!matches?.length) continue;

    redactions.push({term, count: matches.length});
    text = text.replace(pattern, '[REDACTED]');
  }

  const violations = blockedPatterns
    .filter((entry) => entry.pattern.test(input))
    .map((entry) => entry.label);

  return {
    text,
    report: {
      redactions,
      violations,
      rating: violations.length ? 'blocked' : redactions.length ? 'redacted' : 'clean',
    },
  };
}

export function hasBlockingModeration(report: ModerationReport): boolean {
  return report.rating === 'blocked' || report.violations.length > 0;
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

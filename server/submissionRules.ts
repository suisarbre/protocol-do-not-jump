import {HttpError} from './errors';
import {parseWikiMarkdown} from './markdown';
import {hasBlockingModeration, moderateText} from './moderation';
import {assertEditableWikiPath} from './paths';
import type {ModerationReport, RiskLevel} from './types';

export type SubmissionSafety = {
  safe: boolean;
  riskLevel: RiskLevel;
  moderation: ModerationReport;
  reasons: string[];
};

export function evaluateSubmissionSafety(markdown: string, targetPath: string): SubmissionSafety {
  const path = assertEditableWikiPath(targetPath);
  const parsed = parseWikiMarkdown(markdown);
  const moderation = moderateText(markdown).report;
  const reasons: string[] = [];

  if (parsed.frontMatter.canonLevel !== 'non-core') {
    reasons.push('Only non-core documents are eligible for user submission.');
  }

  if (hasBlockingModeration(moderation)) {
    reasons.push('Submission contains content outside the Teen / PG-13 policy.');
  }

  if (path.startsWith('docs/canon/')) {
    reasons.push('Core canon paths are protected.');
  }

  const riskLevel: RiskLevel = reasons.length ? 'high' : moderation.redactions.length ? 'medium' : 'low';

  return {
    safe: reasons.length === 0,
    riskLevel,
    moderation,
    reasons,
  };
}

export function assertFreshEdit(baseBlobSha: string | undefined, currentSha: string): void {
  if (!baseBlobSha || baseBlobSha !== currentSha) {
    throw new HttpError(
      409,
      'stale_edit',
      'Someone just updated this document. Please review the latest version and try again.',
    );
  }
}

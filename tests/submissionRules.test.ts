import {describe, expect, it} from 'vitest';
import {assertFreshEdit, evaluateSubmissionSafety} from '../server/submissionRules';
import {writeWikiMarkdown} from '../server/markdown';

const safeMarkdown = writeWikiMarkdown(
  {
    title: 'Relay 41',
    slug: 'relay-41',
    documentType: 'Megacorporation Technical Report',
    canonLevel: 'non-core',
    authorGithub: 'writer',
    loreTags: ['relay'],
    created: '2026-05-06T00:00:00.000Z',
    updated: '2026-05-06T00:00:00.000Z',
    sourcePr: 'pending',
  },
  '## Abstract\n\nSignal recovered.',
);

describe('submission safety', () => {
  it('allows safe non-core lore paths', () => {
    expect(evaluateSubmissionSafety(safeMarkdown, 'docs/lore/relay-41.md')).toMatchObject({
      safe: true,
      riskLevel: 'low',
    });
  });

  it('detects stale edit SHAs as conflict errors', () => {
    expect(() => assertFreshEdit('old', 'new')).toThrow(
      'Someone just updated this document. Please review the latest version and try again.',
    );
  });

  it('blocks protected canon paths', () => {
    expect(() => evaluateSubmissionSafety(safeMarkdown, 'docs/canon/prime-canon.md')).toThrow(
      /Core canon/,
    );
  });
});

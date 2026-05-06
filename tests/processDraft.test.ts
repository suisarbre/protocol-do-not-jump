import {describe, expect, it} from 'vitest';
import {processDraft} from '../server/processDraft';
import type {Session} from '../server/types';

describe('draft processing', () => {
  it('formats drafts with required front matter when Gemini is not configured', async () => {
    const session: Session = {
      user: {id: 1, login: 'writer'},
      expiresAt: Date.now() + 1000,
    };

    const result = await processDraft(
      {
        text: 'Relay 41\n\nA signal repeats every 41 hours.',
        directoryPath: 'docs/BBB internal documents',
        operation: 'new',
      },
      session,
    );

    expect(result.formattedMarkdown).toContain('documentType: BBB Internal Document');
    expect(result.targetPath).toBe('docs/BBB internal documents/relay-41.md');
    expect(result.directoryRulesPath).toBe('docs/BBB internal documents/formats.md');
    expect(result.riskLevel).toBe('low');
  });
});

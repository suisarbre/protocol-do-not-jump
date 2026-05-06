import {describe, expect, it} from 'vitest';
import {parseWikiMarkdown, writeWikiMarkdown} from '../server/markdown';

describe('wiki markdown', () => {
  it('requires complete front matter', () => {
    expect(() => parseWikiMarkdown('# Missing')).toThrow(/front matter/);
  });

  it('round-trips required fields', () => {
    const markdown = writeWikiMarkdown(
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

    const parsed = parseWikiMarkdown(markdown);
    expect(parsed.frontMatter.title).toBe('Relay 41');
    expect(parsed.body).toContain('Signal recovered.');
  });
});

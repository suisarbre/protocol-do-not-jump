import {describe, expect, it} from 'vitest';
import {assertEditableWikiPath, assertWikiMarkdownPath, pathForNewLore, slugifyTitle} from '../server/paths';

describe('wiki paths', () => {
  it('accepts Markdown files under docs', () => {
    expect(assertWikiMarkdownPath('docs/lore/example.md')).toBe('docs/lore/example.md');
  });

  it('blocks protected canon edits', () => {
    expect(() => assertEditableWikiPath('docs/prime-canon.md')).toThrow(/Core canon/);
  });

  it('blocks traversal outside docs', () => {
    expect(() => assertEditableWikiPath('../docs/lore/bad.md')).toThrow(/Invalid wiki path/);
  });

  it('builds stable slugs and new lore paths', () => {
    expect(slugifyTitle('Asterion Verge: Relay #41')).toBe('asterion-verge-relay-41');
    expect(pathForNewLore('Asterion Verge: Relay #41')).toBe('docs/lore/asterion-verge-relay-41.md');
  });
});

import {describe, expect, it} from 'vitest';
import {readDirectoryRules, getWikiTree} from '../server/wikiTree';

describe('wiki tree', () => {
  it('discovers lore directories with local format rules', async () => {
    const tree = await getWikiTree();
    const bbb = tree.find((directory) => directory.path === 'docs/BBB internal documents');

    expect(bbb?.hasRules).toBe(true);
    expect(bbb?.rulesPath).toBe('docs/BBB internal documents/formats.md');
    expect(bbb?.files.some((file) => file.path.endsWith('20XX_X_25_Receipt.md'))).toBe(true);
  });

  it('returns default rules for a new editable directory', async () => {
    const rules = await readDirectoryRules('docs/New Archive');

    expect(rules.exists).toBe(false);
    expect(rules.rulesPath).toBe('docs/New Archive/formats.md');
    expect(rules.content).toContain('Directory Formatting Rules');
  });
});

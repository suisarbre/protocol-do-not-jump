import {PROTECTED_CANON_PATH, assertWikiMarkdownPath} from '../server/paths';
import {parseWikiMarkdown} from '../server/markdown';
import {listMarkdownFiles} from './file-utils';
import fs from 'node:fs';

const files = listMarkdownFiles();
const errors: string[] = [];

for (const file of files) {
  try {
    assertWikiMarkdownPath(file);
    const parsed = parseWikiMarkdown(fs.readFileSync(file, 'utf8'));

    if (parsed.frontMatter.canonLevel === 'core' && !file.startsWith('docs/canon/')) {
      errors.push(`${file}: canonLevel "core" is only allowed inside docs/canon/.`);
    }

    if (file.startsWith('docs/canon/') && parsed.frontMatter.canonLevel !== 'core') {
      errors.push(`${file}: docs/canon/ files must have canonLevel "core".`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${file}: ${message}`);
  }
}

if (!files.includes(PROTECTED_CANON_PATH)) {
  errors.push(`${PROTECTED_CANON_PATH}: protected canon seed is required.`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${files.length} Markdown files.`);

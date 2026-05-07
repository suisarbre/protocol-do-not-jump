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

    const isAtDocsRoot = file.split('/').length === 2 && file.startsWith('docs/');
    const canonLevel = (parsed.frontMatter.canonLevel as string | undefined)?.toLowerCase();

    if (canonLevel === 'core' && !isAtDocsRoot) {
      errors.push(`${file}: canonLevel "core" is only allowed at the docs/ root level.`);
    }

    if (isAtDocsRoot && canonLevel !== 'core') {
      errors.push(`${file}: files at docs/ root must have canonLevel "core".`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${file}: ${message}`);
  }
}

if (!files.some((f) => f === PROTECTED_CANON_PATH)) {
  errors.push(`${PROTECTED_CANON_PATH}: protected canon seed is required.`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${files.length} Markdown files.`);

import {execFileSync} from 'node:child_process';
import {evaluateSubmissionSafety} from '../server/submissionRules';
import {parseWikiMarkdown} from '../server/markdown';
import {PROTECTED_CANON_PATH} from '../server/paths';
import {toPosix} from './file-utils';
import fs from 'node:fs';

const changedFiles = getChangedFiles();
const errors: string[] = [];

for (const file of changedFiles) {
  if (!file.startsWith('docs/') || !/\.(md|mdx)$/.test(file)) continue;

  if (file === PROTECTED_CANON_PATH || file.startsWith('docs/canon/')) {
    errors.push(`${file}: auto-merge cannot touch protected canon.`);
    continue;
  }

  if (!fs.existsSync(file)) continue;

  const markdown = fs.readFileSync(file, 'utf8');
  const parsed = parseWikiMarkdown(markdown);
  const safety = evaluateSubmissionSafety(markdown, file);
  if (!safety.safe) {
    errors.push(`${file}: ${safety.reasons.join('; ')}`);
  }
  if (parsed.frontMatter.sourcePr === 'pending') {
    errors.push(`${file}: sourcePr must be updated to the PR URL before merge.`);
  }
}

if (!changedFiles.some((file) => file.startsWith('docs/') && /\.(md|mdx)$/.test(file))) {
  errors.push('Auto-merge PR must include at least one docs Markdown change.');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('PR safety checks passed.');

function getChangedFiles(): string[] {
  if (process.env.CHANGED_FILES) {
    return process.env.CHANGED_FILES.split(/\r?\n|,/).map(toPosix).filter(Boolean);
  }

  const base = process.env.BASE_SHA ?? 'origin/main';
  const head = process.env.HEAD_SHA ?? 'HEAD';
  try {
    return execFileSync('git', ['diff', '--name-only', base, head], {encoding: 'utf8'})
      .split(/\r?\n/)
      .map(toPosix)
      .filter(Boolean);
  } catch {
    return [];
  }
}

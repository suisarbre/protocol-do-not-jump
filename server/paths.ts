import path from 'node:path';
import {HttpError} from './errors';

export const PROTECTED_CANON_PATH = 'docs/canon/prime-canon.md';
export const DIRECTORY_RULE_FILENAMES = ['formats.md', 'rules.md'] as const;

export function normalizeWikiPath(input: string): string {
  const replaced = input.replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(replaced);

  if (
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized === '..' ||
    normalized.includes('\0')
  ) {
    throw new HttpError(400, 'invalid_path', 'Invalid wiki path.');
  }

  return normalized;
}

export function assertWikiMarkdownPath(input: string): string {
  const normalized = normalizeWikiPath(input);
  if (!normalized.startsWith('docs/')) {
    throw new HttpError(400, 'invalid_path', 'Wiki documents must live under docs/.');
  }
  if (!/\.(md|mdx)$/.test(normalized)) {
    throw new HttpError(400, 'invalid_path', 'Wiki documents must be Markdown files.');
  }
  return normalized;
}

export function assertEditableWikiPath(input: string): string {
  const normalized = assertWikiMarkdownPath(input);
  if (normalized === PROTECTED_CANON_PATH || normalized.startsWith('docs/canon/')) {
    throw new HttpError(403, 'protected_canon', 'Core canon documents cannot be edited here.');
  }
  return normalized;
}

export function assertEditableWikiPathForAdmin(input: string, admin: boolean): string {
  return admin ? assertWikiMarkdownPath(input) : assertEditableWikiPath(input);
}

export function assertEditableDirectoryPath(input: string): string {
  const normalized = normalizeWikiPath(input).replace(/\/+$/, '');
  if (!normalized.startsWith('docs/')) {
    throw new HttpError(400, 'invalid_path', 'Lore directories must live under docs/.');
  }
  if (normalized === 'docs' || normalized.startsWith('docs/canon')) {
    throw new HttpError(403, 'protected_canon', 'Core canon directories cannot be edited here.');
  }
  if (/\.(md|mdx)$/.test(normalized)) {
    throw new HttpError(400, 'invalid_path', 'Expected a directory path, not a Markdown file.');
  }
  return normalized;
}

export function assertEditableDirectoryRulePath(input: string): string {
  const normalized = assertEditableWikiPath(input);
  const filename = normalized.split('/').pop();
  if (!DIRECTORY_RULE_FILENAMES.includes(filename as (typeof DIRECTORY_RULE_FILENAMES)[number])) {
    throw new HttpError(400, 'invalid_path', 'Directory rules must be named formats.md or rules.md.');
  }
  return normalized;
}

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || 'untitled-entry';
}

export function pathForNewLore(title: string): string {
  return `docs/lore/${slugifyTitle(title)}.md`;
}

export function pathForNewLoreInDirectory(directoryPath: string, title: string): string {
  return `${assertEditableDirectoryPath(directoryPath)}/${slugifyTitle(title)}.md`;
}

export function directoryRulesCandidates(directoryPath: string): string[] {
  const normalized = assertEditableDirectoryPath(directoryPath);
  return DIRECTORY_RULE_FILENAMES.map((filename) => `${normalized}/${filename}`);
}

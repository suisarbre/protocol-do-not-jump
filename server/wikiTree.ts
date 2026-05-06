import fs from 'node:fs';
import path from 'node:path';
import {env} from './env';
import {getRepositoryContent, listRepositoryTree} from './github';
import {parseWikiMarkdown, readFrontMatter} from './markdown';
import {
  DIRECTORY_RULE_FILENAMES,
  assertEditableDirectoryPath,
  directoryRulesCandidates,
  normalizeWikiPath,
} from './paths';

export type WikiFileNode = {
  path: string;
  title: string;
  sha?: string;
  kind: 'rules' | 'document';
  editable: boolean;
};

export type WikiDirectoryNode = {
  path: string;
  name: string;
  hasRules: boolean;
  rulesPath?: string;
  files: WikiFileNode[];
};

export type DirectoryRules = {
  directoryPath: string;
  rulesPath: string;
  sha?: string;
  content: string;
  exists: boolean;
};

export async function getWikiTree(): Promise<WikiDirectoryNode[]> {
  const files = await listWikiMarkdownFiles();
  const directories = new Map<string, WikiDirectoryNode>();

  for (const file of files) {
    if (!file.path.startsWith('docs/') || !/\.(md|mdx)$/.test(file.path)) continue;
    const directoryPath = file.path.split('/').slice(0, -1).join('/');
    if (directoryPath === 'docs') continue;
    if (directoryPath === 'docs/canon') continue;

    const directory = ensureDirectory(directories, directoryPath);
    const filename = file.path.split('/').pop() ?? '';
    const isRules = DIRECTORY_RULE_FILENAMES.includes(filename as (typeof DIRECTORY_RULE_FILENAMES)[number]);
    const title = await titleForFile(file.path);

    if (isRules) {
      directory.hasRules = true;
      directory.rulesPath = file.path;
    }

    directory.files.push({
      path: file.path,
      title,
      sha: file.sha,
      kind: isRules ? 'rules' : 'document',
      editable: !file.path.startsWith('docs/canon/'),
    });
  }

  return Array.from(directories.values())
    .map((directory) => ({
      ...directory,
      files: directory.files.sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function readDirectoryRules(directoryPath: string): Promise<DirectoryRules> {
  const directory = assertEditableDirectoryPath(directoryPath);
  for (const candidate of directoryRulesCandidates(directory)) {
    const file = await readWikiFile(candidate);
    if (file) {
      return {
        directoryPath: directory,
        rulesPath: candidate,
        sha: file.sha,
        content: file.content,
        exists: true,
      };
    }
  }

  return {
    directoryPath: directory,
    rulesPath: `${directory}/formats.md`,
    content: defaultDirectoryRules(directory),
    exists: false,
  };
}

export function defaultDirectoryRules(directoryPath: string): string {
  const name = directoryPath.split('/').pop()?.replace(/[-_]+/g, ' ') ?? 'Lore Directory';
  return [
    '---',
    `title: ${name} Formats`,
    `slug: ${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-formats`,
    'documentType: Directory Formatting Rules',
    'canonLevel: non-core',
    'authorGithub: system',
    'loreTags:',
    '  - formats',
    'created: "2026-05-06T00:00:00.000Z"',
    'updated: "2026-05-06T00:00:00.000Z"',
    'sourcePr: seed',
    '---',
    '',
    `# ${name} Formats`,
    '',
    'Documents in this directory should read like in-universe archive material.',
    'Use clear section headings, preserve concrete facts, and redact sensitive material with [REDACTED].',
  ].join('\n');
}

async function listWikiMarkdownFiles(): Promise<Array<{path: string; sha?: string}>> {
  if (env('GITHUB_REPO_OWNER') && env('GITHUB_REPO_NAME') && env('GITHUB_APP_ID')) {
    const tree = await listRepositoryTree();
    return tree
      .filter((entry) => entry.type === 'blob' && /\.(md|mdx)$/.test(entry.path))
      .map((entry) => ({path: entry.path, sha: entry.sha}));
  }

  const files: Array<{path: string; sha?: string}> = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
        files.push({path: normalizeWikiPath(fullPath)});
      }
    }
  };
  visit('docs');
  return files;
}

async function titleForFile(filePath: string): Promise<string> {
  const file = await readWikiFile(filePath);
  if (!file) return filePath.split('/').pop() ?? filePath;

  try {
    const data = readFrontMatter(file.content);
    return typeof data.title === 'string' ? data.title : parseWikiMarkdown(file.content).frontMatter.title;
  } catch {
    return filePath.split('/').pop() ?? filePath;
  }
}

async function readWikiFile(filePath: string): Promise<{path: string; sha?: string; content: string} | null> {
  if (env('GITHUB_REPO_OWNER') && env('GITHUB_REPO_NAME') && env('GITHUB_APP_ID')) {
    return getRepositoryContent(filePath);
  }
  if (!fs.existsSync(filePath)) return null;
  return {path: filePath, content: fs.readFileSync(filePath, 'utf8')};
}

function ensureDirectory(
  directories: Map<string, WikiDirectoryNode>,
  directoryPath: string,
): WikiDirectoryNode {
  const normalized = normalizeWikiPath(directoryPath);
  const existing = directories.get(normalized);
  if (existing) return existing;

  const node: WikiDirectoryNode = {
    path: normalized,
    name: normalized.split('/').pop()?.replace(/[-_]+/g, ' ') ?? normalized,
    hasRules: false,
    files: [],
  };
  directories.set(normalized, node);
  return node;
}

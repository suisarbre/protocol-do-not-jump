import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {embedText} from '../server/gemini';
import {extractKeywords, type LoreIndex, type LoreIndexEntry} from '../server/loreIndex';
import {parseWikiMarkdown} from '../server/markdown';
import {listMarkdownFiles, toPosix} from './file-utils';

const outputPath = path.join('static', 'lore-index', 'index.json');

void main();

async function main(): Promise<void> {
  const existing = readExistingIndex();
  const existingByPath = new Map(existing.entries.map((entry) => [entry.path, entry]));
  const markdownFiles = listMarkdownFiles();
  const changedFiles = getChangedMarkdownFiles(markdownFiles);
  const changedSet = new Set(changedFiles);
  const nextEntries: LoreIndexEntry[] = [];

  for (const file of markdownFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const contentHash = sha256(content);
    const previous = existingByPath.get(file);

    if (previous && previous.contentHash === contentHash && !changedSet.has(file)) {
      nextEntries.push(previous);
      continue;
    }

    const parsed = parseWikiMarkdown(content);
    const searchable = `${parsed.frontMatter.title}\n${parsed.frontMatter.loreTags.join(' ')}\n${parsed.body}`;
    const entry: LoreIndexEntry = {
      path: file,
      title: parsed.frontMatter.title,
      slug: parsed.frontMatter.slug,
      canonLevel: parsed.frontMatter.canonLevel,
      documentType: parsed.frontMatter.documentType,
      loreTags: parsed.frontMatter.loreTags,
      keywords: extractKeywords(searchable),
      excerpt: parsed.body.replace(/\s+/g, ' ').slice(0, 260),
      contentHash,
      embedding: await embedText(searchable),
      updated: parsed.frontMatter.updated,
    };
    nextEntries.push(entry);
  }

  const sortedEntries = nextEntries.sort((a, b) => a.path.localeCompare(b.path));
  const entriesChanged = JSON.stringify(sortedEntries) !== JSON.stringify(existing.entries);
  const nextIndex: LoreIndex = {
    version: 1,
    generatedAt: entriesChanged ? new Date().toISOString() : existing.generatedAt,
    entries: sortedEntries,
  };

  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(nextIndex, null, 2)}\n`);

  console.log(
    `Lore index updated: ${nextIndex.entries.length} entries, ${changedFiles.length || markdownFiles.length} changed candidate(s).`,
  );
}

function readExistingIndex(): LoreIndex {
  if (!fs.existsSync(outputPath)) {
    return {version: 1, generatedAt: new Date(0).toISOString(), entries: []};
  }
  return JSON.parse(fs.readFileSync(outputPath, 'utf8')) as LoreIndex;
}

function getChangedMarkdownFiles(allFiles: string[]): string[] {
  if (process.env.FULL_INDEX === 'true') return allFiles;

  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA ?? 'HEAD';
  if (!base) return allFiles;

  try {
    const output = execFileSync('git', ['diff', '--name-only', base, head, '--', 'docs'], {
      encoding: 'utf8',
    });
    const changed = output
      .split(/\r?\n/)
      .map(toPosix)
      .filter((file) => /\.(md|mdx)$/.test(file));
    return changed.length ? changed : [];
  } catch {
    return allFiles;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

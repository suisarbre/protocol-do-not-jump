import fs from 'node:fs';
import path from 'node:path';
import {embedText} from './gemini';
import type {LoreCitation} from './types';

export type LoreIndexEntry = {
  path: string;
  title: string;
  slug: string;
  canonLevel: 'core' | 'non-core';
  documentType: string;
  loreTags: string[];
  keywords: string[];
  excerpt: string;
  contentHash: string;
  embedding: number[];
  updated: string;
};

export type LoreIndex = {
  version: 1;
  generatedAt: string;
  entries: LoreIndexEntry[];
};

const indexPath = path.join(process.cwd(), 'static', 'lore-index', 'index.json');

export function readLoreIndex(): LoreIndex {
  if (!fs.existsSync(indexPath)) {
    return {version: 1, generatedAt: new Date(0).toISOString(), entries: []};
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf8')) as LoreIndex;
}

export async function findLoreMatches(text: string, limit = 5): Promise<LoreCitation[]> {
  const index = readLoreIndex();
  const queryKeywords = new Set(extractKeywords(text));
  const queryEmbedding = await embedText(text);

  return index.entries
    .map((entry) => {
      const keywordScore =
        entry.keywords.filter((keyword) => queryKeywords.has(keyword)).length /
        Math.max(1, queryKeywords.size);
      const vectorScore = cosineSimilarity(queryEmbedding, entry.embedding);
      return {
        path: entry.path,
        title: entry.title,
        excerpt: entry.excerpt,
        score: Number((keywordScore * 0.55 + vectorScore * 0.45).toFixed(4)),
      };
    })
    .filter((entry) => entry.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function extractKeywords(text: string): string[] {
  const stop = new Set([
    'about',
    'after',
    'again',
    'also',
    'and',
    'are',
    'but',
    'for',
    'from',
    'into',
    'the',
    'this',
    'that',
    'their',
    'then',
    'with',
    'within',
  ]);

  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3 && !stop.has(word))
        .slice(0, 80),
    ),
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i]! * b[i]!;
    aMag += a[i]! * a[i]!;
    bMag += b[i]! * b[i]!;
  }

  if (!aMag || !bMag) return 0;
  return (dot / (Math.sqrt(aMag) * Math.sqrt(bMag)) + 1) / 2;
}

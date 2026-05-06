import {generateGeminiText} from './gemini';
import {findLoreMatches} from './loreIndex';
import {readFrontMatter, writeWikiMarkdown, type WikiFrontMatter} from './markdown';
import {moderateText} from './moderation';
import {pathForNewLoreInDirectory, slugifyTitle} from './paths';
import {readDirectoryRules} from './wikiTree';
import type {LoreCitation, ModerationReport, RiskLevel, Session} from './types';

export type Operation = 'new' | 'edit';

export type ProcessDraftInput = {
  text: string;
  directoryPath: string;
  operation: Operation;
  targetPath?: string;
  baseBlobSha?: string;
};

export type ProcessDraftResult = {
  formattedMarkdown: string;
  title: string;
  slug: string;
  targetPath: string;
  moderation: ModerationReport;
  loreFindings: LoreCitation[];
  riskLevel: RiskLevel;
  directoryRulesPath: string;
};

export async function processDraft(
  input: ProcessDraftInput,
  session: Session,
): Promise<ProcessDraftResult> {
  const moderated = moderateText(input.text);
  const loreFindings = await findLoreMatches(moderated.text);
  const directoryRules = await readDirectoryRules(input.directoryPath);
  const title = inferTitle(input.text);
  const slug = slugifyTitle(title);
  const now = new Date().toISOString();
  const frontMatter: WikiFrontMatter = {
    title,
    slug,
    documentType: inferDocumentType(directoryRules.content),
    canonLevel: 'non-core',
    authorGithub: session.user.login,
    loreTags: extractLoreTags(moderated.text),
    created: now,
    updated: now,
    sourcePr: 'pending',
  };

  const aiMarkdown = await generateGeminiText(
    systemPrompt(directoryRules.content),
    userPrompt(moderated.text, loreFindings, frontMatter, directoryRules),
  );

  const body = aiMarkdown ? stripFrontMatter(aiMarkdown) : fallbackBody(moderated.text, loreFindings, directoryRules.content);
  const existingFrontMatter = readFrontMatter(aiMarkdown ?? '') as Partial<WikiFrontMatter>;
  const formattedMarkdown = writeWikiMarkdown(
    {
      ...frontMatter,
      title: typeof existingFrontMatter.title === 'string' ? existingFrontMatter.title : frontMatter.title,
      slug: typeof existingFrontMatter.slug === 'string' ? existingFrontMatter.slug : frontMatter.slug,
      loreTags: Array.isArray(existingFrontMatter.loreTags)
        ? existingFrontMatter.loreTags.map(String)
        : frontMatter.loreTags,
    },
    body,
  );

  const finalFrontMatter = readFrontMatter(formattedMarkdown) as WikiFrontMatter;
  const riskLevel: RiskLevel =
    moderated.report.rating === 'blocked'
      ? 'high'
      : loreFindings.some((finding) => finding.score > 0.82)
        ? 'medium'
        : moderated.report.rating === 'redacted'
          ? 'medium'
          : 'low';

  return {
    formattedMarkdown,
    title: finalFrontMatter.title,
    slug: finalFrontMatter.slug,
    targetPath: input.targetPath ?? pathForNewLoreInDirectory(input.directoryPath, finalFrontMatter.title),
    moderation: moderated.report,
    loreFindings,
    riskLevel,
    directoryRulesPath: directoryRules.rulesPath,
  };
}

function inferTitle(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return (firstLine ?? 'Untitled Entry').slice(0, 80);
}

function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, '').trim();
}

function extractLoreTags(text: string): string[] {
  return Array.from(
    new Set(
      text
        .match(/\b[A-Z][A-Za-z0-9-]{3,}\b/g)
        ?.map((tag) => tag.toLowerCase())
        .slice(0, 8) ?? [],
    ),
  );
}

function systemPrompt(formatRules: string): string {
  return [
    'You format collaborative science-fiction wiki drafts according to the selected lore directory rules.',
    'Return Markdown only.',
    'Keep the content Teen / PG-13.',
    'Preserve useful lore ideas, but avoid declaring anything as core canon.',
    'Use thematic redactions like [REDACTED] where appropriate.',
    '',
    'Directory formatting rules:',
    formatRules,
  ].join('\n');
}

function userPrompt(
  text: string,
  loreFindings: LoreCitation[],
  frontMatter: WikiFrontMatter,
  directoryRules: {directoryPath: string; rulesPath: string},
): string {
  return [
    'Draft to format:',
    text,
    '',
    'Required front matter:',
    JSON.stringify(frontMatter, null, 2),
    '',
    'Relevant lore citations:',
    JSON.stringify(loreFindings, null, 2),
    '',
    `Selected directory: ${directoryRules.directoryPath}`,
    `Rules source: ${directoryRules.rulesPath}`,
  ].join('\n');
}

function fallbackBody(text: string, loreFindings: LoreCitation[], formatRules: string): string {
  return [
    '## Directory Format Basis',
    summarizeRules(formatRules),
    '',
    '## Entry',
    text,
    '',
    '## Archive Notes',
    'The submission is retained as non-core lore pending automated and human review.',
    '',
    '## Lore Cross-References',
    loreSummary(loreFindings),
  ].join('\n\n');
}

function inferDocumentType(formatRules: string): string {
  const frontMatter = readFrontMatter(formatRules);
  if (typeof frontMatter.title === 'string') return frontMatter.title.replace(/\s+Formats?$/i, '');

  const heading = formatRules.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading?.replace(/\s+Formats?$/i, '') || 'Directory-Guided Document';
}

function summarizeRules(formatRules: string): string {
  return stripFrontMatter(formatRules).split(/\r?\n/).filter(Boolean).slice(0, 4).join('\n');
}

function loreSummary(loreFindings: LoreCitation[]): string {
  if (!loreFindings.length) return 'No direct canon conflicts were detected in the current index.';
  return loreFindings
    .map((finding) => `- ${finding.title} (${finding.path}) similarity ${finding.score}`)
    .join('\n');
}

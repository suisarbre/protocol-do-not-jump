import matter from 'gray-matter';
import {z} from 'zod';
import {HttpError} from './errors';

export const frontMatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  documentType: z.string().min(1),
  canonLevel: z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() : value),
    z.enum(['core', 'non-core']),
  ),
  authorGithub: z.string().min(1),
  loreTags: z.array(z.string()).default([]),
  created: z.string().min(1),
  updated: z.string().min(1),
  sourcePr: z.string().min(1),
});

export type WikiFrontMatter = z.infer<typeof frontMatterSchema>;

export type ParsedMarkdown = {
  frontMatter: WikiFrontMatter;
  body: string;
};

export function parseWikiMarkdown(markdown: string): ParsedMarkdown {
  const parsed = matter(markdown);
  const result = frontMatterSchema.safeParse(parsed.data);
  if (!result.success) {
    throw new HttpError(
      400,
      'invalid_front_matter',
      `Markdown front matter is missing required wiki fields: ${result.error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ')}`,
    );
  }

  return {
    frontMatter: result.data,
    body: parsed.content.trim(),
  };
}

export function readFrontMatter(markdown: string): Record<string, unknown> {
  return matter(markdown).data;
}

export function writeWikiMarkdown(frontMatter: WikiFrontMatter, body: string): string {
  return matter.stringify(`${body.trim()}\n`, frontMatter).replace(/\n{3,}/g, '\n\n');
}

export function withFrontMatter(
  markdown: string,
  updater: (frontMatter: WikiFrontMatter) => WikiFrontMatter,
): string {
  const parsed = parseWikiMarkdown(markdown);
  return writeWikiMarkdown(updater(parsed.frontMatter), parsed.body);
}

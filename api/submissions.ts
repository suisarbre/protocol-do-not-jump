import {z} from 'zod';
import {config} from '../server/env';
import {HttpError} from '../server/errors';
import {
  addPullRequestLabels,
  createBranch,
  getBaseBranchSha,
  getRepositoryContent,
  openPullRequest,
  putRepositoryFile,
} from '../server/github';
import {method, readJson, sendJson, withApi} from '../server/http';
import {parseWikiMarkdown, withFrontMatter} from '../server/markdown';
import {assertFreshEdit, evaluateSubmissionSafety} from '../server/submissionRules';
import {consumeCooldown, getCooldowns} from '../server/rateLimit';
import {pathForNewLore, assertEditableWikiPath} from '../server/paths';
import {requireSession} from '../server/session';
import type {ApiRequest, ApiResponse} from '../server/types';

const submissionSchema = z.object({
  operation: z.enum(['new', 'edit']),
  markdown: z.string().min(1).max(120_000),
  targetPath: z.string().optional(),
  baseBlobSha: z.string().optional(),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const input = submissionSchema.parse(await readJson(req));
    await consumeCooldown('submit', session, req);

    const parsed = parseWikiMarkdown(input.markdown);
    const targetPath = assertEditableWikiPath(input.targetPath ?? pathForNewLore(parsed.frontMatter.title));
    const existingFile = await getRepositoryContent(targetPath);

    if (input.operation === 'edit') {
      if (!existingFile) {
        throw new HttpError(404, 'file_not_found', 'The document you tried to edit no longer exists.');
      }
      assertFreshEdit(input.baseBlobSha, existingFile.sha);
    } else if (existingFile) {
      throw new HttpError(409, 'path_exists', 'A document already exists at this path.');
    }

    const safety = evaluateSubmissionSafety(input.markdown, targetPath);
    const branch = `lorewiki/${session.user.login}/${Date.now()}`;
    const baseSha = await getBaseBranchSha();
    await createBranch(branch, baseSha);

    const initialMarkdown = withFrontMatter(input.markdown, (frontMatter) => ({
      ...frontMatter,
      authorGithub: session.user.login,
      updated: new Date().toISOString(),
      sourcePr: 'pending',
    }));

    const initialCommit = await putRepositoryFile({
      path: targetPath,
      branch,
      message: `${input.operation === 'edit' ? 'Edit' : 'Add'} ${parsed.frontMatter.title}`,
      content: initialMarkdown,
      sha: existingFile?.sha,
    });

    const pull = await openPullRequest({
      branch,
      title: `${input.operation === 'edit' ? 'Edit' : 'Add'}: ${parsed.frontMatter.title}`,
      body: buildPullRequestBody({
        operation: input.operation,
        targetPath,
        author: session.user.login,
        safe: safety.safe,
        riskLevel: safety.riskLevel,
        reasons: safety.reasons,
      }),
    });

    const finalMarkdown = withFrontMatter(initialMarkdown, (frontMatter) => ({
      ...frontMatter,
      sourcePr: pull.html_url,
    }));
    await putRepositoryFile({
      path: targetPath,
      branch,
      message: `Record source PR for ${parsed.frontMatter.title}`,
      content: finalMarkdown,
      sha: initialCommit.content.sha,
    });

    const labels = ['lore-submission', 'ai-reviewed', safety.riskLevel];
    if (safety.safe) labels.push('ai-safe-automerge');
    await addPullRequestLabels(pull.number, labels);

    sendJson(res, 200, {
      pullRequestUrl: pull.html_url,
      pullRequestNumber: pull.number,
      targetPath,
      mergeStatus: safety.safe ? 'queued_for_safe_automerge' : 'requires_admin_review',
      riskLevel: safety.riskLevel,
      reasons: safety.reasons,
      repository: `${config.githubOwner()}/${config.githubRepo()}`,
      cooldowns: await getCooldowns(session, req),
    });
  });
}

function escapeMd(s: string): string {
  return s.replace(/[|`[\]]/g, (c) => `\\${c}`);
}

function buildPullRequestBody(input: {
  operation: string;
  targetPath: string;
  author: string;
  safe: boolean;
  riskLevel: string;
  reasons: string[];
}): string {
  return [
    '## AI Lore Submission',
    '',
    `- Operation: ${input.operation}`,
    `- Target path: \`${escapeMd(input.targetPath)}\``,
    `- Contributor: @${escapeMd(input.author)}`,
    `- Risk level: ${input.riskLevel}`,
    `- Auto-merge eligible: ${input.safe ? 'yes' : 'no'}`,
    '',
    '## Review Notes',
    input.reasons.length ? input.reasons.map((reason) => `- ${escapeMd(reason)}`).join('\n') : '- No blocking issues detected.',
  ].join('\n');
}

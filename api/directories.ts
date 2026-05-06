import {z} from 'zod';
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
import {assertFreshEdit} from '../server/submissionRules';
import {consumeCooldown, getCooldowns} from '../server/rateLimit';
import {assertEditableDirectoryPath, assertEditableDirectoryRulePath} from '../server/paths';
import {requireSession} from '../server/session';
import type {ApiRequest, ApiResponse} from '../server/types';

const directorySchema = z.object({
  directoryPath: z.string().min(1),
  rulesPath: z.string().optional(),
  markdown: z.string().min(1).max(80_000),
  baseBlobSha: z.string().optional(),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const input = directorySchema.parse(await readJson(req));
    await consumeCooldown('submit', session, req);

    const directoryPath = assertEditableDirectoryPath(input.directoryPath);
    const rulesPath = assertEditableDirectoryRulePath(input.rulesPath ?? `${directoryPath}/formats.md`);
    if (!rulesPath.startsWith(`${directoryPath}/`)) {
      throw new HttpError(400, 'invalid_path', 'Rules file must be inside the selected directory.');
    }

    const existingFile = await getRepositoryContent(rulesPath);
    if (existingFile) {
      assertFreshEdit(input.baseBlobSha, existingFile.sha);
    }

    const parsed = parseWikiMarkdown(input.markdown);
    const branch = `lorewiki/${session.user.login}/directory-${Date.now()}`;
    const baseSha = await getBaseBranchSha();
    await createBranch(branch, baseSha);

    const initialMarkdown = withFrontMatter(input.markdown, (frontMatter) => ({
      ...frontMatter,
      authorGithub: session.user.login,
      canonLevel: 'non-core',
      updated: new Date().toISOString(),
      sourcePr: 'pending',
    }));

    const initialCommit = await putRepositoryFile({
      path: rulesPath,
      branch,
      message: `${existingFile ? 'Edit' : 'Add'} directory rules for ${directoryPath}`,
      content: initialMarkdown,
      sha: existingFile?.sha,
    });

    const pull = await openPullRequest({
      branch,
      title: `${existingFile ? 'Edit' : 'Add'} directory rules: ${parsed.frontMatter.title}`,
      body: [
        '## Lore Directory Rules',
        '',
        `- Directory: \`${directoryPath}\``,
        `- Rules file: \`${rulesPath}\``,
        `- Contributor: @${session.user.login}`,
      ].join('\n'),
    });

    const finalMarkdown = withFrontMatter(initialMarkdown, (frontMatter) => ({
      ...frontMatter,
      sourcePr: pull.html_url,
    }));
    await putRepositoryFile({
      path: rulesPath,
      branch,
      message: `Record source PR for ${parsed.frontMatter.title}`,
      content: finalMarkdown,
      sha: initialCommit.content.sha,
    });

    await addPullRequestLabels(pull.number, ['directory-rules', 'ai-reviewed']);

    sendJson(res, 200, {
      pullRequestUrl: pull.html_url,
      pullRequestNumber: pull.number,
      directoryPath,
      rulesPath,
      mergeStatus: 'requires_admin_review',
      cooldowns: await getCooldowns(session, req),
    });
  });
}

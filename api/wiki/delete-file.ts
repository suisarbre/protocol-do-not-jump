import {z} from 'zod';
import {isAdmin} from '../../server/admin';
import {createBranch, deleteRepositoryFile, getBaseBranchSha, openPullRequest} from '../../server/github';
import {HttpError} from '../../server/errors';
import {method, readJson, sendJson, withApi} from '../../server/http';
import {assertEditableWikiPath} from '../../server/paths';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {requireSession} from '../../server/session';
import type {ApiRequest, ApiResponse} from '../../server/types';

const schema = z.object({
  path: z.string().min(1).max(500),
  sha: z.string().min(1),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    if (!isAdmin(session)) {
      throw new HttpError(403, 'admin_required', 'Only admins can delete files.');
    }

    const input = schema.parse(await readJson(req));
    await consumeCooldown('submit', session, req);

    const filePath = assertEditableWikiPath(input.path);
    const fileName = filePath.split('/').pop() ?? filePath;
    const branch = `lorewiki/${session.user.login}/del-file-${Date.now()}`;

    const baseSha = await getBaseBranchSha();
    await createBranch(branch, baseSha);
    await deleteRepositoryFile({
      path: filePath,
      branch,
      message: `Delete: ${fileName}`,
      sha: input.sha,
    });

    const pull = await openPullRequest({
      branch,
      title: `Delete: ${fileName}`,
      body: `## Archive Document Deletion\n\n- Path: \`${filePath}\`\n- Deleted by: @${session.user.login}`,
    });

    sendJson(res, 200, {
      pullRequestUrl: pull.html_url,
      pullRequestNumber: pull.number,
      cooldowns: await getCooldowns(session, req),
    });
  });
}

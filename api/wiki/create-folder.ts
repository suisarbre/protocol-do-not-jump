import {z} from 'zod';
import {createBranch, getBaseBranchSha, openPullRequest, putRepositoryFile} from '../../server/github';
import {method, readJson, sendJson, withApi} from '../../server/http';
import {assertEditableDirectoryPath} from '../../server/paths';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {requireSession} from '../../server/session';
import type {ApiRequest, ApiResponse} from '../../server/types';

const schema = z.object({
  path: z.string().min(1).max(200),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    const session = requireSession(req);
    const input = schema.parse(await readJson(req));
    await consumeCooldown('submit', session, req);

    const dirPath = assertEditableDirectoryPath(input.path);
    const folderName = dirPath.split('/').pop() ?? dirPath;
    const gitkeepPath = `${dirPath}/.gitkeep`;
    const branch = `lorewiki/${session.user.login}/folder-${Date.now()}`;

    const baseSha = await getBaseBranchSha();
    await createBranch(branch, baseSha);
    await putRepositoryFile({
      path: gitkeepPath,
      branch,
      message: `Create folder: ${folderName}`,
      content: '',
    });

    const pull = await openPullRequest({
      branch,
      title: `Create folder: ${folderName}`,
      body: `## New Archive Directory\n\n- Path: \`${dirPath}\`\n- Created by: @${session.user.login}`,
    });

    sendJson(res, 200, {
      pullRequestUrl: pull.html_url,
      pullRequestNumber: pull.number,
      cooldowns: await getCooldowns(session, req),
    });
  });
}

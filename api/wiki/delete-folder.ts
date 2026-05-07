import {z} from 'zod';
import {isAdmin} from '../../server/admin';
import {
  createBranch,
  deleteRepositoryFile,
  getBaseBranchSha,
  getRepositoryContent,
  listRepositoryTree,
  openPullRequest,
} from '../../server/github';
import {HttpError} from '../../server/errors';
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
    if (!isAdmin(session)) {
      throw new HttpError(403, 'admin_required', 'Only admins can delete folders.');
    }

    const input = schema.parse(await readJson(req));
    await consumeCooldown('submit', session, req);

    const dirPath = assertEditableDirectoryPath(input.path);
    const folderName = dirPath.split('/').pop() ?? dirPath;
    const prefix = `${dirPath}/`;

    const tree = await listRepositoryTree();
    const nonKeepFiles = tree.filter(
      (entry) => entry.path.startsWith(prefix) && entry.type === 'blob' && !entry.path.endsWith('/.gitkeep'),
    );

    if (nonKeepFiles.length > 0) {
      throw new HttpError(422, 'folder_not_empty', 'Remove all documents from this folder before deleting it.');
    }

    const gitkeep = await getRepositoryContent(`${dirPath}/.gitkeep`);
    if (!gitkeep) {
      throw new HttpError(404, 'folder_not_found', 'Folder does not exist or has no placeholder file.');
    }

    const branch = `lorewiki/${session.user.login}/del-folder-${Date.now()}`;
    const baseSha = await getBaseBranchSha();
    await createBranch(branch, baseSha);
    await deleteRepositoryFile({
      path: gitkeep.path,
      branch,
      message: `Delete folder: ${folderName}`,
      sha: gitkeep.sha,
    });

    const pull = await openPullRequest({
      branch,
      title: `Delete folder: ${folderName}`,
      body: `## Archive Directory Deletion\n\n- Path: \`${dirPath}\`\n- Deleted by: @${session.user.login}\n- Folder was empty at time of deletion.`,
    });

    sendJson(res, 200, {
      pullRequestUrl: pull.html_url,
      pullRequestNumber: pull.number,
      cooldowns: await getCooldowns(session, req),
    });
  });
}

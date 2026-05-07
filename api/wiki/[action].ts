import {z} from 'zod';
import {isAdmin} from '../../server/admin';
import {
  createBranch,
  deleteRepositoryFile,
  getBaseBranchSha,
  getRepositoryContent,
  listRepositoryTree,
  openPullRequest,
  putRepositoryFile,
} from '../../server/github';
import {HttpError} from '../../server/errors';
import {getQueryValue, method, readJson, sendJson, withApi} from '../../server/http';
import {assertEditableDirectoryPath, assertWikiMarkdownPath} from '../../server/paths';
import {consumeCooldown, getCooldowns} from '../../server/rateLimit';
import {requireSession} from '../../server/session';
import type {ApiRequest, ApiResponse} from '../../server/types';

const createFolderSchema = z.object({
  path: z.string().min(1).max(200),
});

const deleteFolderSchema = z.object({
  path: z.string().min(1).max(200),
});

const deleteFileSchema = z.object({
  path: z.string().min(1).max(500),
  sha: z.string().min(1),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    const action = getQueryValue(req, 'action');

    if (action === 'create-folder') {
      method(req, 'POST');
      const session = requireSession(req);
      const input = createFolderSchema.parse(await readJson(req));
      await consumeCooldown('submit', session, req);

      const dirPath = assertEditableDirectoryPath(input.path);
      const folderName = dirPath.split('/').pop() ?? dirPath;
      const gitkeepPath = `${dirPath}/.gitkeep`;
      const branch = `lorewiki/${session.user.login}/folder-${Date.now()}`;

      const baseSha = await getBaseBranchSha();
      await createBranch(branch, baseSha);
      await putRepositoryFile({path: gitkeepPath, branch, message: `Create folder: ${folderName}`, content: ''});

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
      return;
    }

    if (action === 'delete-folder') {
      method(req, 'POST');
      const session = requireSession(req);
      if (!isAdmin(session)) {
        throw new HttpError(403, 'admin_required', 'Only admins can delete folders.');
      }
      const input = deleteFolderSchema.parse(await readJson(req));
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
      await deleteRepositoryFile({path: gitkeep.path, branch, message: `Delete folder: ${folderName}`, sha: gitkeep.sha});

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
      return;
    }

    if (action === 'delete-file') {
      method(req, 'POST');
      const session = requireSession(req);
      if (!isAdmin(session)) {
        throw new HttpError(403, 'admin_required', 'Only admins can delete files.');
      }
      const input = deleteFileSchema.parse(await readJson(req));
      await consumeCooldown('submit', session, req);

      const filePath = assertWikiMarkdownPath(input.path);
      const fileName = filePath.split('/').pop() ?? filePath;
      const branch = `lorewiki/${session.user.login}/del-file-${Date.now()}`;

      const baseSha = await getBaseBranchSha();
      await createBranch(branch, baseSha);
      await deleteRepositoryFile({path: filePath, branch, message: `Delete: ${fileName}`, sha: input.sha});

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
      return;
    }

    res.statusCode = 404;
    res.end();
  });
}

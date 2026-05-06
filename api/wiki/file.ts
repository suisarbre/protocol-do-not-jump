import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {HttpError} from '../../server/errors';
import {env} from '../../server/env';
import {getRepositoryContent} from '../../server/github';
import {getQueryValue, method, sendJson, withApi} from '../../server/http';
import {assertEditableWikiPath} from '../../server/paths';
import {requireSession} from '../../server/session';
import type {ApiRequest, ApiResponse} from '../../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'GET');
    requireSession(req);
    const requestedPath = getQueryValue(req, 'path');
    if (!requestedPath) {
      throw new HttpError(400, 'missing_path', 'Missing wiki file path.');
    }

    const wikiPath = assertEditableWikiPath(requestedPath);
    const file = await readWikiFile(wikiPath);
    if (!file) {
      throw new HttpError(404, 'file_not_found', 'Wiki file was not found.');
    }

    sendJson(res, 200, file);
  });
}

async function readWikiFile(wikiPath: string) {
  if (env('GITHUB_REPO_OWNER') && env('GITHUB_REPO_NAME') && env('GITHUB_APP_ID')) {
    return getRepositoryContent(wikiPath);
  }

  if (!fs.existsSync(wikiPath)) return null;
  const content = fs.readFileSync(wikiPath, 'utf8');
  return {
    path: wikiPath,
    sha: createHash('sha1').update(content).digest('hex'),
    content,
  };
}

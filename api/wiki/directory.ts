import {HttpError} from '../../server/errors';
import {getQueryValue, method, sendJson, withApi} from '../../server/http';
import {readDirectoryRules} from '../../server/wikiTree';
import type {ApiRequest, ApiResponse} from '../../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'GET');
    const directoryPath = getQueryValue(req, 'path');
    if (!directoryPath) {
      throw new HttpError(400, 'missing_path', 'Missing lore directory path.');
    }
    sendJson(res, 200, await readDirectoryRules(directoryPath));
  });
}

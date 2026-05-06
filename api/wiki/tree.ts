import {getWikiTree} from '../../server/wikiTree';
import {method, sendJson, withApi} from '../../server/http';
import type {ApiRequest, ApiResponse} from '../../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'GET');
    sendJson(res, 200, {directories: await getWikiTree()});
  });
}

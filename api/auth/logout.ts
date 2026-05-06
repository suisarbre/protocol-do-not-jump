import {method, sendJson, withApi} from '../../server/http';
import {clearSessionCookie} from '../../server/session';
import type {ApiRequest, ApiResponse} from '../../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'POST');
    res.setHeader('Set-Cookie', clearSessionCookie());
    sendJson(res, 200, {ok: true});
  });
}

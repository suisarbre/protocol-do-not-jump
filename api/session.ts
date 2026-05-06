import {getCooldowns} from '../server/rateLimit';
import {getSession} from '../server/session';
import {method, sendJson, withApi} from '../server/http';
import type {ApiRequest, ApiResponse} from '../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    method(req, 'GET');
    const session = getSession(req);
    sendJson(res, 200, {
      authenticated: Boolean(session),
      user: session?.user ?? null,
      cooldowns: session ? await getCooldowns(session, req) : null,
    });
  });
}

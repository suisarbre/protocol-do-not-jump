import {githubAuthorizeUrl} from '../../../server/github';
import {withApi} from '../../../server/http';
import {createOAuthStateCookie} from '../../../server/session';
import type {ApiRequest, ApiResponse} from '../../../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    const {state, cookie} = createOAuthStateCookie();
    res.setHeader('Set-Cookie', cookie);
    res.statusCode = 302;
    res.setHeader('Location', githubAuthorizeUrl(state));
    res.end();
  });
}

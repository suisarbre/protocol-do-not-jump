import {env} from '../../../server/env';
import {exchangeGithubCode, fetchGithubUser, githubAuthorizeUrl} from '../../../server/github';
import {getQueryValue, withApi} from '../../../server/http';
import {
  clearOAuthStateCookie,
  createOAuthStateCookie,
  createSessionCookie,
  verifyOAuthState,
} from '../../../server/session';
import type {ApiRequest, ApiResponse} from '../../../server/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withApi(req, res, async () => {
    const action = getQueryValue(req, 'action');

    if (action === 'start') {
      const {state, cookie} = createOAuthStateCookie();
      res.setHeader('Set-Cookie', cookie);
      res.statusCode = 302;
      res.setHeader('Location', githubAuthorizeUrl(state));
      res.end();
      return;
    }

    if (action === 'callback') {
      const code = getQueryValue(req, 'code');
      const state = getQueryValue(req, 'state');
      if (!code) {
        res.statusCode = 302;
        res.setHeader('Location', `${env('CONTRIBUTOR_REDIRECT_URL', '/')}?auth=failed`);
        res.end();
        return;
      }
      verifyOAuthState(req, state);
      const accessToken = await exchangeGithubCode(code);
      const user = await fetchGithubUser(accessToken);
      res.setHeader('Set-Cookie', [createSessionCookie(user), clearOAuthStateCookie()]);
      res.statusCode = 302;
      res.setHeader('Location', env('CONTRIBUTOR_REDIRECT_URL', '/'));
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end();
  });
}

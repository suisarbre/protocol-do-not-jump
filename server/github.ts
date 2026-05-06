import {createSign} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {config, env, requiredEnv} from './env';
import {HttpError} from './errors';

type GithubToken = {
  token: string;
  expiresAt: number;
};

type GithubUserResponse = {
  id: number;
  login: string;
  name?: string;
  avatar_url?: string;
};

type GithubContentResponse = {
  type: string;
  sha: string;
  content?: string;
  encoding?: string;
  path: string;
};

type GithubRefResponse = {
  object: {sha: string};
};

type GithubPutFileResponse = {
  content: {sha: string; path: string};
  commit: {sha: string; html_url: string};
};

type GithubPullResponse = {
  number: number;
  html_url: string;
  mergeable?: boolean | null;
  mergeable_state?: string;
};

type GithubTreeResponse = {
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
    url: string;
  }>;
  truncated: boolean;
};

let appTokenCache: GithubToken | null = null;

export async function exchangeGithubCode(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: requiredEnv('GITHUB_CLIENT_ID'),
      client_secret: requiredEnv('GITHUB_CLIENT_SECRET'),
      code,
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, 'github_oauth_failed', 'GitHub sign-in failed.');
  }

  const payload = (await response.json()) as {access_token?: string; error?: string};
  if (!payload.access_token) {
    throw new HttpError(401, 'github_oauth_failed', payload.error ?? 'GitHub sign-in failed.');
  }

  return payload.access_token;
}

export async function fetchGithubUser(accessToken: string) {
  const user = await githubFetch<GithubUserResponse>('GET', '/user', undefined, accessToken);
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
}

export async function getRepositoryContent(filePath: string, ref = config.githubBaseBranch()) {
  try {
    const content = await repoFetch<GithubContentResponse>(
      'GET',
      `/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(ref)}`,
    );

    if (content.type !== 'file' || content.encoding !== 'base64' || !content.content) {
      throw new HttpError(404, 'file_not_found', 'Wiki file was not found.');
    }

    return {
      path: content.path,
      sha: content.sha,
      content: Buffer.from(content.content, 'base64').toString('utf8'),
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

export async function getBaseBranchSha(): Promise<string> {
  const ref = await repoFetch<GithubRefResponse>(
    'GET',
    `/git/ref/heads/${encodeURIComponent(config.githubBaseBranch())}`,
  );
  return ref.object.sha;
}

export async function listRepositoryTree(ref = config.githubBaseBranch()) {
  const tree = await repoFetch<GithubTreeResponse>(
    'GET',
    `/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  if (tree.truncated) {
    throw new HttpError(502, 'github_tree_truncated', 'The wiki tree is too large to read in one request.');
  }
  return tree.tree;
}

export async function createBranch(branch: string, sha: string): Promise<void> {
  await repoFetch('POST', '/git/refs', {
    ref: `refs/heads/${branch}`,
    sha,
  });
}

export async function putRepositoryFile(input: {
  path: string;
  branch: string;
  message: string;
  content: string;
  sha?: string;
}): Promise<GithubPutFileResponse> {
  return repoFetch<GithubPutFileResponse>('PUT', `/contents/${encodeURIComponentPath(input.path)}`, {
    message: input.message,
    content: Buffer.from(input.content, 'utf8').toString('base64'),
    branch: input.branch,
    sha: input.sha,
  });
}

export async function openPullRequest(input: {
  branch: string;
  title: string;
  body: string;
}): Promise<GithubPullResponse> {
  return repoFetch<GithubPullResponse>('POST', '/pulls', {
    title: input.title,
    body: input.body,
    head: input.branch,
    base: config.githubBaseBranch(),
    maintainer_can_modify: true,
  });
}

export async function addPullRequestLabels(issueNumber: number, labels: string[]): Promise<void> {
  try {
    await repoFetch('POST', `/issues/${issueNumber}/labels`, {labels});
  } catch {
    // Labels may not exist yet in a fresh repo. PR creation should still succeed.
  }
}

export async function repoFetch<T = unknown>(
  method: string,
  repoPath: string,
  body?: unknown,
): Promise<T> {
  const token = await getGithubAppInstallationToken();
  return githubFetch<T>(
    method,
    `/repos/${config.githubOwner()}/${config.githubRepo()}${repoPath}`,
    body,
    token,
  );
}

async function githubFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token ?? (await getGithubAppInstallationToken())}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ai-lore-wiki',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `GitHub API request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as {message?: string};
      message = payload.message ?? message;
    } catch {
      // ignore parsing failure
    }

    const status = response.status === 409 ? 409 : response.status >= 500 ? 502 : response.status;
    throw new HttpError(status, 'github_api_error', message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function getGithubAppInstallationToken(): Promise<string> {
  if (appTokenCache && appTokenCache.expiresAt - Date.now() > 60_000) {
    return appTokenCache.token;
  }

  const response = await fetch(
    `https://api.github.com/app/installations/${requiredEnv('GITHUB_APP_INSTALLATION_ID')}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${createGithubAppJwt()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ai-lore-wiki',
      },
    },
  );

  if (!response.ok) {
    throw new HttpError(502, 'github_app_auth_failed', 'GitHub App authentication failed.');
  }

  const payload = (await response.json()) as {token: string; expires_at: string};
  appTokenCache = {
    token: payload.token,
    expiresAt: new Date(payload.expires_at).getTime(),
  };
  return appTokenCache.token;
}

function createGithubAppJwt(): string {
  const now = Math.floor(Date.now() / 1000) - 60;
  const header = base64UrlJson({alg: 'RS256', typ: 'JWT'});
  const payload = base64UrlJson({
    iat: now,
    exp: now + 540,
    iss: requiredEnv('GITHUB_APP_ID'),
  });
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(requiredEnv('GITHUB_APP_PRIVATE_KEY')), 'base64url');
  return `${unsigned}.${signature}`;
}

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n');
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function encodeURIComponentPath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

export function githubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv('GITHUB_CLIENT_ID'),
    redirect_uri: env('GITHUB_CALLBACK_URL'),
    state,
    scope: 'read:user',
  });
  if (!params.get('redirect_uri')) params.delete('redirect_uri');
  return `https://github.com/login/oauth/authorize?${params}`;
}

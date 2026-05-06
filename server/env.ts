export function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function csvEnv(name: string): string[] {
  return env(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export const config = {
  githubBaseBranch: () => env('GITHUB_BASE_BRANCH', 'main'),
  githubOwner: () => requiredEnv('GITHUB_REPO_OWNER'),
  githubRepo: () => requiredEnv('GITHUB_REPO_NAME'),
  repositoryUrl: () =>
    env(
      'PUBLIC_REPOSITORY_URL',
      `https://github.com/${env('GITHUB_REPO_OWNER', 'owner')}/${env('GITHUB_REPO_NAME', 'repo')}`,
    ),
};

import {execFileSync} from 'node:child_process';

const appPatterns = [
  /^api\//,
  /^server\//,
  /^src\//,
  /^scripts\//,
  /^tests\//,
  /^\.github\//,
  /^docusaurus\.config\.ts$/,
  /^package(-lock)?\.json$/,
  /^playwright\.config\.ts$/,
  /^sidebars\.ts$/,
  /^tsconfig\.json$/,
  /^vercel\.json$/,
  /^vitest\.config\.ts$/,
  /^README\.md$/,
];

const contentOnlyPatterns = [
  /^docs\//,
  /^static\/lore-index\//,
];

const changedFiles = getChangedFiles();

if (!changedFiles.length) {
  console.log('No changed files detected; proceeding with Vercel build.');
  process.exit(1);
}

const hasAppChange = changedFiles.some((file) => appPatterns.some((pattern) => pattern.test(file)));
const onlyContentChanges = changedFiles.every((file) =>
  contentOnlyPatterns.some((pattern) => pattern.test(file)),
);

if (!hasAppChange && onlyContentChanges) {
  console.log('Only lore content/index files changed; skipping Vercel build.');
  process.exit(0);
}

console.log('App, API, config, or mixed changes detected; proceeding with Vercel build.');
process.exit(1);

function getChangedFiles() {
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'HEAD';

  try {
    if (previousSha) {
      return gitDiff(previousSha, commitSha);
    }

    return gitDiff(`${commitSha}^`, commitSha);
  } catch (error) {
    console.log(`Could not determine changed files: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

function gitDiff(base, head) {
  return execFileSync('git', ['diff', '--name-only', base, head], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((file) => file.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

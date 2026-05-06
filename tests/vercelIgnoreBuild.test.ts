import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'scripts', 'vercel-ignore-build.mjs');

describe('vercel ignore build script', () => {
  it('skips lore-only changes', () => {
    const result = runScriptWithChanges({'docs/example.md': '# Lore'});

    expect(result.status).toBe(0);
    expect(result.output).toContain('Only lore content');
  });

  it('builds app and API changes', () => {
    const result = runScriptWithChanges({'api/example.ts': 'export default null;'});

    expect(result.status).toBe(1);
    expect(result.output).toContain('proceeding');
  });

  it('builds mixed content and app changes', () => {
    const result = runScriptWithChanges({
      'docs/example.md': '# Lore',
      'src/example.ts': 'export const value = 1;',
    });

    expect(result.status).toBe(1);
  });
});

function runScriptWithChanges(files: Record<string, string>): {status: number; output: string} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-ignore-'));
  try {
    git(tempDir, ['init']);
    git(tempDir, ['config', 'user.email', 'test@example.com']);
    git(tempDir, ['config', 'user.name', 'Test User']);

    fs.writeFileSync(path.join(tempDir, 'README.md'), 'seed\n');
    git(tempDir, ['add', '.']);
    git(tempDir, ['commit', '-m', 'seed']);
    const previous = git(tempDir, ['rev-parse', 'HEAD']).trim();

    for (const [file, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, file);
      fs.mkdirSync(path.dirname(fullPath), {recursive: true});
      fs.writeFileSync(fullPath, content);
    }
    git(tempDir, ['add', '.']);
    git(tempDir, ['commit', '-m', 'changes']);
    const current = git(tempDir, ['rev-parse', 'HEAD']).trim();

    try {
      const output = execFileSync(process.execPath, [scriptPath], {
        cwd: tempDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          VERCEL_GIT_PREVIOUS_SHA: previous,
          VERCEL_GIT_COMMIT_SHA: current,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {status: 0, output};
    } catch (error) {
      const err = error as {status?: number; stdout?: Buffer | string; stderr?: Buffer | string};
      return {
        status: err.status ?? 1,
        output: `${String(err.stdout ?? '')}${String(err.stderr ?? '')}`,
      };
    }
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {cwd, encoding: 'utf8'});
}

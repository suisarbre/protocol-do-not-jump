import fs from 'node:fs';
import path from 'node:path';

export function listMarkdownFiles(root = 'docs'): string[] {
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (/\.(md|mdx)$/.test(entry.name)) {
        files.push(toPosix(fullPath));
      }
    }
  };

  visit(root);
  return files.sort();
}

export function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

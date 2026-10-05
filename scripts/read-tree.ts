import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Every file under `dir` (skipping .git), by its path relative to `dir`, as UTF-8 text. */
export function readTree(dir: string, prefix = ''): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) for (const [p, t] of readTree(dir, path)) files.set(p, t);
    else files.set(path, readFileSync(join(dir, path), 'utf8'));
  }
  return files;
}

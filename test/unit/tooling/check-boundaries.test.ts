// The boundary check's control (PLAN.md §4.1): a deliberate import from platform into core
// must fail it, as must the other rules it enforces; clean core code must pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, '..', '..', '..', 'scripts', 'check-boundaries.mjs');

function check(files: Record<string, string>): { ok: boolean; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'repworks-boundaries-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const run = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    return { ok: run.status === 0, output: run.stdout + run.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const clean = {
  'src/core/chess/a.ts': `import { parseFen } from 'chessops/fen';\nimport type { B } from '../study/b.ts';\nexport const a = (t: number, b: B) => new Date(t);\n`,
  'src/core/study/b.ts': `// Date.now() in a comment is fine\nexport type B = { s: 'Math.random()' };\nexport * from './c.ts';\n`,
  'src/core/study/c.ts': `export {};\n`,
};

test('clean core passes', () => {
  const result = check(clean);
  assert.ok(result.ok, result.output);
});

test('control: an import from platform into core fails', () => {
  const result = check({ ...clean, 'src/core/bad.ts': `import { idb } from '../platform/idb.ts';\nexport const x = idb;\n` });
  assert.ok(!result.ok);
  assert.match(result.output, /src\/core\/bad\.ts:1: core imports '\.\.\/platform\/idb\.ts', which is outside src\/core/);
});

test('packages other than chessops, node: modules and missing extensions fail', () => {
  const result = check({
    ...clean,
    'src/core/bad.ts': `import { h } from 'preact';\nimport { readFileSync } from 'node:fs';\nimport { a } from './chess/a';\nexport { h, readFileSync, a };\n`,
  });
  assert.ok(!result.ok);
  assert.match(result.output, /bad\.ts:1: core imports 'preact'/);
  assert.match(result.output, /bad\.ts:2: core imports 'node:fs'/);
  assert.match(result.output, /bad\.ts:3: relative import '\.\/chess\/a' must carry its \.ts extension/);
});

test('reading the clock or a random source fails', () => {
  const result = check({
    ...clean,
    'src/core/bad.ts': `export const t = Date.now();\nexport const d = new Date();\nexport const r = Math.random();\nexport const s = \`at \${Date.now()}\`;\n`,
  });
  assert.ok(!result.ok);
  assert.match(result.output, /bad\.ts:1: reads the clock \(Date\.now\)/);
  assert.match(result.output, /bad\.ts:2: reads the clock \(new Date\(\)\)/);
  assert.match(result.output, /bad\.ts:3: uses Math\.random/);
  assert.match(result.output, /bad\.ts:4: reads the clock \(Date\.now\)/);
});

test('JSX in core fails', () => {
  const result = check({ ...clean, 'src/core/view.tsx': `export const v = <div />;\n` });
  assert.ok(!result.ok);
  assert.match(result.output, /view\.tsx:1: JSX belongs in src\/ui/);
});

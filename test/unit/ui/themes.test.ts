// The themes (src/ui/themes.css, src/app/theme.ts): app.css takes every colour from a token, so a
// theme is one block of variables, and every theme in the list has one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME_KEY, THEMES } from '../../../src/app/theme.ts';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const app = read('src/ui/app.css');
const themes = read('src/ui/themes.css');

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\((?!var\()|\bhsla?\(/;
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

/** The declarations of a block whose selector list holds `selector`. */
function block(css: string, selector: string): Map<string, string> {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `no block for ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return new Map([...withoutComments(body).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

test('app.css writes no colour of its own, except the lines marked fixed', () => {
  const bare = withoutComments(app).split('\n');
  const stray = app
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line, n }) => COLOUR.test(bare[n - 1]!) && !line.includes('/* fixed */'));
  assert.deepEqual(stray, []);
});

test('every variable app.css reads is declared', () => {
  const declared = new Set([...`${app}\n${themes}`.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...app.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((v) => !declared.has(v)), []);
});

test('every theme has a block, and sets only the tokens Forest declares', () => {
  const forest = block(themes, ":root,\n[data-theme='forest']");
  for (const t of THEMES) {
    const own = t.id === 'forest' ? forest : block(themes, `[data-theme='${t.id}'] {`);
    const unknown = [...own.keys()].filter((k) => !forest.has(k) && k !== '--board-light' && k !== '--board-dark');
    assert.deepEqual(unknown, [], `${t.id} sets tokens Forest doesn't`);
  }
});

test('a light theme sets every colour token', () => {
  const forest = block(themes, ":root,\n[data-theme='forest']");
  const paper = block(themes, "[data-theme='paper'] {");
  const shared = ['--font', '--font-mono', '--radius', '--radius-card'];
  assert.deepEqual([...forest.keys()].filter((k) => !paper.has(k) && !shared.includes(k)), []);
});

test('a theme with its own board colours draws the flat board', () => {
  const flat = themes.match(/:is\(([^)]*)\) cg-board/)?.[1] ?? '';
  for (const t of THEMES) {
    if (t.id === 'forest' || !block(themes, `[data-theme='${t.id}'] {`).has('--board-light')) continue;
    assert.ok(flat.includes(`[data-theme='${t.id}']`), `${t.id} sets board colours but keeps chessground's brown`);
  }
});

test("index.html reads the theme from theme.ts's key", () => {
  assert.ok(read('index.html').includes(`localStorage.getItem('${THEME_KEY}')`));
});

/** WCAG 2's contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// The pairs an accessibility scan found under 4.5:1 in the dark themes, nudged in §5.159. Controls
// run (2026-11-10): Slate's muted grey back at #8b8987, and Forest's move shown at #319a28, each
// fail this test for that theme alone.
test('text reads at 4.5:1 or more on its token background, in every theme', () => {
  const forest = block(themes, ":root,\n[data-theme='forest']");
  const full = (h: string) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h);
  const PAIRS: [string, string][] = [
    ['--on-current', '--move-current'],
    ['--accent-text', '--primary-bg'],
    ['--on-select', '--info-strong'],
    ['--muted', '--surface'],
    ['--due', '--surface'],
    ['--text', '--surface'],
  ];
  const low: string[] = [];
  for (const t of THEMES) {
    const own = t.id === 'forest' ? forest : block(themes, `[data-theme='${t.id}'] {`);
    const v = (k: string) => full(own.get(k) ?? forest.get(k)!);
    for (const [fg, bg] of PAIRS) {
      const c = contrast(v(fg), v(bg));
      if (c < 4.5) low.push(`${t.id} ${fg} on ${bg}: ${c.toFixed(2)}`);
    }
  }
  assert.deepEqual(low, []);
});

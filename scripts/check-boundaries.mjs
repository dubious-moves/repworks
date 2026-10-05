#!/usr/bin/env node
// The core boundary (PLAN.md §4.1): src/core imports nothing outside src/core and chessops,
// spells its relative imports with their .ts extension (Node runs core with no build), and
// takes time and randomness as inputs. DOM, storage, fetch and Node globals are kept out by
// type-checking core alone with no DOM or Node types (src/core/tsconfig.json); this script
// covers what the type checker can't see.
//
// Usage: node scripts/check-boundaries.mjs [--root <repo root>]
// Exit code 1 lists every violation as file:line.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = resolve(rootIndex >= 0 ? args[rootIndex + 1] : '.');
const core = join(root, 'src', 'core');

const ALLOWED_PACKAGES = [/^chessops(\/[\w./-]+)?$/];

// Calls that read the clock or a random source. Formatting a time that was passed in
// (`new Date(t)`) is fine; reading "now" is not.
const IMPURE = [
  [/\bDate\.now\s*\(/, 'reads the clock (Date.now); take the time as a parameter'],
  [/\bnew\s+Date\s*\(\s*\)/, 'reads the clock (new Date()); take the time as a parameter'],
  [/\bMath\.random\s*\(/, 'uses Math.random; take a random source as a parameter'],
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

// Splits a source into two views with the same line breaks: `code` has its comments blanked
// (import specifiers live in strings, so strings stay), and `bare` also has the contents of its
// strings blanked, keeping template-literal expressions as code.
function scan(source) {
  let code = '';
  let bare = '';
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const stack = []; // open template literals, each with the brace depth of its expression
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    const inTemplateText = stack.length > 0 && stack[stack.length - 1] === -1;
    if (inTemplateText) {
      if (c === '\\') {
        code += c + (next ?? '');
        bare += blank(c + (next ?? ''));
        i += 2;
      } else if (c === '`') {
        stack.pop();
        code += c;
        bare += c;
        i++;
      } else if (c === '$' && next === '{') {
        stack[stack.length - 1] = 0;
        code += '${';
        bare += '${';
        i += 2;
      } else {
        code += c;
        bare += blank(c);
        i++;
      }
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      const literal = source.slice(i, j + 1);
      code += literal;
      bare += c + blank(literal.slice(1, -1)) + (literal.length > 1 ? literal.slice(-1) : '');
      i = j + 1;
    } else if (c === '`') {
      stack.push(-1);
      code += c;
      bare += c;
      i++;
    } else if (c === '/' && next === '/') {
      let j = i;
      while (j < source.length && source[j] !== '\n') j++;
      code += blank(source.slice(i, j));
      bare += blank(source.slice(i, j));
      i = j;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      code += blank(source.slice(i, stop));
      bare += blank(source.slice(i, stop));
      i = stop;
    } else {
      if (stack.length > 0) {
        const depth = stack[stack.length - 1];
        if (c === '{') stack[stack.length - 1] = depth + 1;
        else if (c === '}') stack[stack.length - 1] = depth === 0 ? -1 : depth - 1;
      }
      code += c;
      bare += c;
      i++;
    }
  }
  return { code, bare };
}

const SPECIFIER_PATTERNS = [
  /\bimport\s+(?:type\s+)?[\w*{}\s,$]+?\s+from\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"]+)\1/g,
  /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
];

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const violations = [];
const report = (file, line, message) =>
  violations.push(`${relative(root, file).split(sep).join('/')}:${line}: ${message}`);

for (const file of walk(core)) {
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
    report(file, 1, 'JSX belongs in src/ui, not in core');
    continue;
  }
  if (!file.endsWith('.ts')) continue;
  const { code: text, bare } = scan(readFileSync(file, 'utf8'));

  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[2];
      const line = lineOf(text, match.index);
      if (specifier.startsWith('.')) {
        if (!/\.ts$/.test(specifier)) {
          report(file, line, `relative import '${specifier}' must carry its .ts extension`);
        }
        const target = resolve(dirname(file), specifier);
        if (target !== core && !target.startsWith(core + sep)) {
          report(file, line, `core imports '${specifier}', which is outside src/core`);
        }
      } else if (!ALLOWED_PACKAGES.some((allowed) => allowed.test(specifier))) {
        report(file, line, `core imports '${specifier}'; only src/core and chessops are allowed`);
      }
    }
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*(?!['"])/g)) {
    report(file, lineOf(text, match.index), 'dynamic import with a computed specifier');
  }
  for (const match of bare.matchAll(/(?<![.\w$])require\s*\(/g)) {
    report(file, lineOf(bare, match.index), 'require() in core');
  }
  for (const [pattern, message] of IMPURE) {
    for (const match of bare.matchAll(new RegExp(pattern.source, 'g'))) {
      report(file, lineOf(bare, match.index), message);
    }
  }
}

if (violations.length) {
  console.error(`Core boundary violations (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('Core boundary: ok');

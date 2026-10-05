#!/usr/bin/env node
// Checks a data-repo checkout against format 1 before anything is pushed to it (PLAN.md §4.4).
// Usage: node scripts/validate-data.ts <checkout>
// Prints every error and warning; exits with 1 when there is an error.
import { readTree } from './read-tree.ts';
import { validateDataRepo } from '../src/core/data/validate.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/validate-data.ts <data-repo checkout>');
  process.exit(2);
}
const files = readTree(dir);
const { errors, warnings } = validateDataRepo(files);
const show = (kind: string, i: { path: string; line?: number; message: string }) =>
  console.log(`${kind} ${i.path}${i.line ? `:${i.line}` : ''}: ${i.message}`);
for (const e of errors) show('error  ', e);
for (const w of warnings) show('warning', w);
console.log(`${files.size} files, ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);

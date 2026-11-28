// The ledger's generated parts (PLAN.md §5.219): the table of subtrees with their counts as the
// chapters stand, the order suggested for what is left, the open review lists with the owner's
// answers so far, and the commit the next merge starts from. The ledger file keeps its prose; the
// parts between `<!-- audit:NAME -->` and `<!-- /audit:NAME -->` are written by the script, so a
// number in them is never typed by hand. Pure: the state, the counts and the file's text in.
import type { Chapter } from '../../src/core/study/model.ts';
import type { AnsweredList } from '../chapter-diff-lib.ts';
import type { AuditState, SubtreeState } from './state.ts';
import { chapterName, subtreeCounts, type SubtreeCount } from './study.ts';

const WHOLE = '(the whole chapter)';
const STATE_WORDS: Record<SubtreeState['state'], string> = { closed: 'Audited', open: 'Audited, review open', todo: 'Not audited' };

export interface LedgerRow extends SubtreeCount {
  cid: string;
  chapter: string;
  state: SubtreeState;
}

/** Every subtree of every chapter the state names, with its counts now and its state (todo when the state has none). */
export function ledgerRows(state: AuditState, chapters: readonly Chapter[]): { rows: LedgerRow[]; problems: string[] } {
  const rows: LedgerRow[] = [];
  const problems: string[] = [];
  for (const chapter of chapters) {
    const settings = state.chapters[chapter.id];
    if (!settings) {
      problems.push(`chapter ${chapterName(chapter)} (${chapter.id}) is not in audit.json's chapters`);
      continue;
    }
    const known = state.subtrees[chapter.id] ?? {};
    const seen = new Set<string>();
    for (const c of subtreeCounts(chapter, settings.depth)) {
      const line = c.line || WHOLE;
      seen.add(line);
      rows.push({ ...c, line, cid: chapter.id, chapter: chapterName(chapter), state: known[line] ?? { state: 'todo' } });
    }
    for (const line of Object.keys(known)) if (!seen.has(line)) problems.push(`audit.json has a state for "${line}" in ${chapterName(chapter)}, which the chapter no longer has at ${settings.depth} plies`);
  }
  for (const cid of Object.keys(state.chapters)) if (!chapters.some((c) => c.id === cid)) problems.push(`audit.json names chapter ${cid}, which the study doesn't have`);
  return { rows, problems };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const status = (r: LedgerRow) => `**${STATE_WORDS[r.state.state]}${r.state.batch ? `, ${r.state.batch}` : ''}.**${r.state.note ? ` ${r.state.note}` : ''}`;

/** A chapter's subtrees as a table; the ones with nothing drilled below (they end in a note elsewhere) listed after it. */
export function subtreeTable(rows: readonly LedgerRow[]): string {
  const drilled = rows.filter((r) => r.positions > 0);
  const empty = rows.filter((r) => r.positions === 0);
  const out = ['| Subtree | Positions / replies / single-move | Status |', '|---|---|---|'];
  for (const r of drilled) out.push(`| ${cell(r.line)} | ${r.positions} / ${r.replies} / ${r.single} | ${cell(status(r))} |`);
  if (empty.length) out.push('', 'Nothing drilled below these (the line ends at once: in a "transposes to" note, or after our one move):', ...empty.map((r) => `- ${r.line}`));
  return out.join('\n');
}

/** What is left, most single-move branches first. */
export function suggestedOrder(rows: readonly LedgerRow[]): string {
  const todo = rows.filter((r) => r.state.state === 'todo' && r.positions > 0).sort((a, b) => b.single - a.single || b.replies - a.replies);
  if (!todo.length) return 'Nothing is left to audit.';
  return todo.map((r, i) => `${i + 1}. ${r.line === WHOLE ? `the chapter "${r.chapter}"` : r.line} (${r.single})`).join('\n');
}

/**
 * The open review lists with the owner's answers so far, counted as the Review panel counts them:
 * by position (the items at one move, §5.218), a position under the newest list that has one of its
 * items. The items are given beside them.
 */
export function listsTable(lists: readonly AnsweredList[]): string {
  if (!lists.length) return 'No review list is open.';
  const out = ['| List | Positions | OK | No | A note only | Changed in the chapter since | Not answered | Still open in the app | Items (not answered) |', '|---|---|---|---|---|---|---|---|---|'];
  let waiting = 0;
  let items = 0;
  for (const l of lists) {
    const c = l.positionCounts;
    waiting += l.waiting;
    items += l.counts.open;
    out.push(`| ${cell(l.list.name)} (${cell(l.list.title)}) | ${l.positions.length} | ${c.ok} | ${c.no} | ${c.noted} | ${c.moved} | ${c.open} | ${l.waiting} | ${l.items.length} (${l.counts.open}) |`);
  }
  out.push('', `${waiting} position(s) still open in the app; ${items} item(s) not answered.`);
  return out.join('\n');
}

/** The lines flagged for a later audit, and the owner's exceptions. */
export function flagsText(state: AuditState): string {
  const out: string[] = [];
  if (state.flags.length) out.push('To examine when the subtree is audited:', ...state.flags.map((f) => `- ${f.line}: ${f.note}`));
  if (state.exceptions.length) out.push(...(out.length ? [''] : []), 'Not drilled by the owner’s decision (a gap scan skips them):', ...state.exceptions.map((e) => `- ${e}`));
  return out.join('\n') || 'None.';
}

const REGION = /<!-- audit:([a-z0-9: A-Za-z]+?) -->\n[\s\S]*?<!-- \/audit:\1 -->/g;

/** The names of the regions a ledger file has, in order. */
export const regionsIn = (text: string): string[] => [...text.matchAll(REGION)].map((m) => m[1]!);

/**
 * The file with each region's content replaced. A region the file has and `parts` doesn't is an
 * error (a name mistyped would otherwise stay stale for ever); parts the file has no region for
 * are returned, to be placed by hand.
 */
export function writeRegions(text: string, parts: ReadonlyMap<string, string>): { text: string; unknown: string[]; unplaced: string[] } {
  const unknown: string[] = [];
  const placed = new Set<string>();
  const out = text.replace(REGION, (whole, name: string) => {
    const part = parts.get(name);
    if (part === undefined) {
      unknown.push(name);
      return whole;
    }
    placed.add(name);
    return `<!-- audit:${name} -->\n${part}\n<!-- /audit:${name} -->`;
  });
  return { text: out, unknown, unplaced: [...parts.keys()].filter((k) => !placed.has(k)) };
}

#!/usr/bin/env node
// The repertoire audit's tools (PLAN.md §5.219, the skill in .claude/skills/repertoire-audit): one
// command each for what a batch needs, reading and writing a study in a data repo checkout by its
// study and chapter ids. The study's own rules and state are in the data repo, notes/<study id>/
// (rules.md, ledger.md, audit.json).
//
//   node scripts/audit/audit.ts <command> <checkout>[@rev] --study S [options]
//
//   check        every check against the study's targets (audit.json); exit 1 on a miss
//                  [--deck --cache DIR [--offline]]: the idea-deck check too (Stockfish, minutes)
//   ledger       write the generated parts of notes/<sid>/ledger.md  [--check: exit 1 when stale]
//   base         the commit the next merge starts from: the session's last one to the study
//   inventory    --chapter C --line "<moves>" --cache DIR [--offline] [--out inv.json]
//   screen       --chapter C --line "<moves>" [--nodes N] [--sf-cache DIR] [--out screen.json]
//   difficulty   --chapter C --line "<moves>" [--nodes N] [--elo 2000,2200] [--sf-cache DIR] [--out d.json]
//                  --moves "<a full line>": our moves along one line, no chapter needed
//   judge        --chapter C --inventory inv.json --difficulty d.json
//   lines        [--chapter C] [--line "<moves>"] [--since REV] [--sf [--nodes N]]
//   apply        --ops ops.json [--base REV] [--dry-run]
//   lint         --notes notes.json | --list NAME | --since REV
//   scan         [--since REV]
//   rep          --out rep.pgn --cache DIR [--offline]
//   close-calls  --chapter C --cache DIR [--offline] [--out cc.json] [--practical positions.json]
//   add-chapters --from study.pgn [--names "A,B"]
//
// --cache is a scripts/practical.ts cache folder (the explorer's and ChessDB's answers, shared with
// Practical); the Lichess token is read from LICHESS_TOKEN; --offline asks nothing and lists what
// the cache lacks. --max-age DAYS: how old an explorer answer may be (90). Stockfish runs on one
// thread for a fixed number of nodes, so a number is the same on every run and machine: for screen
// and lines --sf the repo's own Stockfish 19 with its full net (node_modules, after npm ci); for
// difficulty the vendored Stockfish 18 lite, whose scores the owner's class limits were set for.
// --engine sf19|lite18|native asks another (native: the binary STOCKFISH names); --sf-cache DIR
// keeps the answers.
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { parseUciMove, standardUci } from '../../src/core/chess/uci.ts';
import { chapterPath, classifyPath, reviewDir } from '../../src/core/data/layout.ts';
import type { CompactExplorer } from '../../src/core/explorer/providers.ts';
import type { ChessdbAnswer } from '../../src/core/explorer/search.ts';
import { parseChapterFile, parseGames } from '../../src/core/pgn/parse.ts';
import { chapterFileText } from '../../src/core/pgn/write.ts';
import { playedLines } from '../../src/core/repertoire/lines.ts';
import { freshId } from '../../src/core/study/ids.ts';
import { header, type Chapter, type MoveNode, type RootNode } from '../../src/core/study/model.ts';
import { newestFirst, parseReviewList, type ReviewList } from '../../src/core/study/reviewList.ts';
import { writeStudyMeta } from '../../src/core/study/studyMeta.ts';
import { startPosition } from '../../src/core/study/tree.ts';
import { answered } from '../chapter-diff-lib.ts';
import { git, openSide, readStudy, revParse, worktree, type Side, type StudyAt } from '../data-repo.ts';
import { readTree } from '../read-tree.ts';
import { closeCallPositions, closeCalls } from './closecalls.ts';
import { createMeasure, ENGINE, hardestAfter, NODES, ratedText, rateLine, rateSubtree, verdict, type MoveRow } from './difficulty.ts';
import { cpOf, createEngines, pawns, type EngineKind } from './engine.ts';
import { inventory, inventoryText, oneIn, positionsNeeded, type Inventory } from './inventory.ts';
import { flagsText, ledgerRows, listsTable, regionsIn, subtreeTable, suggestedOrder, writeRegions } from './ledger.ts';
import { lintComment, lintWords } from './lint.ts';
import { createLookups, type Lookups } from './lookups.ts';
import { applyOps, behind, isSessionCommit, merge3, type CommitInfo, type Ops } from './ops.ts';
import { scanText, stops } from './scan.ts';
import { auditStatePath, ledgerPath, parseAuditState, type AuditState } from './state.ts';
import { chapterName, clickableLines, continuedTwice, findChapter, lineOf, nodeAtSans, ownerCheck, readingNotes, sansOf, sideOf, theirLeaves, transposeNotes, twoMoves, visits, type TreeNode } from './study.ts';

const USAGE = readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   ')).map((l) => l.slice(3)).join('\n');
const BOOLEAN = new Set(['deck', 'offline', 'check', 'dry-run', 'sf', 'help', 'json', 'all']);
const [command, ...args] = process.argv.slice(2);
const flags = new Map<string, string>();
const plain: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (!a.startsWith('--')) plain.push(a);
  else if (BOOLEAN.has(a.slice(2))) flags.set(a.slice(2), 'true');
  else if (args[i + 1] === undefined) fail(`${a} takes a value`);
  else flags.set(a.slice(2), args[++i]!);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
const say = (s = '') => process.stdout.write(`${s}\n`);
const note = (s: string) => process.stderr.write(`${s}\n`);
const need = (name: string): string => flags.get(name) ?? fail(`--${name} is needed\n${USAGE}`);
const num = (name: string, fallback: number): number => {
  const v = Number(flags.get(name) ?? fallback);
  if (!Number.isFinite(v)) fail(`--${name} takes a number`);
  return v;
};

interface Opened {
  side: Side;
  study: StudyAt;
  sid: string;
}

function open(): Opened {
  const arg = plain[0] ?? fail(`a data repo checkout is needed\n${USAGE}`);
  let side: Side | undefined;
  try {
    side = openSide(arg);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  if (!side) fail(`${arg}: not a data repo checkout, or <checkout>@<rev>`);
  try {
    const study = readStudy(side.tree, side.where, need('study'));
    return { side, study, sid: study.meta.id };
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

/** The notes are read as they are checked out, whatever commit the study is read at: they are the session's own, and the newest are the ones that hold. */
const notesOf = (o: Opened) => worktree(o.side.dir);

function stateOf(o: Opened): AuditState {
  const text = notesOf(o).read(auditStatePath(o.sid));
  if (text === undefined) fail(`${auditStatePath(o.sid)} is missing in ${o.side.dir}: the study's targets and subtree states live there`);
  const parsed = parseAuditState(text);
  if (!parsed.ok) fail(`${auditStatePath(o.sid)} can't be read:\n  ${parsed.errors.join('\n  ')}`);
  if (parsed.state.study !== o.sid) fail(`${auditStatePath(o.sid)} is for study ${parsed.state.study}`);
  return parsed.state;
}

function chapterOf(o: Opened): Chapter {
  const wanted = need('chapter');
  return findChapter(o.study.chapters, wanted) ?? fail(`no chapter "${wanted}"; the study has: ${o.study.chapters.map((c) => `${chapterName(c)} (${c.id})`).join(', ')}`);
}

function prefixOf(chapter: Chapter): string[] {
  const at = nodeAtSans(chapter, sansOf(flags.get('line') ?? ''));
  if (!at) fail(`no such line in ${chapterName(chapter)}: ${flags.get('line')}`);
  return at.path;
}

function lookups(): Lookups {
  const days = num('max-age', 90);
  const token = process.env['LICHESS_TOKEN'] ?? '';
  const offline = flags.has('offline');
  if (!offline && !token) fail('LICHESS_TOKEN is not set: set it, or pass --offline to answer from the cache alone');
  // An explorer answer is good for the audit's counts for longer than the app keeps it: its clock is set back by the difference.
  const stretch = Math.max(0, days - 30) * 24 * 3600 * 1000;
  return createLookups({ cacheDir: need('cache'), token, offline, now: () => Date.now() - stretch });
}

/** The answers for a list of positions, asked side by side (the clients keep to their own limits). */
async function fetchAll<T>(fens: readonly string[], ask: (fen: string) => Promise<T | undefined>, what: string): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  let done = 0;
  await Promise.all(
    fens.map(async (fen) => {
      const v = await ask(fen);
      if (v !== undefined) out.set(fen, v);
      if (++done % 50 === 0) note(`  ${what}: ${done} of ${fens.length}`);
    }),
  );
  return out;
}

function engines(fallback: EngineKind = 'sf19') {
  const asked = flags.get('engine') ?? fallback;
  if (asked !== 'sf19' && asked !== 'lite18' && asked !== 'native') fail('--engine is sf19, lite18 or native');
  return createEngines({ engine: asked, ...(flags.has('sf-cache') ? { cacheDir: flags.get('sf-cache')! } : {}), ...(flags.has('engines') ? { size: num('engines', 4) } : {}) });
}

/* ------------------------------------------------------------------ check */

interface Result {
  name: string;
  ok: boolean;
  text: string;
  details?: string[];
}

function ownerFiles(o: Opened, state: AuditState): { cid: string; file: string; chapter: Chapter; missingMoves: number; missingComments: number }[] {
  const out = [];
  for (const [cid, c] of Object.entries(state.chapters)) {
    for (const f of c.owner ?? []) {
      const text = notesOf(o).read(`notes/${o.sid}/${f.file}`);
      if (text === undefined) fail(`notes/${o.sid}/${f.file} (the owner's file for chapter ${cid}) is missing`);
      let k = 0;
      const games = parseGames(text, () => `owner${k++}`);
      if (games.length !== 1 || !games[0]!.ok) fail(`notes/${o.sid}/${f.file} must hold one game that can be read`);
      out.push({ cid, file: f.file, chapter: games[0]!.chapter, missingMoves: f.missingMoves, missingComments: f.missingComments });
    }
  }
  return out;
}

function structuralChecks(o: Opened, state: AuditState, chapters: readonly Chapter[]): Result[] {
  const results: Result[] = [];
  const add = (name: string, ok: boolean, text: string, details: string[] = []) => results.push({ name, ok, text, ...(ok || !details.length ? {} : { details }) });
  for (const c of chapters) if (!state.chapters[c.id]) add('chapters', false, `${chapterName(c)} (${c.id}) is not in audit.json's chapters`);

  const two = twoMoves(chapters);
  add('one move a position', two.two.length === 0, `${two.positions} positions with a move of ours, ${two.two.length} with two`, two.two.map((t) => `after ${t.line || 'the start'} (${t.chapter}): ${t.moves.join(' / ')}`));

  const reading = readingNotes(chapters, o.study.notes);
  add('legal moves', reading.illegal.length === 0, `${reading.illegal.length} illegal`, reading.illegal);
  const layout = chapters.filter((c) => o.study.texts.get(c.id) !== undefined && chapterFileText(c) !== o.study.texts.get(c.id));
  add("the app's own form", reading.other.length === 0 && layout.length === 0, `${layout.length} chapter file(s) the app would rewrite, ${reading.other.length} move(s) it would respell`, [...layout.map((c) => `${chapterName(c)} (${c.id})`), ...reading.other]);

  const lines = clickableLines(chapters);
  add('clickable lines', lines.partial + lines.dead === 0, `${lines.full} of ${lines.lines} play in full (${lines.partial} partly, ${lines.dead} not at all)`, lines.bad.map((b) => `${b.line} (${b.chapter}): ${b.text} plays ${b.played} of ${b.of}`));
  const proseTarget = state.targets.parenProse ?? 0;
  add('prose in parentheses', lines.prose.length <= proseTarget, `${lines.prose.length} group(s) in parentheses that are no line (target at most ${proseTarget})`, lines.prose.map((p) => `${p.line} (${p.chapter}): ${p.text}`));

  const leaves = theirLeaves(chapters);
  add("lines end on our move", leaves.length === 0, `${leaves.length} line(s) end on the opponent's move without a "transposes to" note`, leaves.map((l) => `${l.line} (${l.chapter})`));

  const notes = transposeNotes(chapters);
  add('transposition notes', notes.stale.length + notes.dead.length === 0, `${notes.notes} notes, ${notes.stale.length} pointing to the wrong place, ${notes.dead.length} to nowhere`, [...notes.stale.map((n) => `${n.line} (${n.chapter}): should be "${n.now}"`), ...notes.dead.map((n) => `${n.line} (${n.chapter}): its position continues nowhere`)]);

  const twice = continuedTwice(chapters);
  const twiceTarget = state.targets.continuedTwice ?? 0;
  add('one place a position', twice.length <= twiceTarget, `${twice.length} position(s) continue in two places by different move orders (target at most ${twiceTarget})`, twice.map((t) => t.lines.join('  AND  ')));

  for (const f of ownerFiles(o, state)) {
    const now = chapters.find((c) => c.id === f.cid);
    if (!now) {
      add(`the owner's ${f.file}`, false, `chapter ${f.cid} is not in the study`);
      continue;
    }
    const r = ownerCheck(f.chapter, now);
    const ok = r.missingMoves.length <= f.missingMoves && r.missingComments.length <= f.missingComments;
    add(`the owner's ${f.file}`, ok, `${r.missingMoves.length} of his ${r.moves} moves missing (accepted: ${f.missingMoves}), ${r.missingComments.length} of his ${r.comments} comments (accepted: ${f.missingComments})`, [...r.missingMoves.map((m) => `move: ${m}`), ...r.missingComments.map((c) => `comment at ${c.line}: ${c.text.slice(0, 100)}`)]);
  }
  return results;
}

function printResults(results: readonly Result[]): boolean {
  for (const r of results) {
    say(`${r.ok ? 'ok  ' : 'MISS'}  ${r.name}: ${r.text}`);
    for (const d of (r.details ?? []).slice(0, flags.has('all') ? undefined : 25)) say(`        ${d}`);
    if (!flags.has('all') && (r.details?.length ?? 0) > 25) say(`        … ${r.details!.length - 25} more (--all)`);
  }
  return results.every((r) => r.ok);
}

/** The study's chapters as one game, the opponent's moves carrying the explorer's shares: the deck check's repertoire. */
async function repText(o: Opened, look: Lookups): Promise<{ text: string; missing: number }> {
  const first = o.study.chapters[0] ?? fail('the study has no chapters');
  const side = sideOf(first);
  const merged: Chapter = { id: 'merged00', headers: [['Event', `${o.study.meta.name} (merged)`], ['ChapterName', `${o.study.meta.name} (merged)`], ['Orientation', side]], root: structuredClone(first.root) };
  const add = (to: TreeNode, from: TreeNode) => {
    for (const c of from.children) {
      const same = to.children.find((x) => x.san === c.san);
      if (same) add(same, c);
      else to.children.push(structuredClone(c));
    }
  };
  for (const c of o.study.chapters.slice(1)) add(merged.root, c.root);
  // The moves every line shares carry no share: reach is counted from where the study first branches.
  let trunk = 0;
  for (let n: TreeNode = merged.root; n.children.length === 1; n = n.children[0]!) trunk++;
  const fens = [...new Set([...visits(merged)].filter((v) => !v.ours && v.path.length > trunk).map((v) => makeFen(v.before.toSetup())))];
  note(`rep: ${fens.length} positions' games`);
  const games = await fetchAll(fens, (f) => look.explorer(f), 'explorer');
  let missing = 0;
  for (const v of visits(merged)) {
    if (v.ours || v.path.length <= trunk) continue;
    const ex = games.get(makeFen(v.before.toSetup()));
    if (!ex) {
      missing++;
      continue;
    }
    const m = ex.moves.find((x) => x.san === v.node.san);
    const pct = ex.total ? (100 * ((m?.white ?? 0) + (m?.draws ?? 0) + (m?.black ?? 0))) / ex.total : 0;
    const label = pct >= 10 ? pct.toFixed(0) : pct >= 1 ? pct.toFixed(1) : pct.toFixed(2);
    v.node.comments = [`${label}%`, ...v.node.comments.filter((t) => !/^\s*[\d.]+%\s*$/.test(t)).map((t) => t.replace(/^\s*[\d.]+%\s*-\s*/, ''))];
  }
  return { text: chapterFileText(merged), missing };
}

async function deckCheck(o: Opened, state: AuditState): Promise<Result> {
  const d = state.deck;
  if (!d) return { name: 'the idea deck', ok: true, text: 'audit.json names no deck' };
  const deck = readStudy(o.side.tree, o.side.where, d.study);
  const look = lookups();
  const rep = await repText(o, look);
  look.close();
  if (rep.missing) return { name: 'the idea deck', ok: false, text: `not run: the explorer's answer is missing for ${rep.missing} move(s) of the repertoire (run without --offline)` };
  const dir = mkdtempSync(join(tmpdir(), 'repworks-audit-deck-'));
  writeFileSync(join(dir, 'rep.pgn'), rep.text);
  writeFileSync(join(dir, 'deck.pgn'), deck.chapters.map((c) => deck.texts.get(c.id)!).join('\n'));
  const run = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'ideas', 'cv.ts'), 'check', join(dir, 'deck.pgn'), '--rep', join(dir, 'rep.pgn'), '--cards', String(d.cards), '--max-cards', String(d.cards), '--rare', String(d.rare), '--depth', String(d.depth)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = `${run.stdout}${run.stderr}`.trim().split('\n');
  const last = out.at(-1) ?? '';
  const m = /(\d+) errors, (\d+) warnings/.exec(last);
  const ok = run.status === 0 && m !== null && m[1] === '0' && m[2] === '0';
  return { name: 'the idea deck', ok, text: `${deck.meta.name}: ${last}${d.known ? ` (${d.known})` : ''}`, details: out.slice(0, -1) };
}

async function check(): Promise<number> {
  const o = open();
  const state = stateOf(o);
  const results = structuralChecks(o, state, o.study.chapters);
  if (flags.has('deck')) results.push(await deckCheck(o, state));
  const ok = printResults(results);
  if (!flags.has('deck') && state.deck) say('NOT RUN  the idea deck (pass --deck --cache DIR: the sixth check, needed after every batch)');
  say(ok ? `\nEvery check that ran meets its target (${o.side.where}).` : '\nA check MISSED its target: fix it, or explain it to the owner before the target is changed.');
  return ok ? 0 : 1;
}

/* ------------------------------------------------------------------ the base, the ledger */

function commitsOf(dir: string, range: string, sid: string): CommitInfo[] {
  let out: string;
  try {
    out = git(dir, 'log', '--format=%x01%H%x00%s%x00%b%x00', '--name-only', range, '--', `studies/${sid}/`);
  } catch (e) {
    fail(`git log ${range} failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
  return out
    .split('\x01')
    .filter(Boolean)
    .map((rec) => {
      const [hash, subject, body, files] = rec.split('\x00');
      return { hash: hash!.trim(), subject: subject ?? '', body: body ?? '', files: (files ?? '').split('\n').map((f) => f.trim()).filter(Boolean) };
    });
}

/** The session's last commit to the study's chapters: what the owner's edits are counted from. */
function baseOf(dir: string, sid: string, at = 'HEAD'): CommitInfo | undefined {
  return commitsOf(dir, at, sid).find((c) => isSessionCommit(c) && c.files.some((f) => /\.pgn$/.test(f)));
}

function base(): number {
  const o = open();
  const b = baseOf(o.side.dir, o.sid, o.side.rev ?? 'HEAD');
  if (!b) fail(`no session commit to studies/${o.sid}/ in the history this checkout holds (a shallow clone: git fetch --depth=500 origin main)`);
  const later = commitsOf(o.side.dir, `${b.hash}..${o.side.rev ?? 'HEAD'}`, o.sid);
  say(`${b.hash.slice(0, 7)}  ${b.subject}`);
  say(later.length ? `${later.length} commit(s) to the study since, none a session's: the owner's edits. Read them with\n  node scripts/chapter-diff.ts ${o.side.dir}@${b.hash.slice(0, 7)} ${o.side.dir} --study ${o.sid}` : 'Nothing has changed in the study since.');
  return 0;
}

function ledgerParts(o: Opened, state: AuditState): { parts: Map<string, string>; problems: string[] } {
  const { rows, problems } = ledgerRows(state, o.study.chapters);
  const parts = new Map<string, string>();
  for (const c of o.study.chapters) parts.set(`subtrees ${c.id}`, subtreeTable(rows.filter((r) => r.cid === c.id)));
  parts.set('order', suggestedOrder(rows));
  parts.set('flags', flagsText(state));
  const files = readTree(o.side.dir);
  const lists: ReviewList[] = [];
  for (const [path, text] of files) {
    if (classifyPath(path).kind !== 'review' || !path.startsWith(reviewDir(o.sid))) continue;
    const r = parseReviewList(text);
    if (r.ok) lists.push(r.list);
    else problems.push(`${path} can't be read: ${r.error}`);
  }
  // As the panel and review-answers.ts order them: a position whose items are in several lists is under the newest.
  parts.set('lists', listsTable(answered([...lists].sort(newestFirst), files, new Map(o.study.chapters.map((c) => [c.id, c])))));
  const b = baseOf(o.side.dir, o.sid);
  const two = twoMoves(o.study.chapters);
  parts.set('base', b ? `The session's last commit to the study's chapters is **${b.hash.slice(0, 7)}** ("${b.subject}"): the owner's edits are counted from it (\`audit.ts base\`). The study has ${two.positions} positions with a move of ours.` : 'No session commit to the study in the history this checkout holds.');
  return { parts, problems };
}

function ledger(): number {
  const o = open();
  if (o.side.rev) fail('the ledger is written from the checkout as it stands, not from a commit');
  const state = stateOf(o);
  const { parts, problems } = ledgerParts(o, state);
  const path = join(o.side.dir, ledgerPath(o.sid));
  if (!existsSync(path)) fail(`${ledgerPath(o.sid)} is missing: write it with the regions <!-- audit:NAME --> … <!-- /audit:NAME --> (NAME one of: ${[...parts.keys()].join(', ')})`);
  const was = readFileSync(path, 'utf8');
  const made = writeRegions(was, parts);
  for (const p of problems) note(`problem: ${p}`);
  for (const u of made.unknown) note(`problem: the ledger has a region "${u}" that the script doesn't write`);
  for (const u of made.unplaced) note(`note: the ledger has no region "${u}" (<!-- audit:${u} --> and <!-- /audit:${u} --> on their own lines)`);
  const bad = problems.length + made.unknown.length > 0;
  if (flags.has('check')) {
    say(made.text === was ? `${ledgerPath(o.sid)} is up to date (${regionsIn(was).length} generated parts).` : `${ledgerPath(o.sid)} is STALE: run audit.ts ledger`);
    return made.text === was && !bad ? 0 : 1;
  }
  if (made.text !== was) writeFileSync(path, made.text);
  say(`${ledgerPath(o.sid)}: ${made.text === was ? 'already up to date' : 'written'} (${regionsIn(made.text).length} generated parts).`);
  return bad ? 1 : 0;
}

/* ------------------------------------------------------------------ inventory, screen, difficulty, judge */

async function inventoryCommand(): Promise<number> {
  const o = open();
  const chapter = chapterOf(o);
  const prefix = prefixOf(chapter);
  const look = lookups();
  const fens = positionsNeeded(o.study.chapters, chapter, prefix);
  note(`inventory: ${fens.length} positions' games`);
  const games = await fetchAll(fens, (f) => look.explorer(f), 'explorer');
  look.close();
  const state = notesOf(o).read(auditStatePath(o.sid)) === undefined ? undefined : stateOf(o);
  const owners = state ? ownerFiles(o, state).map((f) => f.chapter) : [];
  const inv = inventory(o.study.chapters, chapter, prefix, (fen) => games.get(fen), owners);
  if (flags.has('out')) writeFileSync(flags.get('out')!, `${JSON.stringify(inv, null, 1)}\n`);
  say(inventoryText(inv, state?.exceptions ?? []));
  const s = look.stats();
  note(`explorer requests ${s.explorerRequests ?? 0}${s.explorer429 ? `, refused ${s.explorer429}` : ''}`);
  return inv.unknown.length ? 1 : 0;
}

async function screen(): Promise<number> {
  const o = open();
  const chapter = chapterOf(o);
  const prefix = prefixOf(chapter);
  const nodes = num('nodes', 1_000_000);
  const E = engines();
  const side = sideOf(chapter);
  const jobs = [...visits(chapter)].filter((v) => v.ours && prefix.every((s, i) => v.path[i] === s) && v.path.length > prefix.length);
  note(`screen: ${jobs.length} moves of ours, ${await E.name()} at ${nodes.toLocaleString('en')} nodes`);
  const rows = await Promise.all(
    jobs.map(async (v) => {
      const fen = makeFen(v.before.toSetup());
      const top = (await E.search({ fen, nodes, lines: 3 })).map((l) => ({ san: makeSan(v.before, parseUciMove(v.before, l.pv[0]!)!), score: l.score }));
      let ours = top.find((t) => t.san === v.node.san);
      if (!ours) {
        const move = parseSan(v.before, v.node.san);
        if (!move || !isNormal(move)) throw new Error(`not a move: ${v.node.san}`);
        const found = await E.search({ fen, nodes: Math.round(nodes / 2), moves: [standardUci(v.before, move)] });
        ours = { san: v.node.san, score: found[0]!.score };
      }
      const sign = side === 'white' ? 1 : -1;
      const behindBy = top[0] ? sign * (cpOf(top[0].score) - cpOf(ours.score)) : 0;
      return { line: lineOf(chapter, v.path), ours: pawns(ours.score), behind: behindBy / 100, flag: behindBy >= 50, top: top.map((t) => `${t.san} ${pawns(t.score)}`) };
    }),
  );
  E.quit();
  if (flags.has('out')) writeFileSync(flags.get('out')!, `${JSON.stringify({ engine: await E.name(), nodes, rows }, null, 1)}\n`);
  say(`Stockfish screen: ${await E.name()}, ${nodes.toLocaleString('en')} nodes, one thread. Scores from White's side; FLAG: ours is 0.50 or more behind the best.`);
  for (const r of rows) say(`${r.flag ? 'FLAG' : '    '} ${r.behind.toFixed(2).padStart(5)} | ${r.line} | ours ${r.ours} | ${r.top.join(', ')}`);
  say(`\n${rows.length} moves, ${rows.filter((r) => r.flag).length} flagged.`);
  return 0;
}

async function difficulty(): Promise<number> {
  const nodes = num('nodes', NODES);
  const elos = (flags.get('elo') ?? '2000,2200').split(',').map(Number);
  // The engine the owner's limits belong to, unless another is asked for (its numbers are then not the classes').
  const E = engines(ENGINE);
  const M = createMeasure(E, { nodes, elos });
  const own = (flags.get('engine') ?? ENGINE) === ENGINE && nodes === NODES;
  const head = `Difficulty: Maia 23M at ${elos.join(' and ')}, ${await M.engine()} at ${nodes.toLocaleString('en')} nodes a move on one thread. hard: expLoss 5 or more; mid: 3 to 5; easy: below 3.${own ? '' : ' NOT the settings the limits were set for: the classes shown are not the measure\'s.'}`;
  if (flags.has('moves')) {
    const sans = sansOf(flags.get('moves')!);
    const side = flags.get('side') === 'black' ? 'black' : 'white';
    say(head);
    for (const r of await rateLine(M, Chess.default(), sans, side)) say(`${r.sans.map((s, i) => (i % 2 ? s : `${i / 2 + 1}. ${s}`)).join(' ')}\n   ${ratedText(r.rated)}`);
    E.quit();
    return 0;
  }
  const o = open();
  const chapter = chapterOf(o);
  const prefix = prefixOf(chapter);
  say(head);
  const rows = await rateSubtree(M, chapter, prefix, (row) => say(`${row.line}\n   ${ratedText(row)}`));
  const firstTurn = startPosition(chapter)?.turn ?? 'white';
  const replies = hardestAfter(rows, prefix.length, sideOf(chapter), firstTurn).map((r) => ({ ...r, line: lineOf(chapter, r.path) }));
  say('\n== per reply: the hardest of our next three moves');
  for (const r of replies) say(`${r.line} | hardest: ${r.hardest.path.at(-1)} ${r.hardest.cls}, expLoss ${r.hardest.expLoss.toFixed(1)}, found by ${(100 * r.hardest.pFind).toFixed(0)}%`);
  E.quit();
  if (flags.has('out')) writeFileSync(flags.get('out')!, `${JSON.stringify({ engine: await M.engine(), nodes, elos, rows, replies }, null, 1)}\n`);
  return 0;
}

function judge(): number {
  const o = open();
  const chapter = chapterOf(o);
  const inv = JSON.parse(readFileSync(need('inventory'), 'utf8')) as Inventory;
  const diff = JSON.parse(readFileSync(need('difficulty'), 'utf8')) as { engine: string; nodes: number; replies: { path: string[]; hardest: MoveRow }[] };
  const hardest = new Map(diff.replies.map((r) => [r.path.join(' '), r.hardest]));
  if (inv.unknown.length) say(`NOT COMPLETE: the inventory lacks the explorer's answer for ${inv.unknown.length} position(s); the rows that depend on them show "?".`);
  say(`What the guide and the measure say about each reply (${diff.engine}, ${diff.nodes.toLocaleString('en')} nodes). A suggestion: sharp lines, key ideas and the owner's own lines are judged by hand.`);
  const rows = inv.rows.flatMap((r) =>
    r.replies.map((x) => {
      const path = [...r.path, x.san];
      const h = hardest.get(path.join(' '));
      const drilled = nodeAtSans(chapter, path) !== undefined;
      const v = h ? verdict(x.reachAll, x.share, h.cls) : x.common ? 'drill: common' : undefined;
      return { h, text: `${(h?.cls ?? '?').padEnd(4)} ${(h ? h.expLoss.toFixed(1) : '?').padStart(5)} | ${drilled ? 'drilled  ' : 'not there'} | ${x.common ? 'C' : ' '}${x.owner ? 'O' : ' '}${x.single ? 'S' : ' '} ${(100 * x.share).toFixed(0).padStart(3)}% ${oneIn(x.reachAll).padStart(13)} | ${(v ?? 'not measured').padEnd(32)} | ${lineOf(chapter, path)}${h ? ` | hardest ${h.path.at(-1)} (found by ${(100 * h.pFind).toFixed(0)}%)` : ''}` };
    }),
  );
  for (const r of rows.sort((a, b) => (b.h?.expLoss ?? -1) - (a.h?.expLoss ?? -1))) say(r.text);
  return inv.unknown.length ? 1 : 0;
}

/* ------------------------------------------------------------------ comments: lines, lint */

/** The comments of the study as it is, with the ones that are new or changed since a commit marked. */
function comments(o: Opened): { chapter: Chapter; v: ReturnType<typeof visits> extends Generator<infer V> ? V : never; text: string; changed: boolean }[] {
  const since = flags.get('since');
  let old: StudyAt | undefined;
  if (since !== undefined) {
    const side = openSide(`${o.side.dir}@${since}`);
    if (!side) fail(`no commit ${since}`);
    old = readStudy(side.tree, side.where, o.sid);
  }
  const only = flags.has('chapter') ? chapterOf(o) : undefined;
  const out = [];
  for (const chapter of o.study.chapters) {
    if (only && chapter !== only) continue;
    const prefix = flags.has('line') ? prefixOf(chapter) : [];
    const before = old?.chapters.find((c) => c.id === chapter.id);
    for (const v of visits(chapter)) {
      if (!prefix.every((s, i) => v.path[i] === s)) continue;
      const was = before ? nodeAtSans(before, v.path)?.node.comments ?? [] : [];
      for (const text of v.node.comments) {
        const changed = since === undefined || !was.includes(text);
        if (since !== undefined && !changed) continue;
        out.push({ chapter, v, text, changed });
      }
    }
  }
  return out;
}

async function linesCommand(): Promise<number> {
  const o = open();
  const nodes = num('nodes', 1_000_000);
  const E = flags.has('sf') ? engines() : undefined;
  if (E) say(`Scores: ${await E.name()}, ${nodes.toLocaleString('en')} nodes, one thread, from White's side. "behind": our move against the engine's best there.`);
  let n = 0;
  for (const c of comments(o)) {
    n++;
    say(`\n${lineOf(c.chapter, c.v.path)}  (${chapterName(c.chapter)})`);
    say(`   {${c.text.replace(/\n/g, ' / ')}}`);
    const side = sideOf(c.chapter);
    for (const p of playedLines(c.text, c.v.after, c.v.before)) {
      const of = p.line.moves.length;
      let tail = '';
      if (E && p.placed && p.positions.length) {
        const first = p.positions[0]!;
        const last = p.positions.at(-1)!;
        const score = async (pos: typeof first) => (pos.isEnd() ? 'the game is over' : pawns((await E.search({ fen: makeFen(pos.toSetup()), nodes }))[0]!.score));
        tail = ` | ${await score(first)} -> ${await score(last)}`;
        for (let i = 0; i < p.sans.length; i++) {
          const pos = p.positions[i]!;
          if (pos.turn !== side || p.sans[i] === '--') continue;
          const fen = makeFen(pos.toSetup());
          const best = (await E.search({ fen, nodes }))[0];
          const move = parseSan(pos, p.sans[i]!);
          if (!best || !move || !isNormal(move)) continue;
          const bestSan = makeSan(pos, parseUciMove(pos, best.pv[0]!)!);
          if (bestSan === p.sans[i]) continue;
          const ours = (await E.search({ fen, nodes: Math.round(nodes / 2), moves: [standardUci(pos, move)] }))[0];
          if (!ours) continue;
          const gap = ((side === 'white' ? 1 : -1) * (cpOf(best.score) - cpOf(ours.score))) / 100;
          if (gap >= 0.3) tail += ` | ${p.sans[i]} is ${gap.toFixed(2)} behind ${bestSan}${gap >= 0.5 ? ' FLAG' : ''}`;
        }
      }
      say(`   ${p.ucis.length === of ? 'plays' : `PLAYS ${p.ucis.length} OF ${of}`}: ${c.text.slice(p.line.from, p.line.to)}${tail}`);
    }
  }
  E?.quit();
  say(`\n${n} comment(s)${flags.has('since') ? ` new or changed since ${flags.get('since')}` : ''}.`);
  return 0;
}

function lint(): number {
  let found = 0;
  const show = (where: string, items: { kind: string; text: string }[]) => {
    for (const i of items) {
      found++;
      say(`${i.kind}: ${i.text}\n     in ${where}`);
    }
  };
  if (flags.has('notes')) {
    const notes = JSON.parse(readFileSync(flags.get('notes')!, 'utf8')) as { moves: string; text: string }[];
    for (const n of notes) {
      if (!/^\s*1\.\s*[A-Za-z]/.test(n.moves)) show(`the note at ${n.moves}`, [{ kind: 'partial line', text: `"moves" must be the full line from move 1: ${n.moves}` }]);
      show(`the note at ${n.moves}`, lintWords(n.text));
    }
  }
  if (flags.has('list') || flags.has('since')) {
    const o = open();
    if (flags.has('list')) {
      const text = o.side.tree.read(`${reviewDir(o.sid)}${flags.get('list')}.json`) ?? fail(`no list ${flags.get('list')}`);
      const r = parseReviewList(text);
      if (!r.ok) fail(r.error);
      for (const item of r.list.items) if (item.text) show(`the list's item at ${item.lead} ${item.part}`, lintWords(item.text));
    }
    if (flags.has('since')) {
      for (const c of comments(o)) {
        const prose = [...c.text.matchAll(/\(([^()]*)\)/g)].filter((m) => !/^\s*chapter\b/i.test(m[1]!) && !playedLines(c.text, c.v.after, c.v.before).some((p) => m.index >= p.line.from && m.index < p.line.to));
        show(`the comment at ${lineOf(c.chapter, c.v.path)}`, [...lintComment(c.text), ...prose.map((m) => ({ kind: 'parentheses that are no line', text: m[0] }))]);
      }
    }
  }
  say(found ? `\n${found} to look at: fix each, or say why it stands (the owner's own text is his).` : 'Nothing found.');
  return found ? 1 : 0;
}

/* ------------------------------------------------------------------ apply */

function apply(): number {
  const o = open();
  if (o.side.rev) fail('apply writes into the checkout: give the folder, and the commit the ops were written against as --base');
  const dir = o.side.dir;
  const raw = JSON.parse(readFileSync(need('ops'), 'utf8')) as Ops | Ops[];
  const batches = Array.isArray(raw) ? raw : [raw];
  const head = revParse(dir, 'HEAD') ?? fail(`${dir} is not a git checkout`);
  const baseRev = revParse(dir, flags.get('base') ?? 'HEAD') ?? fail(`no commit ${flags.get('base')} in ${dir}`);
  try {
    git(dir, 'merge-base', '--is-ancestor', baseRev, head);
  } catch {
    fail(`the base ${baseRev.slice(0, 7)} is not an ancestor of HEAD ${head.slice(0, 7)}`);
  }
  // A base behind the session's own later commit would have that commit's changes read as the owner's, and the batch built without them.
  const own = behind(commitsOf(dir, `${baseRev}..${head}`, o.sid), o.sid);
  if (own.length) {
    fail(`REFUSED: the base ${baseRev.slice(0, 7)} is behind the session's own commit(s) to this study:\n${own.map((c) => `  ${c.hash.slice(0, 7)}  ${c.subject}`).join('\n')}\nTheir changes would be read as the owner's and the batch built without them. Use --base ${own[0]!.hash.slice(0, 7)} (the latest of them) or later; if they are this batch's own unpushed commits, reset them first (git reset --soft ${baseRev.slice(0, 7)}).`);
  }
  const baseSide = openSide(`${dir}@${baseRev}`)!;
  const headSide = openSide(`${dir}@${head}`)!;
  const baseStudy = readStudy(baseSide.tree, baseSide.where, o.sid);
  const theirs = readStudy(headSide.tree, headSide.where, o.sid);
  const errors: string[] = [];
  const result = new Map<string, Chapter>(theirs.chapters.map((c) => [c.id, c]));
  for (const ops of batches) {
    const mineOf = findChapter(baseStudy.chapters, ops.chapter);
    const theirsOf = mineOf && theirs.chapters.find((c) => c.id === mineOf.id);
    if (!mineOf || !theirsOf) {
      errors.push(`no chapter "${ops.chapter}" in the study at the base and now`);
      continue;
    }
    if (chapterFileText(theirsOf) !== theirs.texts.get(theirsOf.id)) note(`note: ${chapterName(theirsOf)} is not in the app's own layout: the whole file is rewritten`);
    const applied = applyOps(mineOf, ops);
    say(`== ${chapterName(mineOf)} (${mineOf.id}): ${applied.log.length} change(s)`);
    for (const l of applied.log) say(`  ${l}`);
    if (applied.errors.length) {
      errors.push(...applied.errors.map((e) => `${chapterName(mineOf)}: ${e}`));
      continue;
    }
    const merged = merge3(mineOf, applied.chapter, theirsOf);
    for (const c of merged.carried) say(`  carried: ${c}`);
    for (const c of merged.conflicts) say(`  CONFLICT: ${c}`);
    result.set(merged.chapter.id, merged.chapter);
  }
  if (errors.length) {
    say(`\nNOTHING WRITTEN: ${errors.length} error(s)`);
    for (const e of errors) say(`  ${e}`);
    return 1;
  }
  const all = theirs.chapters.map((c) => result.get(c.id)!);
  const notes = transposeNotes(all, true);
  for (const n of notes.stale) say(`  note rewritten at ${n.line} (${n.chapter}): ${n.now}`);
  for (const n of notes.dead) say(`  note dropped at ${n.line} (${n.chapter}): its position continues nowhere now`);
  let written = 0;
  for (const c of all) {
    const text = chapterFileText(c);
    const reread = parseChapterFile(text, c.id);
    if (!reread.ok || reread.notes.length || chapterFileText(reread.chapter) !== text) fail(`${chapterName(c)}: what would be written does not read back the same; nothing written`);
    const path = join(dir, chapterPath(o.sid, c.id));
    if (text === theirs.texts.get(c.id)) continue;
    written++;
    if (!flags.has('dry-run')) {
      if (existsSync(path) && readFileSync(path, 'utf8') !== theirs.texts.get(c.id)) note(`note: ${chapterPath(o.sid, c.id)} had uncommitted changes, now replaced`);
      writeFileSync(path, text);
    }
  }
  say(`\n${flags.has('dry-run') ? 'Dry run: would write' : 'Wrote'} ${written} chapter file(s) (base ${baseRev.slice(0, 7)}, the owner's side ${head.slice(0, 7)}). Next: audit.ts check, then scripts/validate-data.ts.`);
  return 0;
}

/* ------------------------------------------------------------------ scan, rep, close-calls, add-chapters */

function scan(): number {
  const dir = plain[0] ?? fail('a checkout is needed');
  let since = flags.get('since');
  if (since === undefined) {
    try {
      since = git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}').trim();
    } catch {
      since = 'origin/main';
    }
  }
  if (revParse(dir, since) === undefined) fail(`no commit ${since} in ${dir}: give --since`);
  const list = (...a: string[]) => git(dir, ...a).split('\n').map((f) => f.trim()).filter(Boolean);
  const files = [...new Set([...list('diff', '--name-only', '--diff-filter=d', `${since}..HEAD`), ...list('diff', '--name-only', '--diff-filter=d', 'HEAD'), ...list('ls-files', '--others', '--exclude-standard')])];
  let stopped = 0;
  let warned = 0;
  for (const f of files) {
    const path = join(dir, f);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (text.includes('\0')) continue;
    for (const x of scanText(text)) {
      if (stops(x)) stopped++;
      else warned++;
      say(`${stops(x) ? 'STOP' : 'warn'}  ${x.kind}  ${f}:${x.line}  ${x.what}`);
    }
  }
  say(`${files.length} file(s) that a push would carry (since ${since}): ${stopped} to stop for, ${warned} warning(s).`);
  return stopped ? 1 : 0;
}

async function rep(): Promise<number> {
  const o = open();
  const look = lookups();
  const made = await repText(o, look);
  look.close();
  writeFileSync(need('out'), made.text);
  say(`wrote ${flags.get('out')}${made.missing ? `; NOT COMPLETE: ${made.missing} move(s) have no share (the explorer's answer is missing: run without --offline)` : ''}`);
  return made.missing ? 1 : 0;
}

async function closeCallsCommand(): Promise<number> {
  const o = open();
  const chapter = chapterOf(o);
  const look = lookups();
  const want = closeCallPositions(chapter);
  note(`close calls: ${want.explorer.length} positions' games and ChessDB moves`);
  const ex = await fetchAll<CompactExplorer>(want.explorer, (f) => look.explorer(f), 'explorer');
  const side = sideOf(chapter);
  const oursFens = want.chessdb.filter((fen) => fen.split(' ')[1] === (side === 'white' ? 'w' : 'b') || true);
  const cdb = await fetchAll<ChessdbAnswer>(oursFens, (f) => look.chessdb(f), 'ChessDB');
  look.close();
  const cc = closeCalls(chapter, (f) => ex.get(f), (f) => cdb.get(f));
  if (flags.has('out')) writeFileSync(flags.get('out')!, `${JSON.stringify(cc, null, 1)}\n`);
  const flagged = cc.decisions.filter((d) => d.flags.length).sort((a, b) => b.reach - a.reach);
  say(`${chapterName(chapter)}: ${cc.decisions.length} moves of ours, ${flagged.length} flagged. Win rates are the games' own (ratings shown); Practical settles each flag.`);
  for (const d of flagged) say(`\n${d.line}  [reached ${oneIn(d.reach)}, ${d.total} games]\n   ${d.flags.join('\n   ')}`);
  say(`\nCritical replies (10%+ of the games, and we score under 45% or ChessDB gives us 0.00 or less): ${cc.critical.length}`);
  for (const c of cc.critical.slice(0, 40)) say(`   ${c.line}  [${oneIn(c.reach)}] ${c.text}`);
  say(`\nLine ends without a "transposes to" note: ${cc.ends.length}; the most reached:`);
  for (const e of cc.ends.slice(0, 15)) say(`   ${oneIn(e.reach).padStart(12)}  ${e.line}`);
  if (cc.unknown.length) say(`\nNOT COMPLETE: no answer for ${cc.unknown.length} position(s) (run without --offline).`);
  if (flags.has('practical')) {
    const positions = flagged.map((d) => ({ moves: lineOf(chapter, d.path.slice(0, -1)), candidates: [d.ours.san, ...d.others.filter((a) => d.flags.some((f) => f.includes(` ${a.san} `))).map((a) => a.san)], label: d.line }));
    writeFileSync(flags.get('practical')!, `${JSON.stringify(positions, null, 1)}\n`);
    say(`wrote ${flags.get('practical')}: ${positions.length} positions for scripts/practical.ts --positions (our move first).`);
  }
  return cc.unknown.length ? 1 : 0;
}

function addChapters(): number {
  const o = open();
  if (o.side.rev) fail('add-chapters writes into the checkout: give the folder');
  const names = flags.has('names') ? flags.get('names')!.split(',').map((s) => s.trim().toLowerCase()) : undefined;
  const taken = new Set<string>(o.study.chapters.map((c) => c.id));
  const rnd = () => randomInt(0, 1 << 30) / (1 << 30);
  let k = 0;
  const added: string[] = [];
  const meta = { ...o.study.meta, chapters: [...o.study.meta.chapters] };
  const orientation = o.study.chapters[0] ? header(o.study.chapters[0], 'Orientation') ?? 'white' : 'white';
  for (const g of parseGames(readFileSync(need('from'), 'utf8'), () => `new${k++}`)) {
    if (!g.ok) fail(`a game of ${flags.get('from')} can't be read: ${g.reason}`);
    const name = header(g.chapter, 'ChapterName') ?? header(g.chapter, 'Event') ?? '';
    if (names && !names.includes(name.trim().toLowerCase())) continue;
    if (g.notes.length) fail(`${name}: the file has moves the app would cut or respell (${g.notes.length}); fix the file first`);
    if (o.study.chapters.some((c) => chapterName(c).trim().toLowerCase() === name.trim().toLowerCase())) fail(`the study already has a chapter named "${name}"`);
    const id = freshId(rnd, taken);
    taken.add(id);
    const fen = header(g.chapter, 'FEN');
    const headers: [string, string][] = [['Event', `${meta.name}: ${name}`], ['Site', '?'], ['Date', '????.??.??'], ['Round', '?'], ['White', '?'], ['Black', '?'], ['Result', '*'], ['StudyName', meta.name], ['ChapterName', name], ['Orientation', header(g.chapter, 'Orientation') ?? orientation], ...(fen ? ([['FEN', fen], ['SetUp', '1']] as [string, string][]) : [])];
    const root: RootNode = g.chapter.root;
    writeFileSync(join(o.side.dir, chapterPath(o.sid, id)), chapterFileText({ id, headers, root }));
    meta.chapters.push(id);
    added.push(`${id}  ${name}  (${[...visits({ id, headers, root })].length} moves)`);
  }
  if (!added.length) fail('no game of the file was added (check --names)');
  writeFileSync(join(o.side.dir, `studies/${o.sid}/study.json`), writeStudyMeta(meta));
  say(`${added.length} chapter(s) added to ${meta.name}:\n${added.join('\n')}\nAdd each to notes/${o.sid}/audit.json's chapters, then audit.ts check and scripts/validate-data.ts.`);
  return 0;
}

const COMMANDS: Record<string, () => number | Promise<number>> = { check, ledger, base, inventory: inventoryCommand, screen, difficulty, judge, lines: linesCommand, apply, lint, scan, rep, 'close-calls': closeCallsCommand, 'add-chapters': addChapters };
const run = command === undefined || flags.has('help') ? undefined : COMMANDS[command];
if (!run) fail(`usage: node scripts/audit/audit.ts <command> <checkout>[@rev] --study S [options]\n${USAGE}`);
// A MoveNode import kept for the types above when a build strips unused ones.
export type { MoveNode };
process.exitCode = await run();

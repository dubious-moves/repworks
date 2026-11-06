#!/usr/bin/env node
// The storm's "Gather positions" from a cloud session (PLAN.md §5.155): the app's gather (core's
// `runGather`, the same requests through the same explorer service and limiter, the same walks,
// the same store rules) run in Node over a data repo's checkout, as a device of its own named
// `cloud`. What it keeps is written to `storm/<cloud id>/<day>.<k>.jsonl` like any device's files
// (§5.102), and every device takes them in at its next sync. After the gather it does what a
// device does on the storm's home, so the positions arrive finished: Maia rates them at the
// ratings the devices use (§5.82), and Stockfish scores them to the desktop's standard (MultiPV 12
// to depth 24, §5.45, §5.84), several engines at once (§5.103).
//
// Usage: node scripts/storm-gather.ts <data-repo checkout> [options]
//   --overnight        keep going over older games, pass after pass (§5.102), scoring between them
//   --minutes N        stop walking after N minutes (the gather's own scoring included)
//   --score-minutes N  then score for N minutes at most (default: until every position is scored)
//   --source S         ends, replies or both (default both)
//   --min-ply N, --max-ply N   the plies past a line's end (the storm's settings, default 2 and 16)
//   --engines N        Stockfish engines at once (default: one a core)
//   --elo N[,N…]       Maia's ratings beyond its ladder (default: those the devices' positions carry)
//   --no-maia, --no-deepen     leave those to the devices
//   --push             commit the cloud's files and push them (the checkout on its default branch)
// Environment: LICHESS_TOKEN (the explorer wants a login; without one only invented lines),
//   STOCKFISH=<native binary> or STOCKFISH_LITE=19 (default: the vendored Stockfish 18 lite).
// Ctrl-C (or SIGTERM) stops what runs; what was kept is written (and pushed) before it exits.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { createExplorerService, DEFAULT_BUDGET, type FromWorker, type ToWorker } from '../src/core/explorer/service.ts';
import { CHESSDB_URL, EXPLORER_BASE, type ExplorerCache } from '../src/core/explorer/providers.ts';
import { validateDataRepo } from '../src/core/data/validate.ts';
import { STORM, withPlyRange } from '../src/core/storm/config.ts';
import { GATHER_STOPPED, runGather, serviceIo, type Gathering, type GatherSource, type StormAsk, type StormReply } from '../src/core/storm/gather.ts';
import { deepenedPosition, engineList, judges, needsDeepening, type StoredPosition } from '../src/core/storm/harvest.ts';
import { keptPolicy, missingRatings } from '../src/core/storm/maia.ts';
import { positionOf } from '../src/core/storm/walk.ts';
import { readTree } from './read-tree.ts';
import { addPositions, CLOUD_DEVICE, cloudDevice, maiaElos, ownFileChanges, readRepertoire, readShared, wholeRepertoire } from './storm/data.ts';
import { startEngines } from './storm/engine.ts';
import { maiaPolicies } from './storm/maia.ts';

/* ------------------------------------------------------------------ the options */

interface Options {
  dir: string;
  overnight: boolean;
  minutes?: number;
  scoreMinutes?: number;
  source: GatherSource;
  minPly: number;
  maxPly: number;
  engines: number;
  elos?: number[];
  maia: boolean;
  deepen: boolean;
  push: boolean;
}

function options(argv: string[]): Options {
  const o: Options = { dir: '', overnight: false, source: 'both', minPly: STORM.minPly, maxPly: STORM.maxPly, engines: availableParallelism(), maia: true, deepen: true, push: false };
  const num = (flag: string, v: string | undefined) => {
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) throw new Error(`${flag} wants a positive number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--overnight') o.overnight = true;
    else if (a === '--minutes') o.minutes = num(a, argv[++i]);
    else if (a === '--score-minutes') o.scoreMinutes = num(a, argv[++i]);
    else if (a === '--source') {
      const s = argv[++i];
      if (s !== 'ends' && s !== 'replies' && s !== 'both') throw new Error('--source is ends, replies or both');
      o.source = s;
    } else if (a === '--min-ply') o.minPly = num(a, argv[++i]);
    else if (a === '--max-ply') o.maxPly = num(a, argv[++i]);
    else if (a === '--engines') o.engines = Math.floor(num(a, argv[++i]));
    else if (a === '--elo') o.elos = (argv[++i] ?? '').split(',').map((e) => num(a, e));
    else if (a === '--no-maia') o.maia = false;
    else if (a === '--no-deepen') o.deepen = false;
    else if (a === '--push') o.push = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!o.dir) o.dir = a;
    else throw new Error(`one checkout only (${a})`);
  }
  if (!o.dir) throw new Error('usage: node scripts/storm-gather.ts <data-repo checkout> [--overnight] [--minutes N] [--push] …');
  return o;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line: string) => console.log(`${stamp()} ${line}`);

/* ------------------------------------------------------------------ git */

function git(dir: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/**
 * Ready to push: the checkout on the remote's default branch, nothing uncommitted, no commit of
 * its own the remote lacks (a pull's rebase would push it), and brought up to the remote's head, so
 * the gather reads what the devices have written. A shallow clone is made whole first: its history
 * may stop short of where the two meet. Throws when it isn't.
 */
function readyToPush(dir: string): string {
  const head = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const branch = head.ok ? head.out.replace(/^origin\//, '') : 'main';
  if (git(dir, ['branch', '--show-current']).out !== branch) throw new Error(`--push: check out ${branch} in ${dir} first (the devices read ${branch})`);
  if (git(dir, ['status', '--porcelain']).out) throw new Error(`--push: ${dir} has uncommitted changes; commit or drop them first`);
  if (git(dir, ['rev-parse', '--is-shallow-repository']).out === 'true' && !git(dir, ['fetch', '-q', '--unshallow', 'origin']).ok) throw new Error('--push: the shallow clone could not be made whole');
  const fetched = git(dir, ['fetch', '-q', 'origin', branch]);
  if (!fetched.ok) throw new Error(`--push: git fetch failed: ${fetched.out}`);
  const ahead = git(dir, ['rev-list', '--count', `origin/${branch}..HEAD`]).out;
  if (ahead !== '0') throw new Error(`--push: ${branch} has ${ahead} commit(s) origin/${branch} lacks; push or drop them first`);
  const ff = git(dir, ['merge', '-q', '--ff-only', `origin/${branch}`]);
  if (!ff.ok) throw new Error(`--push: could not bring ${branch} up to origin/${branch}: ${ff.out}`);
  return branch;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The cloud's files committed and pushed, the push tried again after a network failure (2, 4, 8, 16 s). */
async function pushFiles(dir: string, branch: string, paths: string[], message: string): Promise<boolean> {
  // A path not there yet (the device's file before its first position) is passed over.
  for (const path of paths) git(dir, ['add', '-A', '--', path]);
  if (git(dir, ['diff', '--cached', '--quiet']).ok) return true;
  const c = git(dir, ['commit', '-q', '-m', message]);
  if (!c.ok) {
    say(`commit failed: ${c.out}`);
    return false;
  }
  for (let attempt = 0; attempt <= 4; attempt++) {
    if (attempt) await sleep(2 ** attempt * 1000);
    const pull = git(dir, ['pull', '-q', '--rebase', 'origin', branch]);
    if (!pull.ok) {
      say(`pull failed: ${pull.out}`);
      continue;
    }
    const p = git(dir, ['push', '-q', 'origin', `HEAD:${branch}`]);
    if (p.ok) return true;
    say(`push failed: ${p.out}`);
  }
  return false;
}

/* ------------------------------------------------------------------ the explorer service, in Node */

/** The explorer cache in memory: the app's TTLs, for this run. */
function memoryCache(now: () => number): ExplorerCache {
  const m = new Map<string, { t: number; v: unknown }>();
  return {
    get: async (store, key, ttl) => {
      const r = m.get(store + '|' + key);
      return r && now() - r.t < ttl ? r.v : undefined;
    },
    put: async (store, key, v) => void m.set(store + '|' + key, { t: now(), v }),
  };
}

/** The explorer worker's logic (core's service), wired to fetch as the worker wires it; answers by id. */
function explorer(token: string): (m: StormAsk) => Promise<StormReply> {
  const waiting = new Map<number, (r: StormReply) => void>();
  const TIMEOUT_MS = 30_000;
  const timed = (url: string) => url.startsWith(EXPLORER_BASE) || url.startsWith(CHESSDB_URL);
  const service = createExplorerService({
    http: (url, init) => fetch(url, timed(url) ? { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) } : init),
    cache: memoryCache(Date.now),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    post: (m: FromWorker) => {
      if (m.type !== 'stormGames' && m.type !== 'gamePgns' && m.type !== 'scores') return;
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      w?.(m);
    },
  });
  service.handle({ type: 'config', config: { token, filter: {}, local: '', analyse: false, options: {}, budget: DEFAULT_BUDGET } });
  let next = 1;
  return (m) =>
    new Promise((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      service.handle({ ...m, id } as ToWorker);
    });
}

/* ------------------------------------------------------------------ the run */

async function main(): Promise<void> {
  const o = options(process.argv.slice(2));
  const started = Date.now();
  const branch = o.push ? readyToPush(o.dir) : undefined;
  let files = readTree(o.dir);
  const { errors, warnings } = validateDataRepo(files);
  if (errors.length) {
    for (const e of errors) console.error(`error ${e.path}${e.line ? `:${e.line}` : ''}: ${e.message}`);
    throw new Error('the checkout has errors (scripts/validate-data.ts lists them): nothing gathered');
  }
  if (warnings.length) say(`${warnings.length} warning(s) in the checkout (scripts/validate-data.ts lists them)`);

  const c = withPlyRange(STORM, o.minPly, o.maxPly);
  const rep = readRepertoire(files, started, c);
  const scope = wholeRepertoire(rep.lines, c);
  const device = cloudDevice(files, Math.random, new Date(started).toISOString());
  const shared = readShared(files, device.id);
  const store = shared.positions;
  const isOwn = (p: StoredPosition) => !p.from;
  const ownAtStart = [...store.values()].filter(isOwn).length;
  say(`repertoire: ${rep.chapters.length} chapters, ${rep.lines.length} lines${rep.paused ? ` (${rep.paused} paused, left out)` : ''}, ${scope.frontiers.length} line ends, ${scope.decisions.length} decision points`);
  say(`device "${CLOUD_DEVICE}" ${device.id}${device.file ? ' (new)' : ''}: ${ownAtStart} positions of its own, ${shared.theirs} from other devices, ${rep.done.size} answered well lately`);
  for (const [path, n] of shared.unread) say(`${path}: ${n} line(s) this version can't read (never rewritten)`);

  const token = process.env['LICHESS_TOKEN'] ?? '';
  if (!token) say('no LICHESS_TOKEN: the explorer wants a login, so only invented lines (Stockfish’s) are gathered');
  const engines = startEngines(o.engines);
  say(`${engines.width} × ${engines.label}, one thread and a 64 MB hash each`);
  const ask = explorer(token);

  // Two stops: the walking's (`--minutes`), after which the positions are still rated and scored,
  // and everything's (Ctrl-C, SIGTERM). Either gives up the request under way and answers the
  // searches with nothing; what was kept is written all the same.
  let walkStopped = false;
  let stopping = false;
  let stopNow: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => (stopNow = () => reject(GATHER_STOPPED)));
  stopped.catch(() => undefined);
  const guard = <T>(p: Promise<T>) => Promise.race([p, stopped]);
  const stopWalking = (why: string) => {
    if (walkStopped) return;
    walkStopped = true;
    say(`the walking stops: ${why}`);
    stopNow();
    engines.cancel();
  };
  const stop = (why: string) => {
    stopWalking(why);
    if (stopping) return;
    stopping = true;
    say(`stopping: ${why}`);
    engines.cancel();
  };
  let signals = 0;
  const onSignal = (sig: string) => {
    if (++signals > 1) process.exit(130);
    stop(sig);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  const minutes = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;
  const walkTimer = o.minutes ? setTimeout(() => stopWalking(minutes(o.minutes!)), o.minutes * 60_000) : undefined;

  // What the cloud writes: its device file (once) and its storm files, then a commit and push.
  let deviceWritten = !device.file;
  let pushed = 0;
  const share = async (): Promise<number> => {
    const changes = ownFileChanges(files, store.values(), device.id);
    if (!deviceWritten && device.file && [...store.values()].some(isOwn)) changes.set(device.file[0], device.file[1]);
    if (!changes.size) return 0;
    for (const [path, text] of changes) {
      const full = join(o.dir, path);
      if (text === null) rmSync(full, { force: true });
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, text);
      }
    }
    if (changes.has(device.file?.[0] ?? '')) deviceWritten = true;
    files = readTree(o.dir);
    const own = [...store.values()].filter(isOwn).length;
    say(`wrote ${changes.size} file(s): ${own} positions of its own`);
    if (branch) {
      const ok = await pushFiles(o.dir, branch, [`storm/${device.id}`, `devices/${device.id}.json`], `${CLOUD_DEVICE}: ${own} storm positions`);
      say(ok ? `pushed to ${branch}` : 'the push failed: the files are written, the next share tries again');
      if (ok) pushed++;
    }
    return changes.size;
  };
  let lastShare = Date.now();
  const SHARE_EVERY_MS = 15 * 60_000;

  // The positions in the repertoire's lines (paused ones left out), the cloud's own, not done.
  const keep = new Set(rep.lines.map((l) => `${l.sid}/${l.cid}/${l.path.join(' ')}`));
  const ownToWork = () => [...store.values()].filter((p) => isOwn(p) && !rep.done.has(p.card) && p.lines.some((r) => keep.has(`${r.sid}/${r.cid}/${r.path.join(' ')}`)));

  /** Stockfish to the desktop's standard (§5.45, §5.84) over the cloud's positions, every engine at once (§5.103). */
  const target = STORM.deepenDepth.desktop;
  const deepen = async (halt: () => boolean, untilMs?: number): Promise<{ done: number; kept: number }> => {
    const todo = ownToWork().filter((p) => needsDeepening(p, target));
    for (let i = todo.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [todo[i], todo[j]] = [todo[j]!, todo[i]!];
    }
    const order = [...todo.filter((p) => !judges(p, STORM)), ...todo.filter((p) => judges(p, STORM))];
    const total = order.length;
    let done = 0;
    let kept = 0;
    if (total) say(`scoring ${total} positions: MultiPV ${STORM.deepenMultipv} to depth ${target}, ${engines.width} at once`);
    const lane = async () => {
      for (let p = order.shift(); p; p = order.shift()) {
        if (halt() || (untilMs !== undefined && Date.now() > untilMs)) return;
        const t0 = Date.now();
        const a = await engines.analyse(p.fen, STORM.deepenMultipv, target, STORM.deepenMs);
        if (halt() && !a) return;
        const pos = positionOf(p.fen);
        const d = pos && a ? deepenedPosition(p, engineList(a.lines, pos.turn, a.depth, STORM, a.scores), STORM) : null;
        done++;
        if (d) {
          kept++;
          const cur = store.get(p.card);
          if (cur) store.set(p.card, { ...cur, scored: d.scored, src: d.src, depth: d.depth });
        }
        say(`scored ${done} of ${total}: depth ${a?.depth ?? 0} in ${((Date.now() - t0) / 1000).toFixed(0)} s${d ? '' : ', not kept'} (${p.names[0] ?? 'a line'})`);
        if (Date.now() - lastShare > SHARE_EVERY_MS) {
          lastShare = Date.now();
          await share();
        }
      }
    };
    await Promise.all(Array.from({ length: engines.width }, lane));
    return { done, kept };
  };

  /** Maia's ratings (§5.82) for the cloud's positions lacking some. */
  const elos = maiaElos(store.values(), o.elos);
  const rate = async (): Promise<number> => {
    const todo = ownToWork().filter((p) => missingRatings(p.maia, elos[0]!, elos).length);
    if (!todo.length) return 0;
    say(`Maia rating ${todo.length} positions at ${elos.join(', ')}`);
    let n = 0;
    for (const p of todo) {
      if (stopping) break;
      const want = missingRatings(p.maia, elos[0]!, elos);
      const policies = await maiaPolicies(p.fen, want);
      if (!policies) continue;
      const fresh = want.map((e, i) => keptPolicy(e, policies[i]!));
      const cur = store.get(p.card);
      if (cur) store.set(p.card, { ...cur, maia: [...(cur.maia ?? []).filter((r) => !want.includes(r.elo)), ...fresh].sort((a, b) => a.elo - b.elo) });
      n++;
    }
    return n;
  };

  // The gather, as the storm's home runs it.
  let shownAt = 0;
  let lastLine = '';
  const show = (g: Gathering) => {
    const s = g.spent;
    const line = `${g.overnight ? `pass ${g.overnight.pass} of ${g.overnight.passes}, ${g.overnight.doing}: ` : ''}${g.frontiers} of ${g.of} walked, ${g.stored} stored · explorer ${s.explorer}, games ${s.games}, ChessDB ${s.chessdb}, Stockfish ${s.searches}${g.note ? ` · ${g.note}` : ''}`;
    if (line === lastLine || (g.running && Date.now() - shownAt < 30_000 && !g.note)) return;
    shownAt = Date.now();
    lastLine = line;
    say(line);
  };
  say(`gathering${o.overnight ? ' overnight' : ''}${o.minutes ? ` for ${minutes(o.minutes)} at most` : ''}: ${o.source === 'both' ? 'line ends and replies' : o.source === 'ends' ? 'line ends' : 'replies'}, plies ${c.minPly}–${c.maxPly} past the end`);
  const g = await runGather(scope, { source: o.source, overnight: o.overnight, config: c }, {
    io: (count, until, strict) => serviceIo(ask, engines.analyse, count, guard, STORM, Math.random, until, strict),
    positions: async () => [...store.values()],
    add: async (fresh, spare) => addPositions(store, fresh, c.storeMax, spare),
    done: () => rep.done,
    // Between passes the cloud scores everything that came in (focused, §5.105): it has the cores.
    score: async () => void (o.deepen && !walkStopped ? await deepen(() => walkStopped) : undefined),
    share: async () => {
      lastShare = Date.now();
      return share();
    },
    show,
    refresh: async () => {
      if (Date.now() - lastShare < SHARE_EVERY_MS) return;
      lastShare = Date.now();
      await share();
    },
    stopped: () => walkStopped,
    wait: (ms) => guard(sleep(ms)).then(() => undefined),
    now: () => Date.now(),
    rnd: Math.random,
  });
  clearTimeout(walkTimer);
  show({ ...g, running: false });
  const own = () => [...store.values()].filter(isOwn).length;
  say(`gathered: ${own() - ownAtStart} new positions of its own (${own()} in all)`);

  // Then what the storm's home does with them: Maia's ratings, Stockfish's standard.
  if (!stopping && o.maia) {
    const n = await rate();
    if (n) say(`Maia rated ${n} positions`);
  }
  if (!stopping && o.deepen) {
    const until = o.scoreMinutes ? Date.now() + o.scoreMinutes * 60_000 : undefined;
    const r = await deepen(() => stopping, until);
    if (r.done) say(`scored ${r.done}, ${r.kept} kept to the standard`);
  }
  await share();
  engines.quit();
  const left = ownToWork().filter((p) => needsDeepening(p, target)).length;
  say(`done in ${((Date.now() - started) / 60_000).toFixed(1)} min: ${own()} positions of its own${left ? `, ${left} still to score (a device's deepening finishes them)` : ''}${o.push ? `, ${pushed} push(es)` : ', not pushed (--push)'}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);

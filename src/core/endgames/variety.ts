// An endgame's defence varied over tries (PLAN.md §5.174, the owner's request of 2026-11-14): the
// opponent's replies met at each position remembered on the device, so a retry meets a likely reply
// not met yet (B), except straight after a miss, when the same defence comes back so the mistake can
// be put right (D). And "Maia alone": Maia's reply played without waiting on Stockfish's check,
// with only checks that need no search (the game not ended by it, no repetition for a draw's
// attacker, nothing left hanging).
import type { Position } from 'chessops/chess';

/** The least likely of Maia's moves still preferred because it hasn't been met: a move a strong player plays, not a long shot. */
export const VARY_MIN = 0.15;
/** Positions kept for each endgame, and endgames kept: the oldest go first. */
export const KEEP_POSITIONS = 300;
export const KEEP_ENDGAMES = 80;

/** One try's replies by position key, and how it ended: solved, missed, or left unfinished (undefined). */
export interface TryPath {
  replies: Record<string, string>;
  end?: 'solved' | 'missed';
}

/** One endgame's memory: how often each reply was met at each position, the try in play and the one before. */
export interface ReplyMemory {
  seen: Record<string, Record<string, number>>;
  cur?: TryPath;
  last?: TryPath;
}

/** Every endgame's memory by id, the latest used last. */
export type Memories = Record<string, ReplyMemory>;

const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);

function readPath(o: unknown): TryPath | undefined {
  if (!isObj(o) || !isObj(o['replies'])) return undefined;
  const replies: Record<string, string> = {};
  for (const [k, v] of Object.entries(o['replies'])) if (typeof v === 'string') replies[k] = v;
  const end = o['end'] === 'solved' || o['end'] === 'missed' ? o['end'] : undefined;
  return { replies, ...(end ? { end } : {}) };
}

/** The memories as stored (JSON); anything unreadable is left out, so a bad store starts afresh. */
export function readMemories(raw: string | null | undefined): Memories {
  let o: unknown;
  try {
    o = JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
  if (!isObj(o)) return {};
  const out: Memories = {};
  for (const [id, m] of Object.entries(o)) {
    if (!isObj(m) || !isObj(m['seen'])) continue;
    const seen: ReplyMemory['seen'] = {};
    for (const [key, counts] of Object.entries(m['seen'])) {
      if (!isObj(counts)) continue;
      const c: Record<string, number> = {};
      for (const [uci, n] of Object.entries(counts)) if (typeof n === 'number' && n >= 1) c[uci] = Math.floor(n);
      seen[key] = c;
    }
    const cur = readPath(m['cur']);
    const last = readPath(m['last']);
    out[id] = { seen, ...(cur ? { cur } : {}), ...(last ? { last } : {}) };
  }
  return out;
}

/** `id`'s memory changed by `f`, moved to the end (the latest used), the oldest endgames dropped past `KEEP_ENDGAMES`. */
function touch(all: Memories, id: string, f: (m: ReplyMemory) => ReplyMemory): Memories {
  const { [id]: m, ...rest } = all;
  const out: Memories = { ...rest, [id]: f(m ?? { seen: {} }) };
  const ids = Object.keys(out);
  for (const old of ids.slice(0, Math.max(0, ids.length - KEEP_ENDGAMES))) delete out[old];
  return out;
}

/** A try begun: the one in play becomes the last (when it met a reply), a new one starts. */
export const beginTry = (all: Memories, id: string): Memories =>
  touch(all, id, (m) => {
    const last = m.cur && Object.keys(m.cur.replies).length ? m.cur : m.last;
    return { seen: m.seen, cur: { replies: {} }, ...(last ? { last } : {}) };
  });

/** A reply played at the position `key`: counted, and kept as the try's. */
export const noteReply = (all: Memories, id: string, key: string, uci: string): Memories =>
  touch(all, id, (m) => {
    const { [key]: counts, ...others } = m.seen;
    const seen = { ...others, [key]: { ...counts, [uci]: (counts?.[uci] ?? 0) + 1 } };
    const keys = Object.keys(seen);
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_POSITIONS))) delete seen[old];
    const cur = m.cur ?? { replies: {} };
    return { ...m, seen, cur: { ...cur, replies: { ...cur.replies, [key]: uci } } };
  });

/** The try in play ended, solved or missed; the first end counts (a miss stays a miss). */
export const noteEnd = (all: Memories, id: string, end: 'solved' | 'missed'): Memories =>
  touch(all, id, (m) => ({ ...m, cur: { ...(m.cur ?? { replies: {} }), end: m.cur?.end ?? end } }));

/** What the defence goes by at `key`: the replies met there, and the last try's reply when that try was missed (D). */
export function replyHints(all: Memories, id: string, key: string): { seen: Record<string, number>; replay?: string } {
  const m = all[id];
  const replay = m?.last?.end === 'missed' ? m.last.replies[key] : undefined;
  return { seen: m?.seen[key] ?? {}, ...(replay ? { replay } : {}) };
}

/**
 * The order to try Maia's candidate moves in (B): those `VARY_MIN` or more likely (the likeliest
 * always among them), the ones met least often at this position first, the likelier first among
 * equals; then the rest, likeliest first. With nothing met, simply the likeliest first.
 */
export function replyOrder<M extends { uci: string; prob: number }>(candidates: readonly M[], seen: Readonly<Record<string, number>> = {}): M[] {
  const byProb = [...candidates].sort((a, b) => b.prob - a.prob);
  const top = byProb[0];
  const decent = byProb.filter((m) => m === top || m.prob >= VARY_MIN);
  const met = (m: M) => seen[m.uci] ?? 0;
  return [...[...decent].sort((a, b) => met(a) - met(b) || b.prob - a.prob), ...byProb.filter((m) => !decent.includes(m))];
}

const VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 } as const;

/**
 * Whether the side not to move has left something hanging, read from the board alone (no search):
 * a piece the side to move can take with a cheaper one, or one taken with nothing to take back (a
 * king alone doesn't take back on a square the taker's side covers again). "Maia alone"'s stand-in
 * for Stockfish's material check (§5.147 found Maia hanging a rook).
 */
export function hangs(pos: Position): boolean {
  for (const [from, dests] of pos.allDests()) {
    const taker = pos.board.get(from);
    if (!taker) continue;
    for (const to of dests) {
      const victim = pos.board.get(to);
      if (!victim || victim.color === pos.turn || victim.role === 'king') continue;
      if (taker.role !== 'king' && VALUE[victim.role] > VALUE[taker.role]) return true;
      const occupied = pos.board.occupied.without(from);
      const defenders = pos.kingAttackers(to, victim.color, occupied);
      if (defenders.isEmpty()) return true;
      const kingOnly = defenders.size() === 1 && pos.board.king.has(defenders.first()!);
      if (kingOnly && pos.kingAttackers(to, pos.turn, occupied).without(from).nonEmpty()) return true;
    }
  }
  return false;
}

/**
 * "Maia alone"'s reply: no Stockfish, so only checks that need no search. A draw's attacker's pawn
 * push first when asked for (§5.148), Maia's likeliest that ends nothing, repeats nothing and hangs
 * nothing; then the moves in `ordered` (the last try's reply first after a miss, then
 * `replyOrder`'s), the first passing those checks; else the first of them, then of Maia's, that at
 * least ends and repeats nothing (a lost defence may have to give something up); undefined when
 * none does (Stockfish then). `policy` is Maia's whole answer, `pushes` the pawn pushes to try;
 * repetitions count only for a draw's attacker.
 */
export function trustPick(
  goal: 'win' | 'draw',
  ordered: readonly string[],
  policy: readonly { uci: string; prob: number }[],
  pushes: readonly string[],
  check: { over(uci: string): boolean; repeats(uci: string): boolean; hangs(uci: string): boolean },
): { uci: string; push?: boolean } | undefined {
  const repeats = (uci: string) => goal === 'draw' && check.repeats(uci);
  const quiet = (uci: string) => !check.over(uci) && !repeats(uci);
  const prob = (uci: string) => policy.find((m) => m.uci === uci)?.prob ?? 0;
  const push = pushes.filter((u) => quiet(u) && !check.hangs(u)).sort((a, b) => prob(b) - prob(a))[0];
  if (push) return { uci: push, push: true };
  const safe = ordered.find((u) => quiet(u) && !check.hangs(u));
  if (safe) return { uci: safe };
  const any = [...ordered, ...policy.map((m) => m.uci)].find(quiet);
  return any ? { uci: any } : undefined;
}

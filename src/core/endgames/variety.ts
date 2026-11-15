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
  /** A course drill's author's reply was played in this try (`noteReply`'s `byAuthor`). */
  author?: true;
}

/** One endgame's memory: how often each reply was met at each position, the try in play and the one before. */
export interface ReplyMemory {
  seen: Record<string, Record<string, number>>;
  cur?: TryPath;
  last?: TryPath;
  /** A try that met the course author's replies was solved: from then on the defence varies (`authorFirst`). */
  authorSolved?: true;
}

/** Every endgame's memory by id, the latest used last. */
export type Memories = Record<string, ReplyMemory>;

const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);

function readPath(o: unknown): TryPath | undefined {
  if (!isObj(o) || !isObj(o['replies'])) return undefined;
  const replies: Record<string, string> = {};
  for (const [k, v] of Object.entries(o['replies'])) if (typeof v === 'string') replies[k] = v;
  const end = o['end'] === 'solved' || o['end'] === 'missed' ? o['end'] : undefined;
  return { replies, ...(end ? { end } : {}), ...(o['author'] === true ? { author: true as const } : {}) };
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
    out[id] = { seen, ...(cur ? { cur } : {}), ...(last ? { last } : {}), ...(m['authorSolved'] === true ? { authorSolved: true as const } : {}) };
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
    return { ...m, cur: { replies: {} }, ...(last ? { last } : {}) };
  });

/** A reply played at the position `key`: counted, and kept as the try's; `byAuthor` when it was the course author's. */
export const noteReply = (all: Memories, id: string, key: string, uci: string, byAuthor = false): Memories =>
  touch(all, id, (m) => {
    const { [key]: counts, ...others } = m.seen;
    const seen = { ...others, [key]: { ...counts, [uci]: (counts?.[uci] ?? 0) + 1 } };
    const keys = Object.keys(seen);
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_POSITIONS))) delete seen[old];
    const cur = m.cur ?? { replies: {} };
    return { ...m, seen, cur: { ...cur, replies: { ...cur.replies, [key]: uci }, ...(byAuthor ? { author: true as const } : {}) } };
  });

/** The try in play ended, solved or missed; the first end counts (a miss stays a miss). */
export const noteEnd = (all: Memories, id: string, end: 'solved' | 'missed'): Memories =>
  touch(all, id, (m) => {
    const first = m.cur?.end ?? end;
    const solved = m.authorSolved || (first === 'solved' && m.cur?.author);
    return { ...m, cur: { ...(m.cur ?? { replies: {} }), end: first }, ...(solved ? { authorSolved: true as const } : {}) };
  });

/**
 * Whether a course drill's defence is still the author's (the owner's request of 2026-11-15): the
 * course's own replies, where it has one, until a try that met them is solved; then Maia's, varied.
 */
export const authorFirst = (all: Memories, id: string): boolean => !all[id]?.authorSolved;

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
/** A king's worth in an exchange: it takes only where nothing takes back, so it is never taken. */
const KING_SWAP = 100;
const worth = (role: keyof typeof VALUE): number => (role === 'king' ? KING_SWAP : VALUE[role]);

/**
 * What the side to move wins by taking on `to` with the piece on `from` and the exchange that
 * follows there, each side taking with its cheapest piece and stopping when going on would cost it
 * (a static exchange evaluation). A king takes only where nothing of the other side covers the
 * square any more. Pins and checks are not looked at after the first capture. Pure.
 */
export function exchangeGain(pos: Position, from: number, to: number): number {
  const victim = pos.board.get(to);
  const taker = pos.board.get(from);
  if (!victim || !taker) return 0;
  const gain: number[] = [VALUE[victim.role]];
  let occupied = pos.board.occupied.without(from);
  let onSquare = worth(taker.role);
  let side: 'white' | 'black' = pos.turn === 'white' ? 'black' : 'white';
  for (;;) {
    const attackers = pos.kingAttackers(to, side, occupied).intersect(occupied);
    if (attackers.isEmpty()) break;
    let from2: number | undefined;
    let least = Infinity;
    for (const sq of attackers) {
      const w = worth(pos.board.get(sq)!.role);
      if (w < least) [least, from2] = [w, sq];
    }
    const other = side === 'white' ? 'black' : 'white';
    if (least === KING_SWAP && pos.kingAttackers(to, other, occupied.without(from2!)).intersect(occupied).nonEmpty()) break;
    gain.push(onSquare - gain[gain.length - 1]!);
    onSquare = least;
    occupied = occupied.without(from2!);
    side = other;
  }
  for (let d = gain.length - 1; d > 0; d--) gain[d - 1] = -Math.max(-gain[d - 1]!, gain[d]!);
  return gain[0]!;
}

/** The most material the side to move wins by a capture now (its legal captures, each with the exchange after it); 0 when none wins anything. */
export function captureGain(pos: Position): number {
  let best = 0;
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const victim = pos.board.get(to);
      if (!victim || victim.color === pos.turn || victim.role === 'king') continue;
      best = Math.max(best, exchangeGain(pos, from, to));
    }
  }
  return best;
}

/**
 * Whether the side not to move has left material to be won, read from the board alone (no search):
 * the side to move wins more by a capture and the exchange after it (`captureGain`) than the move
 * just made won (`gained`: a capture's worth, a promotion's, so an exchange begun isn't counted as a
 * piece left hanging). "Maia alone"'s stand-in for Stockfish's material check (§5.147 found Maia
 * hanging a rook; the owner's report of 2026-11-15: a pawn pushed where two pieces take it and one
 * defends it, b5+ against a6 and Kc6, given away).
 */
export function hangs(pos: Position, gained = 0): boolean {
  return captureGain(pos) > gained;
}

/**
 * The least likely push "Maia alone" plays for a draw's attacker's progress (§5.148): the pushes a
 * player makes there (Philidor's e6 7%, the king-and-pawn ending's e5 28%) and not a long shot (the
 * owner's report of 2026-11-15: b5+ at 0.6%, which gave a pawn away and lost a drawn game).
 */
export const PUSH_MIN = 0.02;

/** How much worse than the best (the mover's expected score, 0 to 1) Lc0 may rate a move before it is vetoed. */
export const LC0_MARGIN = 0.1;

/**
 * "Maia alone"'s veto, from Lc0's value of each move (the mover's expected score after it, one
 * network run on the position it leads to): the moves rated more than `margin` below the best of
 * them that gives nothing away (`firm`; of all of them when none does). Lc0 has no search here, so it can't tell a move from its near equals (the 0.30 to 1.00 slips
 * Maia now and then makes, which it rates alike), but it sees the ones that lose or draw away a game
 * (a king step that loses the opposition: 0.11 against 0.49, PLAN.md §5.176). Pure.
 */
export function lc0Vetoed(values: Readonly<Record<string, number>>, margin = LC0_MARGIN, firm: (uci: string) => boolean = () => true): Set<string> {
  // The best is a move that gives nothing away (`firm`): one run can't see a pawn simply taken, and
  // rates the move that drops it above the sound ones (the owner's report of 2026-11-15: 2…f6, which
  // g5 takes, 0.42 against 2…Kd6's 0.31, so Kd6 and Kb6 were vetoed and f6 played every try).
  const sound = Object.keys(values).filter(firm);
  const best = Math.max(...(sound.length ? sound : Object.keys(values)).map((u) => values[u]!));
  return new Set(Object.keys(values).filter((u) => best - values[u]! > margin));
}

/**
 * "Maia alone"'s reply: no Stockfish, so only checks that need no search. A draw's attacker's pawn
 * push first when asked for (§5.148), Maia's likeliest of those `PUSH_MIN` or likelier that throws nothing away, repeats nothing and
 * hangs nothing; then the moves in `ordered` (the last try's reply first after a miss, then
 * `replyOrder`'s), the first passing those checks. Only moves of `ordered` are ever played: a
 * move Maia gives 0.3% is not an alternative (the owner's report of 2026-11-14: a 99% move that
 * repeated the position was passed over for Kd3). Failing the checks, the first of `ordered` that
 * throws nothing away and hangs nothing though it repeats a position (a draw's attacker with no other
 * decent move: the repetition is the honest reply), else the first that throws nothing away and
 * repeats nothing (a lost defence may have to give something up); undefined when none does
 * (Stockfish then).
 * A move that ends the game (`check.ends`) is taken as its result: a mate, or a defence's draw
 * (stalemate, a dead position), is the mover's best and played like any sound move, hanging or not;
 * an attacker's draw throws its win away (§5.147's stalemates) and is passed over, unless `vetted`
 * (Lc0 has rated what's left, §5.176) and it is all that is left: then every other move lost
 * (the owner's report of 2026-11-14, Réti: 8…Kxc7, king against king, passed over for Kb5, which
 * loses the queen ending).
 * `policy` is Maia's whole answer (the pushes' likelihoods), `pushes` the pawn pushes to try;
 * repetitions count only for a draw's attacker.
 */
export function trustPick(
  goal: 'win' | 'draw',
  ordered: readonly string[],
  policy: readonly { uci: string; prob: number }[],
  pushes: readonly string[],
  check: { ends(uci: string): 'mate' | 'draw' | undefined; repeats(uci: string): boolean; hangs(uci: string): boolean },
  vetted = false,
): { uci: string; push?: boolean } | undefined {
  const repeats = (uci: string) => goal === 'draw' && check.repeats(uci);
  // The user holding a draw makes the opponent the attacker: a draw on the board is its win given away.
  const throws = (uci: string) => goal === 'draw' && check.ends(uci) === 'draw';
  const ends = (uci: string) => check.ends(uci) !== undefined;
  const quiet = (uci: string) => !throws(uci) && !repeats(uci);
  const firm = (uci: string) => ends(uci) || !check.hangs(uci);
  const prob = (uci: string) => policy.find((m) => m.uci === uci)?.prob ?? 0;
  const push = pushes.filter((u) => prob(u) >= PUSH_MIN && quiet(u) && firm(u)).sort((a, b) => prob(b) - prob(a))[0];
  if (push) return { uci: push, push: true };
  const safe = ordered.find((u) => quiet(u) && firm(u));
  if (safe) return { uci: safe };
  const repeating = ordered.find((u) => !throws(u) && firm(u));
  if (repeating) return { uci: repeating };
  const any = ordered.find(quiet);
  if (any) return { uci: any };
  const drawn = vetted ? ordered.find(throws) : undefined;
  return drawn ? { uci: drawn } : undefined;
}

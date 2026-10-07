// Voice input (PLAN.md §5.63), a port of mistake-lab's voice matcher (`c525403`): its lexicon
// (homophones and spelling words for pieces, files, ranks, captures, castling and yes/no), the
// heard text turned into tokens (`voiceHeardToValues`, "ninety-five" as "knight e five", "e4"
// split), the phrasings of every legal move (`voiceBuildMovePhrasings`), a token edit distance
// (`voiceTokenDistance`) and the matcher (`voiceMatchMove`: the closest move within 0.75 a token,
// a near tie refused as ambiguous unless one pawn move is among them and no piece was heard), and
// the move spoken back (`voiceMoveToSpeech`). Pure.
import type { Position } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { makeSquare } from 'chessops/util';
import type { NormalMove } from 'chessops/types';
import { standardUci } from '../chess/uci.ts';

export const VOICE_LEX: Readonly<Record<string, string>> = {
  // ── Knight ──
  'knight': 'N', 'knights': 'N', 'night': 'N', 'nights': 'N', 'horse': 'N', 'nite': 'N',
  'ninth': 'N', 'nice': 'N', 'knife': 'N', 'knit': 'N',
  'right': 'N', 'rights': 'N', 'white': 'N', 'light': 'N', 'lights': 'N',
  'site': 'N', 'sites': 'N', 'sight': 'N', 'sights': 'N',
  'fight': 'N', 'fights': 'N', 'height': 'N', 'heights': 'N',
  'might': 'N', 'wight': 'N',
  // ── Rook ──
  'rook': 'R', 'rooks': 'R', 'book': 'R', 'booked': 'R', 'took': 'R', 'look': 'R',
  'shook': 'R', 'hook': 'R', 'hooks': 'R', 'hooked': 'R',
  'crook': 'R', 'cook': 'R', 'cooks': 'R', 'brook': 'R', 'brooks': 'R', 'brooke': 'R',
  'cooke': 'R', 'nook': 'R', 'mistook': 'R', 'hooke': 'R', 'tooke': 'R',
  'snook': 'R', 'crooke': 'R', 'retook': 'R', 'looked': 'R', 'stood': 'R', 'wood': 'R',
  'rock': 'R', 'rookie': 'R', 'truck': 'R', 'luke': 'R', 'crooked': 'R', 'ruck': 'R',
  // ── Queen ──
  'queen': 'Q', 'queens': 'Q', 'bean': 'Q', 'beane': 'Q', 'been': 'Q', 'beene': 'Q',
  'clean': 'Q', 'gene': 'Q', 'green': 'Q', 'greene': 'Q', 'keen': 'Q', 'keene': 'Q',
  'mean': 'Q', 'quean': 'Q', 'queene': 'Q', 'scene': 'Q', 'sheen': 'Q', 'tween': 'Q',
  'kean': 'Q', 'teen': 'Q', 'cream': 'Q',
  // ── King ──
  'king': 'K', 'kings': 'K', 'thing': 'K', 'things': 'K', 'bring': 'K', 'spring': 'K',
  'ring': 'K', 'string': 'K', 'wing': 'K', 'sing': 'K', 'ming': 'K', 'cling': 'K',
  'sting': 'K', 'ling': 'K', 'ping': 'K', 'sling': 'K', 'ting': 'K', 'fling': 'K',
  'ding': 'K', 'bing': 'K', 'wring': 'K', 'ging': 'K', 'jing': 'K', 'qing': 'K',
  'kling': 'K', 'hing': 'K',
  // ── Bishop ──
  'bishop': 'B', 'bishops': 'B', 'bitch': 'B', 'tissue': 'B', 'chip': 'B',
  'dish up': 'B', 'fish up': 'B', 'switch up': 'B', 'this up': 'B', 'which up': 'B',
  'hyssop': 'B', 'hitch up': 'B', 'pick up': 'B',
  // ── Pawn ──
  'pawn': 'P', 'pawns': 'P', 'pond': 'P', 'palm': 'P',
  // ── Files — primary recommended words ──
  'ace': 'a', 'boy': 'b', 'cat': 'c', 'dog': 'd', 'egg': 'e', 'fox': 'f', 'golf': 'g', 'hot': 'h',
  // ── Files — bare letters ──
  'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd', 'e': 'e', 'f': 'f', 'g': 'g', 'h': 'h',
  // ── Files — phonetic / NATO + other aliases ──
  'alpha': 'a', 'alfa': 'a', 'anna': 'a', 'apple': 'a', 'able': 'a', 'ay': 'a', 'eh': 'a',
  'bravo': 'b', 'beta': 'b', 'baker': 'b', 'bee': 'b', 'be': 'b',
  'charlie': 'c', 'chris': 'c', 'sea': 'c', 'see': 'c',
  'delta': 'd', 'david': 'd', 'dee': 'd', 'day': 'd',
  'echo': 'e', 'edward': 'e', 'easy': 'e', 'eagle': 'e', 'he': 'e', 'eat': 'e', 'eve': 'e',
  'foxtrot': 'f', 'frank': 'f', 'fred': 'f', 'of': 'f',
  'george': 'g', 'gee': 'g',
  'hotel': 'h', 'henry': 'h', 'harry': 'h', 'age': 'h', 'each': 'h',
  // ── Ranks ──
  '1': '1', 'one': '1', 'won': '1',
  '2': '2', 'two': '2', 'too': '2', 'tu': '2',
  '3': '3', 'three': '3', 'tree': '3', 'free': '3',
  '4': '4', 'four': '4', 'fore': '4',
  '5': '5', 'five': '5', 'fife': '5', 'hive': '5',
  '6': '6', 'six': '6',
  '7': '7', 'seven': '7',
  '8': '8', 'eight': '8', 'ate': '8',
  // ── Capture / special ──
  'takes': 'x', 'take': 'x', 'capture': 'x', 'captures': 'x',
  'promote': '=', 'promotes': '=', 'promotion': '=', 'equals': '=',
  'castle': 'O', 'castles': 'O',
  'hassle': 'O', 'hassel': 'O', 'tassel': 'O', 'dazzle': 'O', 'battle': 'O',
  'short': 'O-O', 'kingside': 'O-O', 'king side': 'O-O',
  'long': 'O-O-O', 'queenside': 'O-O-O', 'queen side': 'O-O-O',
  // ── Confirmation ──
  'yes': 'YES', 'yeah': 'YES', 'yep': 'YES', 'yup': 'YES', 'correct': 'YES',
  'confirm': 'YES', 'ok': 'YES', 'okay': 'YES', 'sure': 'YES', 'go': 'YES', 'play': 'YES',
  'no': 'NO', 'nah': 'NO', 'nope': 'NO', 'cancel': 'NO', 'wrong': 'NO', 'undo': 'NO',
  // ── Noise / filler ──
  'to': '_IGNORE', 'the': '_IGNORE', 'on': '_IGNORE',
  'uh': '_IGNORE', 'um': '_IGNORE', 'and': '_IGNORE', 'hmm': '_IGNORE',
  'check': '_IGNORE', 'mate': '_IGNORE',
};

const FILES = new Set('abcdefgh');
const RANKS = new Set('12345678');
const PIECES = new Set('PNBRQK');

const EXPAND: Record<string, string[]> = {
  ninety: ['knight', 'e'],
  'ninety-five': ['knight', 'e', 'five'],
  'ninety-four': ['knight', 'e', 'four'],
  'ninety-three': ['knight', 'e', 'three'],
  'ninety-two': ['knight', 'e', 'two'],
  'ninety-one': ['knight', 'e', 'one'],
  'ninety-six': ['knight', 'e', 'six'],
  'ninety-seven': ['knight', 'e', 'seven'],
  'ninety-eight': ['knight', 'e', 'eight'],
};

/** `voiceHeardToValues`: the heard words as tokens (a piece letter, a file, a rank, x, =, O, YES, NO). */
export function heardToValues(raw: string): string[] {
  const words = raw.toLowerCase().trim().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const exp = EXPAND[words[i]!];
    if (exp) {
      words.splice(i, 1, ...exp);
      i += exp.length - 1;
    }
  }
  for (let i = 0; i < words.length; i++) {
    if (/^9[1-8]$/.test(words[i]!)) {
      words.splice(i, 1, 'knight', 'e', words[i]![1]!);
      i += 2;
    }
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (VOICE_LEX[w]) continue;
    if (w.length < 2) continue;
    const chars: string[] = [];
    let all = true;
    for (const ch of w) {
      if (/[a-h1-8]/.test(ch)) chars.push(ch);
      else {
        all = false;
        break;
      }
    }
    if (all && chars.length >= 2) {
      words.splice(i, 1, ...chars);
      i += chars.length - 1;
    }
  }
  const values: string[] = [];
  for (const w of words) {
    const v = VOICE_LEX[w];
    if (v && v !== '_IGNORE') values.push(v);
  }
  return values;
}

interface Legal {
  san: string;
  uci: string;
  piece: string;
  from: string;
  to: string;
  capture: boolean;
}

function legalMoves(pos: Position): Legal[] {
  const out: Legal[] = [];
  for (const [from, dests] of pos.allDests()) {
    const piece = pos.board.get(from)!;
    for (const to of dests) {
      const promoting = piece.role === 'pawn' && ((to >> 3) === 7 || (to >> 3) === 0);
      for (const promotion of promoting ? (['queen', 'rook', 'bishop', 'knight'] as const) : [undefined]) {
        const move: NormalMove = promotion ? { from, to, promotion } : { from, to };
        const san = makeSan(pos, move);
        const uci = standardUci(pos, move);
        const letter = piece.role === 'knight' ? 'N' : piece.role === 'pawn' ? 'P' : piece.role[0]!.toUpperCase();
        out.push({ san, uci, piece: letter, from: makeSquare(from), to: uci.slice(2, 4), capture: san.includes('x') });
      }
    }
  }
  return out;
}

/** `voiceBuildMovePhrasings`: every way to say each legal move, as tokens. */
export function movePhrasings(pos: Position): Map<string, { uci: string; pawn: boolean; phrasings: string[][] }> {
  const legal = legalMoves(pos);
  const toSquare = new Map<string, Legal[]>();
  for (const m of legal) {
    if (m.piece === 'P') continue;
    const k = `${m.piece}_${m.to}`;
    toSquare.set(k, [...(toSquare.get(k) ?? []), m]);
  }
  const out = new Map<string, { uci: string; pawn: boolean; phrasings: string[][] }>();
  for (const m of legal) {
    const [fromF, fromR] = [m.from[0]!, m.from[1]!];
    const [toF, toR] = [m.to[0]!, m.to[1]!];
    const phrasings: string[][] = [];
    if (m.san.startsWith('O-O-O')) {
      out.set(m.san, { uci: m.uci, pawn: false, phrasings: [['O-O-O'], ['O']] });
      continue;
    }
    if (m.san.startsWith('O-O')) {
      out.set(m.san, { uci: m.uci, pawn: false, phrasings: [['O-O'], ['O']] });
      continue;
    }
    const promo = /=([NBRQ])/.exec(m.san);
    const suffix = promo ? [promo[1]!] : [];
    if (m.piece === 'P') {
      phrasings.push([toF, toR, ...suffix]);
      phrasings.push(['P', toF, toR, ...suffix]);
      if (m.capture) {
        phrasings.push([fromF, 'x', toF, toR, ...suffix]);
        phrasings.push([fromF, toF, toR, ...suffix]);
        phrasings.push(['P', 'x', toF, toR, ...suffix]);
      }
      phrasings.push([fromF, fromR, toF, toR, ...suffix]);
    } else {
      const siblings = toSquare.get(`${m.piece}_${m.to}`) ?? [];
      phrasings.push([m.piece, toF, toR]);
      if (m.capture) phrasings.push([m.piece, 'x', toF, toR]);
      if (siblings.length > 1) {
        const sameFile = siblings.some((s) => s.from[0] === fromF && s.from !== m.from);
        const sameRank = siblings.some((s) => s.from[1] === fromR && s.from !== m.from);
        if (!sameFile) {
          phrasings.push([m.piece, fromF, toF, toR]);
          if (m.capture) phrasings.push([m.piece, fromF, 'x', toF, toR]);
        }
        if (!sameRank) {
          phrasings.push([m.piece, fromR, toF, toR]);
          if (m.capture) phrasings.push([m.piece, fromR, 'x', toF, toR]);
        }
        phrasings.push([m.piece, fromF, fromR, toF, toR]);
      }
      phrasings.push([fromF, fromR, toF, toR]);
    }
    out.set(m.san, { uci: m.uci, pawn: m.piece === 'P', phrasings });
  }
  return out;
}

/** `voiceTokenDistance`: an edit distance where a file for a file, a rank for a rank, a piece for a piece costs less. */
export function tokenDistance(heard: readonly string[], target: readonly string[]): number {
  const n = heard.length;
  const m = target.length;
  // Float32, as mistake-lab's table: its sums round the same way.
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i]![0] = i * 0.6;
  for (let j = 0; j <= m; j++) dp[0]![j] = j * 0.6;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const h = heard[i - 1]!;
      const t = target[j - 1]!;
      const sub = h === t ? 0 : FILES.has(h) && FILES.has(t) ? 0.8 : RANKS.has(h) && RANKS.has(t) ? 0.8 : PIECES.has(h) && PIECES.has(t) ? 0.9 : 1.2;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 0.6, dp[i]![j - 1]! + 0.8, dp[i - 1]![j - 1]! + sub);
    }
  return dp[n]![m]!;
}

export type VoiceResult = { type: 'confirm'; value: boolean } | { type: 'move'; san: string; uci: string } | { type: 'ambiguous'; moves: string[] };

/** `voiceMatchMove`: what the tokens say in this position (`pending`: a move waits for yes or no). */
export function matchMove(values: readonly string[], pos: Position, pending = false): VoiceResult | null {
  if (!values.length) return null;
  if (pending) {
    if (values.includes('YES')) return { type: 'confirm', value: true };
    if (values.includes('NO')) return { type: 'confirm', value: false };
  }
  const phrasings = movePhrasings(pos);
  const sans = [...phrasings.keys()];
  const move = (san: string): VoiceResult => ({ type: 'move', san, uci: phrasings.get(san)!.uci });
  if (values.includes('O-O') || values.includes('O-O-O') || values.includes('O')) {
    const wantsLong = values.includes('O-O-O');
    const castles = sans.filter((s) => s.startsWith('O-O'));
    const long = castles.find((s) => s.startsWith('O-O-O'));
    const short = castles.find((s) => !s.startsWith('O-O-O'));
    if (wantsLong && long) return move(long);
    if (!wantsLong && short) return move(short);
    if (castles.length === 1) return move(castles[0]!);
    return null;
  }
  const moveValues = values.filter((v) => v !== 'YES' && v !== 'NO');
  if (!moveValues.length) return null;
  const results: { san: string; cost: number }[] = [];
  for (const [san, { phrasings: ph }] of phrasings) {
    let best = Infinity;
    for (const p of ph) best = Math.min(best, tokenDistance(moveValues, p) / Math.max(p.length, 1));
    results.push({ san, cost: best });
  }
  results.sort((a, b) => a.cost - b.cost);
  if (!results.length) return null;
  const bestCost = results[0]!.cost;
  if (bestCost > 0.75) return null;
  const second = results.length > 1 ? results[1]!.cost : Infinity;
  if (second - bestCost > 0.1) return move(results[0]!.san);
  const tied = results.filter((r) => r.cost - bestCost <= 0.1);
  if (!moveValues.some((v) => PIECES.has(v))) {
    const pawns = tied.filter((r) => phrasings.get(r.san)!.pawn);
    if (pawns.length === 1) return move(pawns[0]!.san);
  }
  if (tied.length > 1) return { type: 'ambiguous', moves: tied.map((r) => r.san) };
  return move(tied[0]!.san);
}

/** `voiceMoveToSpeech`: "Knight takes e, 5", "castles short". */
export function moveToSpeech(san: string): string {
  if (san.startsWith('O-O-O')) return 'castles long';
  if (san.startsWith('O-O')) return 'castles short';
  let s = san.replace(/[+#]/g, '');
  const pieces: Record<string, string> = { N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' };
  const parts: string[] = [];
  let promo = '';
  const pm = /=([NBRQ])/.exec(s);
  if (pm) {
    promo = pieces[pm[1]!] ?? pm[1]!;
    s = s.replace(/=[NBRQ]/, '');
  }
  if (/^[NBRQK]/.test(s)) {
    parts.push(pieces[s[0]!]!);
    s = s.slice(1);
  }
  for (const ch of s) parts.push(ch === 'x' ? 'takes' : ch);
  if (promo) parts.push('promotes to', promo);
  let speech = parts[0] ?? '';
  for (let i = 1; i < parts.length; i++) speech += parts[i - 1]!.length === 1 && parts[i]!.length === 1 ? `, ${parts[i]}` : ` ${parts[i]}`;
  return speech;
}

/** The words the recognizer is nudged towards (mistake-lab's phrase boosts). */
export const BIAS: readonly [string, number][] = [
  ['knight', 8], ['bishop', 8], ['rook', 8], ['queen', 8], ['king', 8], ['pawn', 6], ['castle', 7], ['takes', 6],
  ['ace', 6], ['boy', 6], ['cat', 6], ['dog', 6], ['egg', 6], ['fox', 6], ['golf', 6], ['hot', 6], ['yes', 4], ['no', 4],
];

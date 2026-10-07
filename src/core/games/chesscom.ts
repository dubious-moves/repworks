// A chess.com archive game (`api.chess.com/pub/player/<name>/games/<YYYY>/<MM>`'s `games[]`) as a
// game record (PLAN.md §5.51), as mistake-lab's analyzer normalizes it (`normalizeChesscomGame`):
// standard chess only, six plies at least, the id `chesscom_<number>`, the time class, clocks from
// the PGN's `%clk`. chess.com games carry no evaluations: the analyzer adds them. Pure.
import { parseComment, parsePgn } from 'chessops/pgn';
import { readGame, type GameRecord } from './record.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** mistake-lab's `inferTimeClass`, for a game without chess.com's own. */
export function timeClass(tc: string | undefined): string {
  if (!tc) return 'rapid';
  const [base, inc] = tc.split('+');
  const total = (parseInt(base ?? '', 10) || 600) + 40 * (parseInt(inc ?? '', 10) || 0);
  return total < 180 ? 'bullet' : total < 600 ? 'blitz' : total < 1800 ? 'rapid' : 'classical';
}

export function readChesscomGame(g: unknown, username: string): GameRecord | undefined {
  if (!isObj(g) || typeof g['pgn'] !== 'string') return undefined;
  if ((g['rules'] ?? 'chess') !== 'chess') return undefined;
  const pgn = g['pgn'];
  const [game] = parsePgn(pgn);
  if (!game) return undefined;
  const moves: string[] = [];
  const clocks: (number | null)[] = [];
  for (const node of game.moves.mainline()) {
    moves.push(node.san);
    const clock = (node.comments ?? []).map((c) => parseComment(c).clock).find((c) => c !== undefined);
    clocks.push(clock === undefined ? null : Math.round(clock * 10) / 10);
  }
  if (moves.length < 6) return undefined;
  const h = game.headers;
  const white = h.get('White') ?? 'Unknown';
  const black = h.get('Black') ?? 'Unknown';
  const url = typeof g['url'] === 'string' ? g['url'] : '';
  const end = typeof g['end_time'] === 'number' ? g['end_time'] : 0;
  const id = 'chesscom_' + (/\/(\d+)$/.exec(url)?.[1] ?? String(end));
  const read = readGame(
    {
      id,
      moves: moves.join(' '),
      rated: g['rated'] === true,
      players: { white: { user: { name: white, id: white.toLowerCase() } }, black: { user: { name: black, id: black.toLowerCase() } } },
      opening: { name: h.get('ECOUrl') ? decodeURIComponent(h.get('ECOUrl')!.split('/').pop() ?? '').replace(/-/g, ' ') : (h.get('Opening') ?? 'Unknown') },
      createdAt: end * 1000,
      speed: typeof g['time_class'] === 'string' ? g['time_class'] : timeClass(h.get('TimeControl')),
      pgn,
      _source: 'chesscom',
      _playerColor: white.toLowerCase() === username.toLowerCase() ? 'white' : 'black',
      ...(h.get('SetUp') === '1' && h.get('FEN') ? { initialFen: h.get('FEN') } : {}),
      ...(clocks.some((c) => c !== null) ? { clocks, _clocksStamped: true } : {}),
    },
    new Set([username.toLowerCase()]),
  );
  return read.ok ? read.game : undefined;
}

// What a Practical cell and a prepared bar say about themselves (PLAN.md §5.24): q_extension's
// tooltips (`peTooltip`, `peValueLine`, `peReplyLines`, `peSwitchLines`, `peDepthLine`,
// `prepTooltip`, `filterLabel` in `src/main-world.js` at c26242f, by the same owner), under this
// repo's GPL-3.0-or-later, Maia's lines (§5.34) and the preview's (`pePreviewTooltip`) included.
// Lines of text: the desktop shows them as a title, the phone in a box under the table.
import { expectedScore, type RowResult, type Side, type Split } from './search.ts';

export interface DetailOptions {
  /** Percent, as the settings have it. */
  replyThreshold: number;
  minGames: number;
  /** The filter, as the column describes it: `blitz/rapid/classical, 1600–2500`. */
  filter: string;
  /** Whether ChessDB is asked to analyse what it doesn't know (D9). */
  analyse: boolean;
  /** Maia fills in below this many games (q_extension's maiaUntil, §5.34). */
  maiaUntil?: number;
}

export const MAIA_MISSING = 'Maia unavailable: switch Maia on (the engine bar) to fill thin positions in with its predictions.';

export function filterLabel(speeds: readonly string[], ratings: readonly number[]): string {
  const r = [...ratings].sort((a, b) => a - b);
  const rr = r.length ? (r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : String(r[0])) : 'all';
  return `${speeds.join('/')}, ${rr}`;
}

const pct = (f: number) => Math.round(f * 100);
const splitText = (s: Split) => `${pct(s.w)} / ${pct(s.d)} / ${pct(s.b)}`;
const count = (n: number) => n.toLocaleString('en-US');

// "<label> (mean 54%) · engine 55% (+3)". The mean is the value with plain means at the opponent
// nodes, shown when risk aversion moves the value.
function valueLine(label: string, r: RowResult): string {
  const diff = r.engine != null ? Math.round(r.value! - r.engine) : null;
  if (r.mean != null && Math.round(r.mean) !== Math.round(r.value!)) label += ` (mean ${Math.round(r.mean)}%)`;
  return label + (r.engine != null ? ` · engine ${Math.round(r.engine)}% (${diff! >= 0 ? '+' : ''}${diff})` : '');
}

// The main replies, then the tail valued by engine and the share left out.
function replyLines(r: RowResult, lines: string[], o: DetailOptions, maiaMark = true) {
  const min = o.replyThreshold / 100;
  for (const x of (r.replies ?? []).filter((x) => x.share >= min).slice(0, 8)) {
    lines.push(`  ${x.san}  ${Math.round(x.share * 100)}% → ${Math.round(x.v)}%${x.move ? `  (${x.move})` : ''}${maiaMark && x.maiaOnly ? '  Maia' : ''}`);
  }
  if ((r.tailShare ?? 0) > 0.0005) lines.push(`  others under ${o.replyThreshold}%: ${((r.tailShare ?? 0) * 100).toFixed(1)}% (engine eval)`);
  if ((r.unexplained ?? 0) > 0.0005) lines.push(`  no engine eval: ${((r.unexplained ?? 0) * 100).toFixed(1)}% (left out)`);
}

function switchLines(r: RowResult, lines: string[]) {
  for (const w of r.switches ?? []) lines.push(`Your move ${w.path.length ? `after ${w.path.join(' ')}` : 'here'}: ${w.to}, not ChessDB’s ${w.from} (+${w.gain.toFixed(1)})`);
}

export function depthLine(r: RowResult): string {
  let depth = `Depth ${r.depth} · ${r.positions} position${r.positions === 1 ? '' : 's'} searched`;
  if (r.final === false) depth += ' · searching deeper…';
  else if (r.stopped === 'budget') depth += ' · stopped: request budget for this position used';
  else if (r.stopped === 'maxPly') depth += ' · stopped at the depth limit';
  else if (r.stopped === 'error') depth += ' · stopped: a request failed';
  else if (r.complete) depth += ' · complete: nothing deeper to search';
  return depth;
}

/** A Practical cell's details. */
export function practicalDetails(r: RowResult, o: DetailOptions, preview?: RowResult): string[] {
  if (r.state === 'few') {
    return [`Only ${r.games ?? 0} games here with the current filter (minimum ${o.minGames}).`, ...(r.engine != null ? [`Engine: ${Math.round(r.engine)}%`] : []), ...(r.maiaMissing ? [MAIA_MISSING] : [])];
  }
  if (r.state === 'none') return ['ChessDB has no eval for this position.'];
  if (r.state === 'error') return [r.reason ?? 'Error', 'Click to retry.'];
  if (r.state !== 'value') return [];
  const lines = [valueLine(`Practical ${Math.round(r.value!)}%`, r)];
  lines.push(`${count(r.games ?? 0)} games · Lichess ${o.filter}`);
  replyLines(r, lines, o);
  if ((r.maia ?? 0) >= 0.005) lines.push(`Maia: ${Math.round(r.maia! * 100)}% of this value (rating ${r.maiaElo}), filling in where there are under ${o.maiaUntil ?? 100} games`);
  else if (r.maiaMissing) lines.push(MAIA_MISSING);
  if ((r.analysing ?? 0) > 0) {
    const n = r.analysing!;
    lines.push(
      `ChessDB had no eval for ${n} position${n === 1 ? '' : 's'} or move${n === 1 ? '' : 's'} this needs. ` +
        (!o.analyse ? 'Its value there is the engine eval of the move before.' : r.final === false ? 'It was asked to analyse them; deeper rounds pick up its answers.' : 'It was asked to analyse them: come back in a few minutes.'),
    );
  }
  switchLines(r, lines);
  if (preview?.state === 'value') lines.push(`Maia preview: ${Math.round(preview.value!)}% at depth ${preview.depth}, with Maia’s predictions in place of games`);
  lines.push(depthLine(r));
  return lines;
}

/** A Maia preview cell's details (q_extension's `pePreviewTooltip`); `r` the row's Lichess value. */
export function previewDetails(m: RowResult, r: RowResult | undefined, o: DetailOptions): string[] {
  if (m.state === 'error') return [m.reason ?? 'Error', 'Click to retry.'];
  if (m.state === 'none') return ['ChessDB has no eval for this position.'];
  if (m.state !== 'value') return [m.maiaMissing ? MAIA_MISSING : 'No value from Maia here.'];
  const lines = [valueLine(`Maia ${Math.round(m.value!)}%`, m), `Replies weighted by Maia’s predictions (rating ${m.maiaElo}), not by Lichess games.`];
  replyLines(m, lines, o, false);
  switchLines(m, lines);
  lines.push(depthLine(m));
  lines.push(r?.state === 'value' ? `Lichess: ${Math.round(r.value!)}% at depth ${r.depth}${r.final === false ? ', searching…' : ''}` : r ? 'Lichess: no value' : 'Lichess: computing…');
  return lines;
}

/** A prepared bar's details: the split, against the same games' own results, and what it rests on. */
export function preparedDetails(r: RowResult, side: Side, o: DetailOptions): string[] {
  if (!r.prep) return [];
  const you = expectedScore(r.prep, side)!;
  const lines = [`Prepared ${splitText(r.prep)}${r.raw ? ` (these games ${splitText(r.raw)})` : ''}`];
  const raw = expectedScore(r.raw, side);
  const diff = raw != null ? pct(you) - pct(raw) : null;
  lines.push(`Your expected score ${pct(you)}%${raw != null ? ` (${pct(raw)}% in these games, ${diff! >= 0 ? '+' : ''}${diff})` : ''}`);
  const min = o.replyThreshold / 100;
  for (const x of (r.replies ?? []).filter((x) => x.share >= min && x.prep).slice(0, 8)) {
    const a = expectedScore(x.raw, side);
    lines.push(`  ${x.san}  ${a != null ? `${pct(a)}%` : '–'} → ${pct(expectedScore(x.prep, side)!)}%${x.move ? `  (${x.move})` : ''}`);
  }
  lines.push(`Rests on Practical value: ${pct(r.prior ?? 0)}% · depth ${r.depth} · ${count(r.leafGames ?? 0)} games at the leaves${r.final === false ? ' · searching deeper…' : ''}`);
  lines.push(`Beyond depth ${r.depth}, results include everyone’s later mistakes.`);
  lines.push(`Lichess ${o.filter}.`);
  return lines;
}

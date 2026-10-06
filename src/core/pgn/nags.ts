// Glyphs (NAGs) as Lichess groups them (scalachess pgn/Glyph.scala): one move assessment and
// one position assessment per move at most, any number of observations.
export const MOVE_GLYPHS = [1, 2, 3, 4, 5, 6, 7, 22] as const;
export const POSITION_GLYPHS = [10, 13, 14, 15, 16, 17, 18, 19] as const;
export const OBSERVATION_GLYPHS = [146, 32, 36, 40, 132, 138, 44, 140] as const;

export type GlyphGroup = 'move' | 'position' | 'observation' | 'other';

export function glyphGroup(nag: number): GlyphGroup {
  if ((MOVE_GLYPHS as readonly number[]).includes(nag)) return 'move';
  if ((POSITION_GLYPHS as readonly number[]).includes(nag)) return 'position';
  if ((OBSERVATION_GLYPHS as readonly number[]).includes(nag)) return 'observation';
  return 'other';
}

/** The six glyphs written as a SAN suffix; every other NAG is written ` $n`. */
export const SUFFIX: Readonly<Record<number, string>> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

/** `a` with `b`'s glyphs added: `a` keeps its move and position assessment if it has one. */
export function mergeNags(a: readonly number[], b: readonly number[]): number[] {
  const out = [...a];
  for (const nag of b) {
    if (out.includes(nag)) continue;
    const group = glyphGroup(nag);
    if ((group === 'move' || group === 'position') && out.some((n) => glyphGroup(n) === group)) continue;
    out.push(nag);
  }
  return out;
}

/** How Lichess shows each glyph, and its name (scalachess pgn/Glyph.scala). */
export const GLYPHS: Readonly<Record<number, { symbol: string; name: string }>> = {
  1: { symbol: '!', name: 'Good move' },
  2: { symbol: '?', name: 'Mistake' },
  3: { symbol: '!!', name: 'Brilliant move' },
  4: { symbol: '??', name: 'Blunder' },
  5: { symbol: '!?', name: 'Interesting move' },
  6: { symbol: '?!', name: 'Dubious move' },
  7: { symbol: '□', name: 'Only move' },
  22: { symbol: '⨀', name: 'Zugzwang' },
  10: { symbol: '=', name: 'Equal position' },
  13: { symbol: '∞', name: 'Unclear position' },
  14: { symbol: '⩲', name: 'White is slightly better' },
  15: { symbol: '⩱', name: 'Black is slightly better' },
  16: { symbol: '±', name: 'White is better' },
  17: { symbol: '∓', name: 'Black is better' },
  18: { symbol: '+−', name: 'White is winning' },
  19: { symbol: '−+', name: 'Black is winning' },
  146: { symbol: 'N', name: 'Novelty' },
  32: { symbol: '↑↑', name: 'Development' },
  36: { symbol: '↑', name: 'Initiative' },
  40: { symbol: '→', name: 'Attack' },
  132: { symbol: '⇆', name: 'Counterplay' },
  138: { symbol: '⊕', name: 'Time trouble' },
  44: { symbol: '=∞', name: 'With compensation' },
  140: { symbol: '∆', name: 'With the idea' },
};

export const glyphSymbol = (nag: number) => GLYPHS[nag]?.symbol ?? `$${nag}`;

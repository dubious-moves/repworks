// The board's lights from what the screen's board shows (CHESSNUT.md §4.7): the last move blue,
// each arrow in its brush's colour on its two squares, at most a few. Pure.
import { parseSquare } from 'chessops/util';
import { basic, LIGHT, type Light } from './chessnut.ts';

export interface Marks {
  /** The move that led to the position shown (UCI). */
  lastUci?: string | undefined;
  /** The arrows drawn by the site (not the user's sketch); one with no `dest` is a circle (a hint's piece). */
  arrows?: readonly { orig: string; dest?: string | undefined; brush: string }[] | undefined;
  /** The user's move once graded, lit in its band's brush (the storm's verdict, practice's feedback). */
  played?: { uci: string; brush: string } | undefined;
  /** Squares lit red: where the board differs from the position (CHESSNUT.md §4.4). */
  wrong?: readonly string[] | undefined;
}

/** A brush's light: chessground's own brushes and the storm's bands (Board.tsx's BAND_BRUSHES). */
export const BRUSH_LIGHT: Record<string, Light> = {
  green: LIGHT.green,
  paleGreen: LIGHT.green,
  red: LIGHT.red,
  paleRed: LIGHT.red,
  blue: LIGHT.blue,
  paleBlue: LIGHT.blue,
  yellow: LIGHT.yellow,
  bandBest: LIGHT.brightGreen,
  bandGreat: LIGHT.green,
  bandGood: LIGHT.darkGreen,
  bandOk: LIGHT.yellow,
  bandBad: LIGHT.orange,
  bandBlunder: LIGHT.red,
};

/** More arrows than this (show and grade's twelve): only the top move's are lit. */
export const MAX_LIT_ARROWS = 3;

export function lightsFor(m: Marks, o: { turned: boolean; basicOnly: boolean }): Light[] {
  const out: Light[] = new Array(64).fill(LIGHT.off);
  const put = (name: string | undefined, l: Light) => {
    const s = name === undefined ? undefined : parseSquare(name);
    if (s === undefined) return;
    out[o.turned ? 63 - s : s] = o.basicOnly ? basic(l) : l;
  };
  if (m.lastUci) {
    put(m.lastUci.slice(0, 2), LIGHT.blue);
    put(m.lastUci.slice(2, 4), LIGHT.blue);
  }
  if (m.played) {
    const l = BRUSH_LIGHT[m.played.brush] ?? LIGHT.blue;
    put(m.played.uci.slice(0, 2), l);
    put(m.played.uci.slice(2, 4), l);
  }
  let arrows = [...(m.arrows ?? [])];
  if (arrows.length > MAX_LIT_ARROWS) arrows = arrows.filter((a) => a.brush === 'bandBest' || a.brush === 'green').slice(0, MAX_LIT_ARROWS);
  for (const a of arrows) {
    const l = BRUSH_LIGHT[a.brush] ?? LIGHT.blue;
    put(a.orig, l);
    put(a.dest, l);
  }
  for (const w of m.wrong ?? []) put(w, LIGHT.red);
  return out;
}

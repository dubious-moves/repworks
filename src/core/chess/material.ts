// The material on the board, as Lichess shows it beside its players: each side's pieces left over
// once the other side's of the same kind cancel them, and the points one side is up (queen 9,
// rook 5, bishop and knight 3, pawn 1). Read from a FEN's placement alone.

export type MaterialRole = 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

/** Lichess's order: the largest first. */
export const MATERIAL_ROLES: readonly MaterialRole[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

export const MATERIAL_VALUE: Readonly<Record<MaterialRole, number>> = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };

const LETTER: Readonly<Record<string, MaterialRole>> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

export interface Material {
  /** The pieces each side has more of than the other, by role. */
  white: Readonly<Record<MaterialRole, number>>;
  black: Readonly<Record<MaterialRole, number>>;
  /** White's points less Black's: above 0 White is up, below 0 Black. */
  score: number;
}

const none = (): Record<MaterialRole, number> => ({ queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 });

export function material(fen: string): Material {
  const white = none();
  const black = none();
  for (const ch of fen.split(' ')[0] ?? '') {
    const role = LETTER[ch.toLowerCase()];
    if (role) (ch === ch.toLowerCase() ? black : white)[role]++;
  }
  let score = 0;
  const surplus = { white: none(), black: none() };
  for (const role of MATERIAL_ROLES) {
    const d = white[role] - black[role];
    score += d * MATERIAL_VALUE[role];
    if (d > 0) surplus.white[role] = d;
    else if (d < 0) surplus.black[role] = -d;
  }
  return { ...surplus, score };
}

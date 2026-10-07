// Games read for the storm's walks (PLAN.md §5.42): a Lichess export of one or many games, as
// `POST /api/games/export/_ids` or `/game/export/<id>` or the masters' `/masters/pgn/<id>` write
// it, to each game's id and its moves in SAN. Comments, glyphs and variations are left out
// (lichessable's `stormPgnMoves`). Pure.
import { parsePgn } from 'chessops/pgn';

export interface GameMoves {
  /** The game's id: its `GameId` header, else the last path part of `Site`; '' when neither. */
  id: string;
  sans: string[];
  white: string;
  black: string;
}

export function gamesFromPgn(text: string): GameMoves[] {
  return parsePgn(text).map((game) => {
    const h = game.headers;
    const site = h.get('Site') || '';
    const fromSite = /^https?:\/\/[^/]+\/([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(site);
    const id = h.get('GameId') || (fromSite ? fromSite[1]! : '');
    const sans: string[] = [];
    for (const node of game.moves.mainline()) sans.push(node.san);
    return { id, sans, white: h.get('White') || '', black: h.get('Black') || '' };
  });
}

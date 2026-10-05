import { parseFen, makeFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
export type PositionKey = string & { readonly __brand: 'PositionKey' };
export function positionKey(fen: string): PositionKey {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  return makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ') as PositionKey;
}

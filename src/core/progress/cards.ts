// Card IDs carry a kind letter (PLAN.md §4.4): `r|<positionKey>|<uci>` is a repertoire move.
// The storm (§5.41) adds `s|<positionKey>` (a storm position) and `z|<id>` (a Lichess puzzle);
// Phase 5 adds `p|key` (plan recall) and `m|…` (game mistakes).
import type { PositionKey } from '../chess/positionKey.ts';

export type CardId = string & { readonly __brand: 'CardId' };

export const repertoireCard = (key: PositionKey, uci: string) => `r|${key}|${uci}` as CardId;

export const stormCard = (key: PositionKey) => `s|${key}` as CardId;
export const puzzleCard = (id: string) => `z|${id}` as CardId;

// Phase 5 (§5.53): a game item by mistake-lab's pid, a plan card by its position; and the
// positions and entries Phase 5's marks name.
export const gameCard = (pid: string) => `m|${pid}` as CardId;
export const planCard = (key: PositionKey) => `p|${key}` as CardId;
export const dismissCard = (key: PositionKey) => `d|${key}` as CardId;
export const historyCard = (id: string) => `h|${id}` as CardId;
export const practiceCard = (key: PositionKey) => `x|${key}` as CardId;
export const checklistCard = (key: PositionKey) => `c|${key}` as CardId;
/** The rest of a card ID after its kind letter: `m|abc_17` → `abc_17`. */
export const cardBody = (id: string) => id.slice(id.indexOf('|') + 1);

export type ParsedCard = { kind: 'repertoire'; key: PositionKey; uci: string } | { kind: 'other'; letter: string };

export function parseCard(id: string): ParsedCard | undefined {
  const parts = id.split('|');
  if (parts[0] === 'r') {
    if (parts.length !== 3 || !parts[1] || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(parts[2] ?? '')) return undefined;
    return { kind: 'repertoire', key: parts[1] as PositionKey, uci: parts[2]! };
  }
  return parts.length >= 2 && parts[0] ? { kind: 'other', letter: parts[0] } : undefined;
}

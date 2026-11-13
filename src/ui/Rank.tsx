// A game card's priority (PLAN.md §5.171): High, Normal or Low, Normal by default. Due cards of a
// higher priority are asked first in the game cards' review, and new ones too. Three buttons on a
// card under review; a select in a game's list of items and in the sequence dialog.
import { cardRank, setCardRank } from '../app/games.ts';
import { CARD_RANKS, type CardRank } from '../core/progress/events.ts';

export const RANK_WORD: Record<CardRank, string> = { high: 'High', normal: 'Normal', low: 'Low' };

/** The three buttons, the card's own priority pressed. */
export function RankButtons(props: { card: string }) {
  const rank = cardRank(props.card);
  return (
    <div class="rank-row" role="group" aria-label="Priority" data-testid="rank" data-rank={rank}>
      <span class="muted">Priority</span>
      {CARD_RANKS.map((r) => (
        <button key={r} type="button" aria-pressed={rank === r} class={`chip-toggle rank-${r}${rank === r ? ' on' : ''}`} onClick={() => void setCardRank(props.card, r)}>
          {RANK_WORD[r]}
        </button>
      ))}
    </div>
  );
}

/** A select of the three; `onPick` alone when the choice isn't a card's yet (a sequence before it is saved). */
export function RankSelect(props: { value: CardRank; onPick(r: CardRank): void; label?: string }) {
  return (
    <select class={`rank-select rank-${props.value}`} aria-label={props.label ?? 'Priority'} value={props.value} onChange={(e) => props.onPick((e.currentTarget as HTMLSelectElement).value as CardRank)}>
      {CARD_RANKS.map((r) => (
        <option key={r} value={r}>
          {RANK_WORD[r]} priority
        </option>
      ))}
    </select>
  );
}

/** A card's own select: it records the choice. */
export function CardRankSelect(props: { card: string }) {
  return <RankSelect value={cardRank(props.card)} onPick={(r) => void setCardRank(props.card, r)} />;
}

/**
 * The select beside a Save (§5.172): before the item is saved, the priority it will be saved with
 * (`value`, `onPick`); once saved (`card`), the card's own, changed as on a card under review.
 */
export function SaveRankSelect(props: { card?: string | undefined; value: CardRank; onPick(r: CardRank): void }) {
  return props.card ? <CardRankSelect card={props.card} /> : <RankSelect value={props.value} onPick={props.onPick} />;
}

// The home screen's training card (PLAN.md §5.3, §5.7): "Train: 23 due · 18 new", the moves
// whose learning step ends later today, and the known pool still to review.
import { queueOf, trainData } from '../app/train.ts';

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function TrainCard() {
  const data = trainData.value;
  if (!data || data.index.cards.size === 0) return null;
  const queue = queueOf(data, Date.now());
  return (
    <section class="card train-card" aria-label="Training">
      <div class="card-head">
        <h2>
          Train: <span class="train-due">{queue.due.length} due</span> · <span class="train-new">{queue.newCards.length} new</span>
        </h2>
        <a class="button" href="#/train">
          Train
        </a>
      </div>
      {queue.later.length > 0 && (
        <p class="muted">
          {queue.later.length} more today from {clock(queue.later[0]!.due)}
        </p>
      )}
      {queue.knownCards.length > 0 && <p class="muted">Known lines: {queue.knownCards.length.toLocaleString('en')} moves not yet reviewed</p>}
      {queue.orphaned.length > 0 && <p class="muted">{queue.orphaned.length} reviewed moves are no longer in the repertoire</p>}
    </section>
  );
}

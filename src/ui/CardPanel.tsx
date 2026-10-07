// The card of the move shown (PLAN.md §5.7): for an own move of a repertoire chapter, where its
// card stands (new, learning, due, reviewed) and the suspend toggle, "Always play this for me";
// and the alternatives saved for its position (§5.18), each removed by its ✕. They are saved in
// training, after a wrong move, or here: "Add alternative" shows the position before the move and
// saves the move played on the board, which is not written into the study.
import { signal } from '@preact/signals';
import { decidingNow } from '../app/time.ts';
import { parseSan } from 'chessops/san';
import { isNormal, type Move } from 'chessops/types';
import { at, chapter, feedback, side, study } from '../app/editor.ts';
import { recordEvent } from '../app/state.ts';
import { dayOf, trainData } from '../app/train.ts';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { standardUci } from '../core/chess/uci.ts';
import { repertoireCard } from '../core/progress/cards.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { makeSan } from 'chessops/san';
import { alternativesAt } from '../core/train/alternatives.ts';
import { dueAt, statusOf } from '../core/train/queue.ts';
import { positionAt, samePath, type Path } from '../core/study/tree.ts';

const when = (ms: number) => {
  const today = dayOf(decidingNow());
  const time = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (ms < today.start) return 'overdue';
  if (ms < today.end) return `today${ms > today.now ? ` from ${time}` : ''}`;
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: ms - today.now > 300 * 86_400_000 ? 'numeric' : undefined });
};

/** The own move whose alternative is being picked on the board (it shows the position before it). */
export const altAdding = signal<Path | undefined>(undefined);

/**
 * Saves `m`, played on the board before the own move at `path`, as an alternative for that
 * position. Says why when it isn't one: the repertoire's own move, or one saved already.
 */
export function addAlternative(path: Path, m: Move): void {
  const c = chapter.peek();
  const data = trainData.peek();
  const before = c && positionAt(c, path.slice(0, -1));
  if (!before || !data || !isNormal(m)) return;
  const repertoire = parseSan(before, path[path.length - 1]!);
  const key = positionKeyOf(before);
  const uci = standardUci(before, m);
  const san = makeSan(before, m);
  if (repertoire && isNormal(repertoire) && standardUci(before, repertoire) === uci) feedback.value = `${san} is the repertoire's move here already`;
  else if (alternativesAt(data.alternatives, key).includes(uci)) feedback.value = `${san} is an alternative here already`;
  else {
    void recordEvent({ t: new Date().toISOString(), k: 'alt', card: repertoireCard(key, uci), on: true });
    feedback.value = `${san} saved as an alternative`;
  }
  altAdding.value = undefined;
}

export function CardPanel() {
  const c = chapter.value;
  const path = at.value;
  const data = trainData.value;
  if (!c || !data || path.length === 0 || study.value?.meta.kind !== 'repertoire') return null;
  const before = positionAt(c, path.slice(0, -1));
  if (!before || before.turn !== side.value) return null;
  const move = parseSan(before, path[path.length - 1]!);
  if (!move || !isNormal(move)) return null;
  const key = positionKeyOf(before);
  const card = repertoireCard(key, standardUci(before, move));
  const alts = alternativesAt(data.alternatives, key).flatMap((uci) => {
    const m = parseUciMove(before, uci);
    return m ? [{ uci, san: makeSan(before, m) }] : [];
  });
  const state = data.states.get(card);
  const status = statusOf(state);
  const due = dueAt(state, data.settings);
  const suspended = state?.suspended === true;
  const others = (data.index.cards.get(card)?.length ?? 1) - 1;
  const toggle = () => void recordEvent({ t: new Date().toISOString(), k: suspended ? 'unsuspend' : 'suspend', card });
  return (
    <section class="node-panel card-panel" aria-label="Training card">
      <p>
        <strong>Your move.</strong>{' '}
        {status === 'fresh' ? 'New: not learned yet.' : status === 'learning' ? `Learning: first review ${due !== undefined ? when(due) : 'soon'}.` : `Due ${due !== undefined ? when(due) : '?'} · ${state!.reviews} review${state!.reviews === 1 ? '' : 's'}.`}
        {suspended && ' Always played for you.'}
        {others > 0 && <span class="muted"> Also met in {others} other place{others === 1 ? '' : 's'}.</span>}
      </p>
      <button type="button" class="secondary" aria-pressed={suspended} onClick={toggle}>
        {suspended ? 'Ask me this move again' : 'Always play this for me'}
      </button>
      {altAdding.value && samePath(altAdding.value, path) ? (
        <p class="card-alts" role="status">
          <span class="muted">Play the alternative on the board.</span>{' '}
          <button type="button" class="secondary" onClick={() => (altAdding.value = undefined)}>
            Cancel
          </button>
        </p>
      ) : (
        <button type="button" class="secondary" onClick={() => (altAdding.value = [...path])}>
          Add alternative…
        </button>
      )}
      {alts.length > 0 && (
        <p class="card-alts">
          <span class="muted">Alternatives here:</span>{' '}
          {alts.map((a) => (
            <span key={a.uci} class="card-alt">
              {a.san}
              <button
                type="button"
                class="icon"
                aria-label={`Remove ${a.san} from the alternatives`}
                title={`Remove ${a.san}: it counts as a wrong move again`}
                onClick={() => void recordEvent({ t: new Date().toISOString(), k: 'alt', card: repertoireCard(key, a.uci), on: false })}
              >
                ✕
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

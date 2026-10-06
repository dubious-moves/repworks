// The card of the move shown (PLAN.md §5.7): for an own move of a repertoire chapter, where its
// card stands (new, learning, due, reviewed) and the suspend toggle, "Always play this for me".
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { at, chapter, side, study } from '../app/editor.ts';
import { recordEvent } from '../app/state.ts';
import { dayOf, trainData } from '../app/train.ts';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { standardUci } from '../core/chess/uci.ts';
import { repertoireCard } from '../core/progress/cards.ts';
import { dueAt, statusOf } from '../core/train/queue.ts';
import { positionAt } from '../core/study/tree.ts';

const when = (ms: number) => {
  const today = dayOf(Date.now());
  const time = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (ms < today.start) return 'overdue';
  if (ms < today.end) return `today${ms > today.now ? ` from ${time}` : ''}`;
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: ms - today.now > 300 * 86_400_000 ? 'numeric' : undefined });
};

export function CardPanel() {
  const c = chapter.value;
  const path = at.value;
  const data = trainData.value;
  if (!c || !data || path.length === 0 || study.value?.meta.kind !== 'repertoire') return null;
  const before = positionAt(c, path.slice(0, -1));
  if (!before || before.turn !== side.value) return null;
  const move = parseSan(before, path[path.length - 1]!);
  if (!move || !isNormal(move)) return null;
  const card = repertoireCard(positionKeyOf(before), standardUci(before, move));
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
    </section>
  );
}

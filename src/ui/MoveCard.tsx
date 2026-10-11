// The card of an own move in a repertoire chapter (PLAN.md §5.7, §5.90), in the move's menu: where
// it stands (new, learning, due, reviewed), the suspend toggle "Always play this for me", and the
// alternatives saved for its position (§5.18), each removable. They are saved in training, after
// a wrong move, or here: "Add alternative" shows the position before the move and saves the move
// played on the board, which is not written into the study. (A panel beside the notation held
// these until §5.90.)
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

/** A menu item of the move's card. */
export interface CardItem {
  label: string;
  run: () => void;
}

/** The card of the own move at `path`, for its menu: a line on where it stands, and its items. */
export function moveCard(path: Path): { note: string; items: CardItem[] } | undefined {
  const c = chapter.value;
  const data = trainData.value;
  if (!c || !data || path.length === 0 || study.value?.meta.kind !== 'repertoire') return undefined;
  const before = positionAt(c, path.slice(0, -1));
  if (!before || before.turn !== side.value) return undefined;
  const move = parseSan(before, path[path.length - 1]!);
  if (!move || !isNormal(move)) return undefined;
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
  const note = [
    status === 'fresh' ? 'New: not learned yet.' : status === 'learning' ? `Learning: first review ${due !== undefined ? when(due) : 'soon'}.` : `Due ${due !== undefined ? when(due) : '?'} · ${state!.reviews} review${state!.reviews === 1 ? '' : 's'}.`,
    suspended ? 'Always played for you.' : '',
    others > 0 ? `Also met in ${others} other place${others === 1 ? '' : 's'}.` : '',
  ].filter(Boolean).join(' ');
  const items: CardItem[] = [
    {
      label: suspended ? 'Ask me this move again' : 'Always play this for me',
      run: () => void recordEvent({ t: new Date().toISOString(), k: suspended ? 'unsuspend' : 'suspend', card }),
    },
    { label: 'Add alternative…', run: () => ((altAdding.value = [...path]), (feedback.value = undefined)) },
    ...alts.map((a) => ({
      label: `Remove alternative ${a.san}`,
      run: () => {
        void recordEvent({ t: new Date().toISOString(), k: 'alt', card: repertoireCard(key, a.uci), on: false });
        feedback.value = `${a.san} removed from the alternatives: it counts as a wrong move again`;
      },
    })),
  ];
  return { note, items };
}

/** Under the board while an alternative is being picked: what to do, and Cancel. */
export function AltAdding() {
  if (!altAdding.value || !samePath(altAdding.value, at.value)) return null;
  return (
    <p class="alt-adding" role="status">
      <span>Play the alternative on the board.</span>{' '}
      <button type="button" class="secondary" onClick={() => (altAdding.value = undefined)}>
        Cancel
      </button>
    </p>
  );
}

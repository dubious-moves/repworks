// The study page's Review panel (PLAN.md §5.216): a reviewing session's lists for this study,
// folded until opened. Each item is a move: clicked, the board goes there (in whichever chapter).
// The owner answers in place, OK or No, with a note if he likes; an answer is an event in this
// device's log, so the session reads it after the next sync. An item whose move the chapter no
// longer has as the item says is marked, since the edit itself is the answer.
import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { modeHash } from '../core/app/fsm.ts';
import type { ItemKind, ReviewList } from '../core/study/reviewList.ts';
import { samePath } from '../core/study/tree.ts';
import { afterEdits, at, study } from '../app/editor.ts';
import { open } from '../app/mode.ts';
import { answerItem, reviewLists, type ShownItem, type ShownList } from '../app/reviewLists.ts';

const LABEL: Record<ItemKind, string> = { move: 'My move', reply: 'Main reply', added: 'New', removed: 'Removed', comment: 'Comment', arrows: 'Arrows', glyphs: 'Glyph', order: 'Order', question: 'Question' };
const STATE: Record<ShownItem['state'], string> = { open: '', ok: 'OK', no: 'No', noted: 'Noted', moved: 'Changed since' };

/** Folded when the page opens; kept as left while the owner goes through the items. */
const panelOpen = signal(false);
/** The item last gone to: "Next" goes on from it. */
const visited = signal<string | undefined>(undefined);

const key = (l: ReviewList, i: ShownItem) => `${l.name}/${i.item.id}`;

export function ReviewPanel() {
  const lists = reviewLists.value;
  const s = study.value;
  if (!s || !lists.length) return null;
  const waiting = lists.reduce((n, l) => n + l.open, 0);
  const total = lists.reduce((n, l) => n + l.total, 0);
  const go = (l: ReviewList, i: ShownItem) => {
    visited.value = key(l, i);
    // The open chapter's edits are saved before another chapter is read in its place.
    void afterEdits(async () => open({ name: 'chapter', sid: s.sid, cid: i.item.cid, at: [...i.item.at] }));
  };
  const all = lists.flatMap((l) => l.groups.flatMap((g) => g.items.map((i) => ({ l: l.list, i }))));
  const next = () => {
    const from = all.findIndex((x) => key(x.l, x.i) === visited.value);
    const order = [...all.slice(from + 1), ...all.slice(0, from + 1)];
    const to = order.find((x) => x.i.state === 'open');
    if (to) go(to.l, to.i);
  };
  return (
    <details class="review-panel" open={panelOpen.value} onToggle={(e) => (panelOpen.value = e.currentTarget.open)}>
      <summary>
        <span class="review-title">Review</span>{' '}
        <span class="review-count" data-testid="review-count">
          {waiting ? `${waiting} open` : 'all answered'}
        </span>{' '}
        <span class="muted">of {total}</span>
      </summary>
      {waiting > 0 && (
        <p class="review-next">
          <button type="button" onClick={next}>
            Next open
          </button>
        </p>
      )}
      {lists.map((l) => (
        <List key={l.list.name} shown={l} cid={s.cid} sid={s.sid} go={go} />
      ))}
    </details>
  );
}

function List(props: { shown: ShownList; sid: string; cid: string; go: (l: ReviewList, i: ShownItem) => void }) {
  const { shown } = props;
  // Open while it has something to answer, as found when first shown; then as the owner leaves it.
  const [unfolded, setUnfolded] = useState(shown.open > 0);
  return (
    <details class="review-list" open={unfolded} onToggle={(e) => setUnfolded(e.currentTarget.open)}>
      <summary>
        {shown.list.title}{' '}
        <span class="muted">
          {shown.open ? `${shown.open} open of ${shown.total}` : `${shown.total}, all answered`}
        </span>
      </summary>
      {shown.groups.map((g) => (
        <section key={g.cid} class="review-group" aria-label={g.name}>
          {(shown.groups.length > 1 || g.cid !== props.cid) && <h3 class="review-chapter">{g.name}</h3>}
          <ul>
            {g.items.map((i) => (
              <Item key={i.item.id} list={shown.list} shown={i} sid={props.sid} here={g.cid === props.cid && samePath(at.value, i.item.at)} go={props.go} />
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}

function Item(props: { list: ReviewList; shown: ShownItem; sid: string; here: boolean; go: (l: ReviewList, i: ShownItem) => void }) {
  const { list, shown } = props;
  const { item, state, answer } = shown;
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const a = answer?.a ?? 'open';
  // The same button again takes the answer back; a note stays with whatever is chosen.
  const choose = (to: 'ok' | 'no') => answerItem(list, item, a === to ? 'open' : to, answer?.note);
  const save = () => {
    answerItem(list, item, a, note);
    setNoting(false);
  };
  return (
    <li class={`review-item is-${state}${props.here ? ' here' : ''}`} data-kind={item.kind}>
      <a
        class="review-go"
        href={modeHash({ name: 'chapter', sid: props.sid, cid: item.cid, at: [...item.at] })}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          props.go(list, shown);
        }}
      >
        <span class="review-kind">{LABEL[item.kind]}</span>
        {item.lead && <span class="review-lead">{item.lead} </span>}
        <strong class="review-part">{item.part}</strong>
      </a>
      {STATE[state] && <span class={`review-state state-${state}`}>{STATE[state]}</span>}
      {item.text && <p class="review-text">{item.text}</p>}
      {!!item.detail?.length && (
        <details class="review-detail">
          <summary>More</summary>
          {item.detail.map((d, n) => (
            <p key={n}>{d}</p>
          ))}
        </details>
      )}
      {answer?.note && !noting && <p class="review-note">You: {answer.note}</p>}
      <div class="review-answer" role="group" aria-label="Your answer">
        <button type="button" aria-pressed={a === 'ok'} onClick={() => choose('ok')}>
          OK
        </button>
        <button type="button" aria-pressed={a === 'no'} onClick={() => choose('no')}>
          No
        </button>
        <button
          type="button"
          aria-expanded={noting}
          onClick={() => {
            setNote(answer?.note ?? '');
            setNoting(!noting);
          }}
        >
          Note
        </button>
      </div>
      {noting && (
        <form
          class="review-noting"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input type="text" aria-label="Your note" value={note} maxLength={500} onInput={(e) => setNote(e.currentTarget.value)} />
          <button type="submit">Save</button>
        </form>
      )}
    </li>
  );
}

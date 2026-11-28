// The study page's Review panel (PLAN.md §5.216): a reviewing session's lists for this study,
// folded until opened. Each item is a move: clicked, the board goes there (in whichever chapter).
// The owner answers in place, OK or No, with a note if he likes; an answer is an event in this
// device's log, so the session reads it after the next sync. An item whose move the chapter no
// longer has as the item says is marked, since the edit itself is the answer.
//
// Items at one move are one position (§5.218): the move as its head, its changes under it, one
// row of buttons that answers them all (an event per item); "One by one" gives each its own. The
// counts are positions. "OK all open" on a list answers every item still waiting under it, after
// a confirmation.
//
// "Look first" (§5.220): a position the session marked says so, comes first in its list and is
// where "Next open" goes first; the list's head counts those still waiting, and "OK all open"
// leaves them waiting, saying how many stay.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { modeHash } from '../core/app/fsm.ts';
import { answerTargets, okAllTargets, sharedAnswer, type ItemKind, type ItemState, type Placed, type ReviewPosition } from '../core/study/reviewList.ts';
import { samePath } from '../core/study/tree.ts';
import { afterEdits, at, study } from '../app/editor.ts';
import { open } from '../app/mode.ts';
import { answerItems, reviewLists, type ShownList } from '../app/reviewLists.ts';

const LABEL: Record<ItemKind, string> = { move: 'My move', reply: 'Main reply', added: 'New', removed: 'Removed', comment: 'Comment', arrows: 'Arrows', glyphs: 'Glyph', order: 'Order', question: 'Question' };
const STATE: Record<ItemState, string> = { open: '', ok: 'OK', no: 'No', noted: 'Noted', moved: 'Changed since' };
/** In a position, the kinds whose change is what `detail` says (the head already shows their move): read without a click. */
const SAYS: readonly ItemKind[] = ['comment', 'arrows', 'glyphs', 'order'];

const positions = (n: number) => `${n} position${n === 1 ? '' : 's'}`;

/** Folded when the page opens; kept as left while the owner goes through the items. */
const panelOpen = signal(false);
/** The position last gone to: "Next" goes on from it. */
const visited = signal<string | undefined>(undefined);

export function ReviewPanel() {
  const lists = reviewLists.value;
  const s = study.value;
  if (!s || !lists.length) return null;
  const waiting = lists.reduce((n, l) => n + l.open, 0);
  const total = lists.reduce((n, l) => n + l.total, 0);
  const firstOpen = lists.reduce((n, l) => n + l.firstOpen, 0);
  const go = (p: ReviewPosition) => {
    visited.value = p.key;
    // The open chapter's edits are saved before another chapter is read in its place.
    void afterEdits(async () => open({ name: 'chapter', sid: s.sid, cid: p.cid, at: [...p.at] }));
  };
  const all = lists.flatMap((l) => l.chapters.flatMap((c) => c.positions));
  const next = () => {
    const from = all.findIndex((p) => p.key === visited.value);
    const order = [...all.slice(from + 1), ...all.slice(0, from + 1)];
    // What the session marked "look first" before the rest.
    const to = order.find((p) => p.waiting && p.first) ?? order.find((p) => p.waiting);
    if (to) go(to);
  };
  return (
    <details class="review-panel" open={panelOpen.value} onToggle={(e) => (panelOpen.value = e.currentTarget.open)}>
      <summary>
        <span class="review-title">Review</span>{' '}
        <span class="review-count" data-testid="review-count">
          {waiting ? `${positions(waiting)} open` : 'all answered'}
        </span>{' '}
        <span class="muted">of {total}</span>
        {firstOpen > 0 && <span class="review-first-count"> · {firstOpen} to look at first</span>}
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

function List(props: { shown: ShownList; sid: string; cid: string; go: (p: ReviewPosition) => void }) {
  const { shown } = props;
  // Open while it has something to answer, as found when first shown; then as the owner leaves it.
  const [unfolded, setUnfolded] = useState(shown.open > 0);
  const [asking, setAsking] = useState(false);
  // Every item still waiting under this list, whichever list it is in; what has an answer, a note or an edit stays,
  // and so does a position the session marked "look first": that one is read, not waved through.
  const all = okAllTargets(shown.chapters.flatMap((c) => c.positions));
  const okAll = () => {
    answerItems(all.items, () => ({ a: 'ok' }));
    setAsking(false);
  };
  return (
    <details class="review-list" open={unfolded} onToggle={(e) => setUnfolded(e.currentTarget.open)}>
      <summary>
        {shown.list.title}{' '}
        <span class="muted">
          {shown.open ? `${positions(shown.open)} open of ${shown.total}` : `${positions(shown.total)}, all answered`}
        </span>
        {shown.firstOpen > 0 && <span class="review-first-count"> · {shown.firstOpen} to look at first</span>}
      </summary>
      {all.positions > 0 &&
        (asking ? (
          <p class="review-all" role="group" aria-label="OK all open">
            <span>
              OK for the {positions(all.positions)} still open in this list?{all.kept > 0 && ` The ${all.kept} marked “Look first” ${all.kept === 1 ? 'stays' : 'stay'} open.`} Each can be taken back.
            </span>
            <button type="button" class="primary" onClick={okAll}>
              OK all {all.positions}
            </button>
            <button type="button" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </p>
        ) : (
          <p class="review-all">
            <button type="button" onClick={() => setAsking(true)}>
              OK all open…
            </button>
          </p>
        ))}
      {shown.chapters.map((c) => (
        <section key={c.cid} class="review-group" aria-label={c.name}>
          {(shown.chapters.length > 1 || c.cid !== props.cid) && <h3 class="review-chapter">{c.name}</h3>}
          <ul>
            {c.positions.map((p) => (
              <PositionRow key={p.key} position={p} list={shown.list.name} sid={props.sid} here={c.cid === props.cid && samePath(at.value, p.at)} go={props.go} />
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}

/** A position: one item as itself, several under the move they share. */
function PositionRow(props: { position: ReviewPosition; list: string; sid: string; here: boolean; go: (p: ReviewPosition) => void }) {
  const p = props.position;
  const one = p.items.length === 1 ? p.items[0]! : undefined;
  const targets = answerTargets(p.items);
  const shared = sharedAnswer(targets);
  // Each item's own buttons: asked for, or there from the start when the items already have different answers.
  const [each, setEach] = useState(() => !one && new Set(targets.map((i) => i.answer?.a ?? 'open')).size > 1);
  return (
    <li class={`review-item is-${p.common ?? 'mixed'}${p.waiting ? ' is-waiting' : ''}${p.first ? ' is-first' : ''}${props.here ? ' here' : ''}`} data-kind={one ? one.item.kind : 'position'}>
      <a
        class="review-go"
        href={modeHash({ name: 'chapter', sid: props.sid, cid: p.cid, at: [...p.at] })}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          props.go(p);
        }}
      >
        {p.first && <span class="review-first">Look first</span>}
        {one && <span class="review-kind">{LABEL[one.item.kind]}</span>}
        {(one ? one.item.lead : p.lead) && <span class="review-lead">{one ? one.item.lead : p.lead} </span>}
        <strong class="review-part">{one ? one.item.part : p.part}</strong>
      </a>
      {p.common && STATE[p.common] && <span class={`review-state state-${p.common}`}>{STATE[p.common]}</span>}
      {one ? (
        <Words item={one} />
      ) : (
        <ul class="review-changes">
          {p.items.map((i) => (
            <li key={`${i.list.name}/${i.item.id}`} class={`review-change is-${i.state}`} data-kind={i.item.kind}>
              <span class="review-kind">{LABEL[i.item.kind]}</span>
              {(i.item.kind === 'removed' || i.item.kind === 'added') && <strong class="review-part">{i.item.part}</strong>}
              {!p.common && STATE[i.state] && <span class={`review-state state-${i.state}`}>{STATE[i.state]}</span>}
              {i.list.name !== props.list && <span class="review-from muted"> from {i.list.title}</span>}
              <Words item={i} said={SAYS.includes(i.item.kind)} />
              {each ? <Answering of={[i]} label={`Your answer to ${LABEL[i.item.kind]}`} note /> : !shared.note && i.answer?.note && <p class="review-note">You: {i.answer.note}</p>}
            </li>
          ))}
        </ul>
      )}
      <Answering of={targets} label="Your answer" note={!each}>
        {!one && (
          <button type="button" aria-expanded={each} onClick={() => setEach(!each)}>
            One by one
          </button>
        )}
      </Answering>
    </li>
  );
}

/** An item's words: the session's, and what more there is to read (shown outright when it is the change itself). */
function Words(props: { item: Placed; said?: boolean }) {
  const { item } = props.item;
  return (
    <>
      {props.said && item.detail?.map((d, n) => (
        <p key={n} class="review-said">
          {d}
        </p>
      ))}
      {item.text && <p class="review-text">{item.text}</p>}
      {!props.said && !!item.detail?.length && (
        <details class="review-detail">
          <summary>More</summary>
          {item.detail.map((d, n) => (
            <p key={n}>{d}</p>
          ))}
        </details>
      )}
    </>
  );
}

/** OK, No and Note for one item or a position's: the same button again takes the answer back; a note stays with whatever is chosen. */
function Answering(props: { of: readonly Placed[]; label: string; note: boolean; children?: ComponentChildren }) {
  const { a, note: said } = sharedAnswer(props.of);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const choose = (to: 'ok' | 'no') => answerItems(props.of, (i) => ({ a: a === to ? 'open' : to, note: i.answer?.note }));
  const save = () => {
    answerItems(props.of, (i) => ({ a: i.answer?.a ?? 'open', note }));
    setNoting(false);
  };
  return (
    <>
      {props.note && said && !noting && <p class="review-note">You: {said}</p>}
      <div class="review-answer" role="group" aria-label={props.label}>
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
            setNote(said ?? '');
            setNoting(!noting);
          }}
        >
          Note
        </button>
        {props.children}
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
    </>
  );
}

// The notation (PLAN.md §4.11, D21): the main line in rows of two moves, comments and variations
// on rows of their own, as Qchess's study page shows them. Each move reads its own "current"
// signal, so stepping through a line redraws the move left and the move reached, not the tree.
// Right-click (long-press on the phone) opens a move's menu; on a comment, its move's.
import { effect, signal, type Signal } from '@preact/signals';
import { useContext, useEffect, useMemo, useRef } from 'preact/hooks';
import { at, goTo, study } from '../app/editor.ts';
import { trainData } from '../app/train.ts';
import { hasMarker } from '../core/merge/markers.ts';
import type { Chapter } from '../core/study/model.ts';
import { notation, pathKey, type Cell, type Inline, type Line, type Move as MoveData } from '../core/study/notation.ts';
import type { Path } from '../core/study/tree.ts';
import { transpositions } from '../core/study/transpositions.ts';
import { openMenu } from './MoveMenu.tsx';
import { Badges, badgesOf, openTranspositions } from './Transpositions.tsx';

const current = new Map<string, Signal<boolean>>();
let shown = pathKey(at.peek());

function currentOf(key: string): Signal<boolean> {
  let s = current.get(key);
  if (!s) current.set(key, (s = signal(key === shown)));
  return s;
}

effect(() => {
  const key = pathKey(at.value);
  if (key === shown) return;
  const before = current.get(shown);
  if (before) before.value = false;
  shown = key;
  currentOf(key).value = true;
});

function menuAt(path: Path) {
  return (e: MouseEvent) => {
    e.preventDefault();
    openMenu(path, e.clientX, e.clientY);
  };
}

/** Scrolls the move list, and only the move list, to keep the move shown in view. */
function reveal(el: HTMLElement) {
  const list = el.closest<HTMLElement>('.notation');
  if (!list || list.scrollHeight <= list.clientHeight) return;
  const box = list.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < box.top) list.scrollTop -= box.top - r.top + 8;
  else if (r.bottom > box.bottom) list.scrollTop += r.bottom - box.bottom + 8;
}

function Move(props: { move: MoveData; number?: string | undefined; class?: string }) {
  const m = props.move;
  const isCurrent = currentOf(m.key).value;
  const badge = useContext(Badges).get(m.key);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (isCurrent && ref.current) reveal(ref.current);
  }, [isCurrent]);
  return (
    <span
      ref={ref}
      class={`move${props.class ? ` ${props.class}` : ''}${isCurrent ? ' current' : ''}`}
      data-path={m.key}
      onClick={() => goTo(m.path)}
      onContextMenu={menuAt(m.path)}
      aria-current={isCurrent ? 'true' : undefined}
    >
      {props.number && <span class="number">{`${props.number} `}</span>}
      {m.san}
      {m.glyphs && <span class="glyphs">{m.glyphs}</span>}
      {badge && (
        <span
          class="badges"
          role="button"
          tabIndex={0}
          title={badgeTitle(badge.orders.length, badge.chapters.length)}
          aria-label={badgeTitle(badge.orders.length, badge.chapters.length)}
          onClick={(e) => (e.stopPropagation(), openTranspositions(m.path, badge, e.currentTarget))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            openTranspositions(m.path, badge, e.currentTarget);
          }}
        >
          {badge.orders.length > 0 && <span class="badge">⇄{badge.orders.length}</span>}
          {badge.chapters.length > 0 && <span class="xref">+{badge.chapters.length}</span>}
        </span>
      )}
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const badgeTitle = (orders: number, chapters: number) =>
  [orders ? `${plural(orders, 'other move order', 'other move orders')} here` : '', chapters ? `reached in ${plural(chapters, 'other chapter', 'other chapters')}` : ''].filter(Boolean).join('; ');

function Comment(props: { text: string; path: Path; row?: boolean }) {
  const conflict = hasMarker(props.text);
  const Tag = props.row ? 'div' : 'span';
  return (
    <Tag class={`comment${props.row ? ' comment-row' : ''}${conflict ? ' conflict' : ''}`} onClick={() => goTo(props.path)} onContextMenu={menuAt(props.path)}>
      {conflict ? '⚠ conflict: open the move to resolve it' : props.text}
    </Tag>
  );
}

function CellView(props: { cell: Cell }) {
  const c = props.cell;
  if (c === 'none') return <span class="cell" />;
  if (c === 'gap') return <span class="cell gap">…</span>;
  return (
    <span class="cell">
      <Move move={c} class="main" />
    </span>
  );
}

function InlineView(props: { item: Inline; first: boolean; depth: number }) {
  const t = props.item;
  if (t.kind === 'comment') return <Comment text={t.text} path={t.path} />;
  return <Move move={t} number={t.number} class={props.first && props.depth > 0 ? `head depth-${Math.min(props.depth, 4)}` : undefined} />;
}

function LineView(props: { line: Line; main: boolean }) {
  const l = props.line;
  const firstMove = l.items.findIndex((t) => t.kind === 'move');
  const body = (
    <>
      {l.items.map((t, i) => [
        i > 0 ? ' ' : null,
        <InlineView key={t.kind === 'move' ? t.key : `c${i}`} item={t} first={i === firstMove} depth={l.depth} />,
      ])}
      {l.branches.map((b, i) => (
        <LineView key={b.items.find((t) => t.kind === 'move')?.path.join(' ') ?? i} line={b} main={i === 0} />
      ))}
    </>
  );
  return l.depth === 0 ? <div class="variation">{body}</div> : <div class={`branch${props.main ? ' branch-main' : ''}`}>{body}</div>;
}

export function Notation(props: { chapter: Chapter }) {
  const rows = useMemo(() => notation(props.chapter), [props.chapter]);
  const startCurrent = currentOf('').value;
  const t = useMemo(() => transpositions(props.chapter), [props.chapter]);
  const index = trainData.value?.index;
  const s = study.value;
  const badges = useMemo(() => badgesOf(t, index, s?.sid, s?.cid), [t, index, s?.sid, s?.cid]);
  return (
    <Badges.Provider value={badges}>
      <div class="notation" role="list" aria-label="Moves">
        <div class="start-row">
          <span class={`move start${startCurrent ? ' current' : ''}`} data-path="" onClick={() => goTo([])} onContextMenu={menuAt([])}>
            Start
          </span>
        </div>
        {rows.map((r, i) =>
          r.kind === 'pair' ? (
            <div class="pair" key={`p${i}`}>
              <span class="index">{`${r.number}.`}</span> <CellView cell={r.white} /> <CellView cell={r.black} />
            </div>
          ) : r.kind === 'comment' ? (
            <Comment key={`c${i}`} text={r.text} path={r.path} row />
          ) : (
            <LineView key={`v${i}`} line={r.line} main />
          ),
        )}
      </div>
    </Badges.Provider>
  );
}

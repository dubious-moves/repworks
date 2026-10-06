// The notation (PLAN.md §4.11, D21): the main line in rows of two moves, comments and variations
// on rows of their own, as Qchess's study page shows them. Each move reads its own "current"
// signal, so stepping through a line redraws the move left and the move reached, not the tree.
import { effect, signal, type Signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { at, goTo } from '../app/editor.ts';
import { hasMarker } from '../core/merge/markers.ts';
import type { Chapter } from '../core/study/model.ts';
import { notation, pathKey, type Cell, type Inline, type Line, type Move as MoveData } from '../core/study/notation.ts';
import type { Path } from '../core/study/tree.ts';

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
      aria-current={isCurrent ? 'true' : undefined}
    >
      {props.number && <span class="number">{`${props.number} `}</span>}
      {m.san}
      {m.glyphs && <span class="glyphs">{m.glyphs}</span>}
    </span>
  );
}

function Comment(props: { text: string; path: Path; row?: boolean }) {
  const conflict = hasMarker(props.text);
  const Tag = props.row ? 'div' : 'span';
  return (
    <Tag class={`comment${props.row ? ' comment-row' : ''}${conflict ? ' conflict' : ''}`} onClick={() => goTo(props.path)}>
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
  return (
    <div class="notation" role="list" aria-label="Moves">
      <div class="start-row">
        <span class={`move start${startCurrent ? ' current' : ''}`} data-path="" onClick={() => goTo([])}>
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
  );
}

// The branch picker, as Qchess's study page has it: stepping on (→ or ▶) from a move where the
// line branches lists the moves that go on from there, the main line's first; ↑ ↓ choose, → ▶ or
// Enter go on along the one chosen, a click goes along it too, ← or Escape close the list.
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { at, chapter, goTo } from '../app/editor.ts';
import { nodeAt, positionAt, samePath, type Path } from '../core/study/tree.ts';

const picking = signal<{ path: Path; options: string[]; i: number } | undefined>(undefined);

export const branchOpen = () => !!picking.peek();

export const closeBranches = () => (picking.value = undefined);

/**
 * One step on from the move shown: where the line branches, the list opens (or, open, goes on
 * along the move chosen in it). False where nothing goes on, so the caller can do something else.
 */
export function stepOn(): boolean {
  const open = picking.peek();
  if (open) {
    picking.value = undefined;
    goTo([...open.path, open.options[open.i]!]);
    return true;
  }
  const c = chapter.peek();
  const path = at.peek();
  const children = c ? (nodeAt(c, path)?.children ?? []) : [];
  if (!children.length) return false;
  if (children.length === 1) goTo([...path, children[0]!.san]);
  else picking.value = { path: [...path], options: children.map((n) => n.san), i: 0 };
  return true;
}

/** ↑ ↓ in the open list; false when it isn't open. */
export function chooseBranch(by: -1 | 1): boolean {
  const open = picking.peek();
  if (!open) return false;
  picking.value = { ...open, i: Math.max(0, Math.min(open.options.length - 1, open.i + by)) };
  return true;
}

/** Where the list goes: under the move shown in the notation, else under the notation's top. */
function anchor(): DOMRect | undefined {
  const move = document.querySelector<HTMLElement>('.notation .move.current');
  const r = move?.getBoundingClientRect();
  if (r && r.bottom > 0 && r.top < innerHeight) return r;
  return document.querySelector<HTMLElement>('.notation')?.getBoundingClientRect();
}

export function BranchPicker() {
  const p = picking.value;
  const c = chapter.value;
  const shown = at.value;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | undefined>(undefined);

  // Any other way of moving closes it.
  useEffect(() => {
    if (p && !samePath(p.path, shown)) closeBranches();
  }, [p, shown]);

  useEffect(() => {
    if (!p) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element | null)?.closest?.('[aria-label="Next move"]')) closeBranches();
    };
    document.addEventListener('pointerdown', outside, true);
    addEventListener('resize', closeBranches);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('resize', closeBranches);
    };
  }, [!!p]);

  useLayoutEffect(() => {
    const el = ref.current;
    const r = anchor();
    if (!p || !el) return setPlace(undefined);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = r ? r.left : (innerWidth - w) / 2;
    const y = r ? r.bottom + 2 : (innerHeight - h) / 2;
    setPlace({ left: Math.max(4, Math.min(x, innerWidth - w - 4)), top: y + h > innerHeight - 4 ? Math.max(4, (r ? r.top : y) - h - 2) : y });
  }, [p?.path.join(' ')]);

  if (!p || !c) return null;
  const pos = positionAt(c, p.path);
  const number = pos ? `${pos.fullmoves}${pos.turn === 'white' ? '.' : '...'}` : '';
  return (
    <div
      ref={ref}
      class="branch-picker"
      role="listbox"
      aria-label="Choose the line"
      aria-activedescendant={`branch-${p.i}`}
      style={place ? { left: `${place.left}px`, top: `${place.top}px` } : { visibility: 'hidden' }}
    >
      {p.options.map((san, i) => (
        <div
          key={san}
          id={`branch-${i}`}
          role="option"
          aria-selected={i === p.i}
          class={i === p.i ? 'on' : ''}
          onPointerEnter={() => (picking.value = { ...p, i })}
          onClick={() => {
            closeBranches();
            goTo([...p.path, san]);
          }}
        >
          {number}
          {san}
        </div>
      ))}
    </div>
  );
}

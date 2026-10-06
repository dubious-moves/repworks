// Transposition badges (PLAN.md §5.11, q_extension's): `⇄n` on a move whose position n other move
// orders of the chapter also reach, and a smaller `+k` for the k other repertoire chapters that
// reach it (from the index). Either opens a list of those places, each a link to it.
import { createContext } from 'preact';
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { chapter, goTo, study } from '../app/editor.ts';
import { open } from '../app/mode.ts';
import { trainData } from '../app/train.ts';
import type { Occurrence, RepertoireIndex } from '../core/repertoire/index.ts';
import { header, type Chapter } from '../core/study/model.ts';
import { pathKey } from '../core/study/notation.ts';
import { linePgn } from '../core/study/ops.ts';
import type { Path } from '../core/study/tree.ts';
import type { Transpositions } from '../core/study/transpositions.ts';
import { otherOrders } from '../core/study/transpositions.ts';

export interface Badge {
  /** The chapter's other paths to the move's position. */
  orders: Path[];
  /** One place in each other repertoire chapter that reaches it. */
  chapters: Occurrence[];
}

/** Each move's badge, by `pathKey`; moves with nothing to show have none. */
export const Badges = createContext<ReadonlyMap<string, Badge>>(new Map());

export function badgesOf(t: Transpositions, index: RepertoireIndex | undefined, sid: string | undefined, cid: string | undefined): Map<string, Badge> {
  const out = new Map<string, Badge>();
  for (const [key, positionKey] of t.keyOf) {
    const path = key === '' ? [] : key.split(' ');
    const orders = t.paths.has(positionKey) ? otherOrders(t, path) : [];
    const seen = new Set<string>();
    const chapters: Occurrence[] = [];
    for (const o of index?.reached.get(positionKey) ?? []) {
      const where = `${o.sid}/${o.cid}`;
      if ((o.sid === sid && o.cid === cid) || seen.has(where)) continue;
      seen.add(where);
      chapters.push(o);
    }
    if (orders.length || chapters.length) out.set(key, { orders, chapters });
  }
  return out;
}

const listing = signal<{ path: Path; badge: Badge; x: number; y: number; above: number } | undefined>(undefined);
const close = () => (listing.value = undefined);

/** Opens the list of a move's other places under the badge clicked. */
export function openTranspositions(path: Path, badge: Badge, el: Element): void {
  const r = el.getBoundingClientRect();
  listing.value = { path, badge, x: r.left, y: r.bottom, above: r.top };
}

function chapterLabel(o: Occurrence, chapters: ReadonlyMap<string, Chapter> | undefined, studies: ReadonlyMap<string, string> | undefined): string {
  const c = chapters?.get(`${o.sid}/${o.cid}`);
  const name = c ? (header(c, 'ChapterName') ?? o.cid) : o.cid;
  const moves = c ? linePgn(c, o.path) : o.path.join(' ');
  return `${studies?.get(o.sid) ?? o.sid} · ${name}: ${moves}`;
}

export function TranspositionList() {
  const l = listing.value;
  const c = chapter.value;
  const s = study.value;
  const data = trainData.value;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | undefined>(undefined);

  useEffect(() => {
    if (!l) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('resize', close);
    };
  }, [l]);
  // Another chapter, or an edit that changed the moves: the list no longer applies.
  useEffect(close, [c, s?.cid]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!l || !el) return setPlace(undefined);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPlace({ left: l.x + w > innerWidth - 4 ? Math.max(4, innerWidth - 4 - w) : l.x, top: l.y + h > innerHeight - 4 ? Math.max(4, l.above - h) : l.y });
  }, [l]);
  useEffect(() => {
    if (place) ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [place]);

  if (!l || !c || !s) return null;
  const go = (run: () => void) => () => {
    close();
    run();
  };
  const onKey = (e: KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') close();
    else if (e.key === 'ArrowDown') buttons[(i + 1) % buttons.length]?.focus();
    else if (e.key === 'ArrowUp') buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    else if (e.key !== 'Enter' && e.key !== ' ') return;
    e.stopPropagation();
    if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault();
  };
  return (
    <div
      ref={ref}
      class="move-menu transpositions"
      role="menu"
      aria-label="Same position"
      style={place ? { left: `${place.left}px`, top: `${place.top}px` } : { left: `${l.x}px`, top: `${l.y}px`, visibility: 'hidden' }}
      onKeyDown={onKey}
    >
      {l.badge.orders.length > 0 && <div class="menu-heading">Other move orders here</div>}
      {l.badge.orders.map((p) => (
        <button key={pathKey(p)} type="button" role="menuitem" onClick={go(() => goTo(p))}>
          {linePgn(c, p)}
        </button>
      ))}
      {l.badge.chapters.length > 0 && <div class="menu-heading">Other chapters</div>}
      {l.badge.chapters.map((o) => (
        <button key={`${o.sid}/${o.cid}`} type="button" role="menuitem" onClick={go(() => open({ name: 'chapter', sid: o.sid, cid: o.cid, at: [...o.path] }))}>
          {chapterLabel(o, data?.chapters, data?.studyNames)}
        </button>
      ))}
    </div>
  );
}

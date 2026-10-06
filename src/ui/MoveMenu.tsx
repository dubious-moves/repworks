// The move menu and the comment dialog (PLAN.md §4.11), as Qchess's study page has them:
// right-click a move (long-press on the phone, or the ⋯ button for the move shown) for its
// actions; "Comment" opens a dialog with the comment and the glyphs, so the panel keeps its room
// for the notation.
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { chapter, doc, edit, feedback, goTo } from '../app/editor.ts';
import { LICHESS_COMMENT_LIMIT, sanitizeComment } from '../core/pgn/comment.ts';
import { GLYPHS, MOVE_GLYPHS, OBSERVATION_GLYPHS, POSITION_GLYPHS } from '../core/pgn/nags.ts';
import { deletePath, linePgn, makeMainline, ownComment, promote, setComment, setNags, toggleGlyph, variationStart } from '../core/study/ops.ts';
import { nodeAt, type Path } from '../core/study/tree.ts';

const GLYPH_ROWS: readonly (readonly number[])[] = [
  [3, 1, 5, 6, 2, 4, 146],
  [7, 22, ...OBSERVATION_GLYPHS.filter((n) => n !== 146)],
  [...POSITION_GLYPHS],
];
const SHOWN = new Set<number>([...MOVE_GLYPHS, ...POSITION_GLYPHS, ...OBSERVATION_GLYPHS]);

const menu = signal<{ path: Path; x: number; y: number; above: number } | undefined>(undefined);
const commenting = signal<Path | undefined>(undefined);

/**
 * Opens the menu for the move at `path` with its corner at a point on screen, and shows that
 * move. Where it doesn't fit below `y`, it ends at `above` (a button's top edge, say) instead.
 */
export function openMenu(path: Path, x: number, y: number, above = y): void {
  const c = chapter.peek();
  if (!c || !nodeAt(c, path)) return;
  // Without an editable chapter, the start has nothing to offer.
  if (!doc.peek() && path.length === 0) return;
  goTo(path);
  menu.value = { path, x, y, above };
}

const close = () => (menu.value = undefined);

async function copyLine(path: Path) {
  const c = chapter.peek();
  if (!c) return;
  try {
    await navigator.clipboard.writeText(linePgn(c, path));
    feedback.value = 'Line copied';
  } catch {
    feedback.value = 'The browser did not allow copying';
  }
}

export function MoveMenu() {
  const m = menu.value;
  const c = chapter.value;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | undefined>(undefined);

  useEffect(() => {
    if (!m) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('resize', close);
    };
  }, [m]);

  // Kept inside the window, flipped up or left where it would run off the edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!m || !el) return setPlace(undefined);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = m.x + w > innerWidth - 4 ? Math.max(4, m.x - w) : m.x;
    const top = m.y + h > innerHeight - 4 ? Math.max(4, m.above - h) : m.y;
    setPlace({ left, top });
  }, [m]);

  // Focused once placed: a hidden button can't take the focus.
  useEffect(() => {
    if (place) ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [place]);

  if (!m || !c) return null;
  const editable = Boolean(doc.value);
  const isMove = m.path.length > 0;
  const parent = isMove ? nodeAt(c, m.path.slice(0, -1)) : undefined;
  const first = parent?.children[0]?.san === m.path[m.path.length - 1];
  const items: { label: string; class?: string; run: () => void }[] = [];
  if (editable) items.push({ label: 'Comment', class: 'comment', run: () => (commenting.value = m.path) });
  if (editable && isMove && !first) items.push({ label: 'Promote', class: 'promote', run: () => edit((ch) => promote(ch, m.path)) });
  if (editable && variationStart(c, m.path)) items.push({ label: 'Make main line', class: 'promote', run: () => edit((ch) => makeMainline(ch, m.path)) });
  if (editable && isMove) items.push({ label: 'Delete from here', class: 'delete', run: () => edit((ch) => deletePath(ch, m.path), m.path.slice(0, -1)) });
  if (isMove) items.push({ label: 'Copy line as PGN', run: () => void copyLine(m.path) });

  const onKey = (e: KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') close();
    else if (e.key === 'ArrowDown') buttons[(i + 1) % buttons.length]?.focus();
    else if (e.key === 'ArrowUp') buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    else if (e.key !== 'Enter' && e.key !== ' ') return;
    // The chapter view's keys would otherwise move along the line behind the menu.
    e.stopPropagation();
    if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault();
  };

  return (
    <div
      ref={ref}
      class="move-menu"
      role="menu"
      aria-label="Move"
      style={place ? { left: `${place.left}px`, top: `${place.top}px` } : { left: `${m.x}px`, top: `${m.y}px`, visibility: 'hidden' }}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          class={item.class}
          onClick={() => {
            close();
            item.run();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function CommentDialog() {
  const path = commenting.value;
  const c = chapter.value;
  const node = path && c ? nodeAt(c, path) : undefined;
  // The chapter can change under the dialog (a sync, another tab): it closes if the move is gone.
  useEffect(() => {
    if (path && !node) commenting.value = undefined;
  }, [path, node]);
  if (!path || !node || !doc.value) return null;
  return <CommentForm key={path.join(' ')} path={path} />;
}

function CommentForm(props: { path: Path }) {
  const c = chapter.value!;
  const node = nodeAt(c, props.path)!;
  const own = ownComment(node);
  const editable = own === undefined || !own.includes('<<<<<<<');
  const [draft, setDraft] = useState(editable ? (own ?? '') : '');
  const checked = sanitizeComment(draft);
  const isMove = props.path.length > 0;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    // A phone would raise its keyboard over the glyphs: there the text is a tap away.
    if (matchMedia('(pointer: fine)').matches) d.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    else d.querySelector<HTMLElement>('.dialog-buttons .secondary')?.focus();
  }, []);

  const done = () => (commenting.value = undefined);
  const save = () => {
    if (editable && checked.text !== (own ?? '')) edit((ch) => setComment(ch, props.path, draft));
    done();
  };
  const glyphs = node.nags.filter((n) => SHOWN.has(n));

  return (
    <dialog
      ref={ref}
      class="comment-dialog"
      aria-labelledby="comment-dialog-title"
      onCancel={(e) => (e.preventDefault(), done())}
    >
      <h2 id="comment-dialog-title">{isMove ? `Comment on ${props.path[props.path.length - 1]}` : 'Comment before the first move'}</h2>
      {editable ? (
        <textarea
          name="comment"
          aria-label={isMove ? 'Comment on this move' : 'Comment before the first move'}
          placeholder="Enter a comment…"
          rows={8}
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.preventDefault(), save());
          }}
        />
      ) : (
        <p class="warn">This comment holds a conflict: resolve it under the notation first.</p>
      )}
      {checked.tooLong && <p class="warn">Over {LICHESS_COMMENT_LIMIT.toLocaleString('en')} characters: Lichess would cut it.</p>}
      {isMove && (
        <div class="annotate" role="group" aria-label="Glyphs">
          <h3>Annotate</h3>
          {GLYPH_ROWS.map((row, i) => (
            <div class="glyphs" key={i}>
              {row.map((nag) => (
                <button
                  key={nag}
                  type="button"
                  title={GLYPHS[nag]!.name}
                  aria-label={GLYPHS[nag]!.name}
                  aria-pressed={node.nags.includes(nag)}
                  class={node.nags.includes(nag) ? 'on' : ''}
                  onClick={() => edit((ch) => toggleGlyph(ch, props.path, nag))}
                >
                  {GLYPHS[nag]!.symbol}
                </button>
              ))}
            </div>
          ))}
          <button type="button" class="clear" disabled={!glyphs.length} onClick={() => edit((ch) => setNags(ch, props.path, node.nags.filter((n) => !SHOWN.has(n))))}>
            Clear glyphs
          </button>
        </div>
      )}
      <div class="dialog-buttons">
        <button type="button" class="primary" onClick={save}>
          Save
        </button>
        <button type="button" class="secondary" onClick={done}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

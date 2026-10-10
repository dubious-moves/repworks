// The move menu and the comment dialog (PLAN.md §4.11), as Qchess's study page has them:
// right-click a move (long-press on the phone, or the ⋯ button for the move shown) for its
// actions; "Comment" opens a dialog with the comment and the glyphs, so the panel keeps its room
// for the notation.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { chapter, doc, edit, feedback, goTo, SCRATCH, side, study } from '../app/editor.ts';
import { planEnrolled, setPlanCard } from '../app/plans.ts';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { makeFen } from 'chessops/fen';
import { trainData } from '../app/train.ts';
import { open } from '../app/mode.ts';
import { LICHESS_COMMENT_LIMIT, sanitizeComment } from '../core/pgn/comment.ts';
import { GLYPHS, MOVE_GLYPHS, OBSERVATION_GLYPHS, POSITION_GLYPHS } from '../core/pgn/nags.ts';
import { continuation, deletePath, linePgn, makeMainline, ownComment, promote, setComment, setNags, toggleGlyph, variationStart } from '../core/study/ops.ts';
import { nodeAt, positionAt, type Path } from '../core/study/tree.ts';

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

/** Copies a FEN to the clipboard (the owner's request, 2026-10-08), saying so under the board. */
export async function copyFen(fen: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(fen);
    feedback.value = 'FEN copied';
  } catch {
    feedback.value = 'The browser did not allow copying';
  }
}

async function copyLine(path: Path, how: 'line' | 'continuation') {
  const c = chapter.peek();
  if (!c) return;
  try {
    await navigator.clipboard.writeText(how === 'line' ? linePgn(c, path) : continuation(c, path));
    feedback.value = how === 'line' ? 'Line copied' : 'Continuation copied';
  } catch {
    feedback.value = 'The browser did not allow copying';
  }
}

export function MoveMenu() {
  const m = menu.value;
  const c = chapter.value;
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
  if (isMove) items.push({ label: 'Copy line as PGN', run: () => void copyLine(m.path, 'line') });
  // From the branch's first move to the line's end, numbered from there (§5.11).
  if (isMove) items.push({ label: 'Copy continuation', run: () => void copyLine(m.path, 'continuation') });
  // The position after the move (or the start), as on the board.
  items.push({
    label: 'Copy FEN',
    run: () => {
      const pos = positionAt(c, m.path);
      if (pos) void copyFen(makeFen(pos.toSetup()));
    },
  });
  const s = study.value;
  if (s && s.sid !== SCRATCH) {
    // The analysis board from this move's position, its lines able to come back here (§5.35).
    items.push({
      label: 'Analyse from here',
      run: () => {
        const pos = positionAt(c, m.path);
        // The board keeps its side: the chapter's, whoever is to move.
        if (pos) open({ name: 'analysis', fen: makeFen(pos.toSetup()), from: { sid: s.sid, cid: s.cid, at: [...m.path] }, side: side.peek() });
      },
    });
    // The storm over the lines through this move (§5.43, lichessable §28), in a repertoire chapter.
    if (trainData.value?.chapters.has(`${s.sid}/${s.cid}`)) items.push({ label: 'Storm from here', run: () => open({ name: 'storm', sid: s.sid, cid: s.cid, at: [...m.path] }) });
    // Qchess's two training views of the line through this move (§5.10).
    items.push({ label: 'Read from here', run: () => open({ name: 'read', sid: s.sid, cid: s.cid, at: [...m.path] }) });
    items.push({ label: 'Quiz from here', run: () => open({ name: 'play', sid: s.sid, cid: s.cid, at: [...m.path] }) });
    // A game from this position against the database, Maia and Stockfish, as the chapter's side (§5.57).
    items.push({
      label: 'Practise from here',
      run: () => {
        const pos = positionAt(c, m.path);
        if (pos) open({ name: 'playOn', fen: makeFen(pos.toSetup()), side: side.peek() });
      },
    });
    // A plan card for this position (§5.61): its content is the comments there, read live.
    const pos = positionAt(c, m.path);
    const node = nodeAt(c, m.path);
    if (pos && node) {
      const key = positionKeyOf(pos);
      const enrolled = planEnrolled.value.has(key);
      if (enrolled) items.push({ label: 'Remove the plan card', run: () => setPlanCard(key, side.peek(), false) });
      else if (node.comments.some((t) => t.trim()) || node.shapes.length) items.push({ label: 'Make a plan card', run: () => (setPlanCard(key, side.peek(), true), (feedback.value = 'Plan card made: it comes up with the game cards')) });
    }
  }

  return (
    <FloatingMenu at={m} label="Move" onClose={close}>
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
    </FloatingMenu>
  );
}

/**
 * A menu at a point on screen (the move menu, the study's ☰ menu): kept inside the window,
 * flipped up or left where it would run off the edge (up to end at `above`, a button's top edge,
 * say), closed by a press outside it, a resize, Escape or Tab; ↑ ↓ move between its items.
 */
export function FloatingMenu(props: { at: { x: number; y: number; above: number; opener?: Element }; label: string; onClose: () => void; children: ComponentChildren }) {
  const { at, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | undefined>(undefined);

  useEffect(() => {
    // A press on the button that opened it is left to that button, which closes it.
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !at.opener?.contains(t)) onClose();
    };
    // Escape closes it wherever the focus is (a tap can leave it on the page behind).
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      removeEventListener('resize', onClose);
    };
  }, [at]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return setPlace(undefined);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = at.x + w > innerWidth - 4 ? Math.max(4, at.x - w) : at.x;
    const top = at.y + h > innerHeight - 4 ? Math.max(4, at.above - h) : at.y;
    setPlace({ left, top });
  }, [at]);

  // Focused once placed: a hidden button can't take the focus.
  useEffect(() => {
    if (place) ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [place]);

  const onKey = (e: KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') onClose();
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
      aria-label={props.label}
      style={place ? { left: `${place.left}px`, top: `${place.top}px` } : { left: `${at.x}px`, top: `${at.y}px`, visibility: 'hidden' }}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      {props.children}
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

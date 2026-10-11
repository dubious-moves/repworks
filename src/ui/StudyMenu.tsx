// The study's ☰ menu (the owner's notes of 2026-10-10, PLAN.md §5.87): first in the move-button
// bar, it holds what the bar and the row under the board held besides moving along the line: the
// explorer, undo and redo, and Copy FEN. The bar keeps ⏮ ◀ ▶ ⏭ (and ✎ ⋯ on a touch screen).
// Below them the study's own (§5.88): New chapter and the chapter's and the study's settings,
// which a phone's head had squeezed beside the chapter's name.
import { signal } from '@preact/signals';
import { doc, redoEdit, undoEdit } from '../app/editor.ts';
import { prefs, setPrefs } from '../app/explorer.ts';
import { copyFen, FloatingMenu } from './MoveMenu.tsx';

const menu = signal<{ x: number; y: number; above: number; opener: Element } | undefined>(undefined);
const close = () => (menu.value = undefined);

export function StudyMenuButton() {
  return (
    <button
      type="button"
      aria-label="More"
      aria-haspopup="menu"
      aria-expanded={Boolean(menu.value)}
      title="The explorer, undo and redo, Copy FEN, the chapter and the study"
      onClick={(e) => {
        if (menu.peek()) return close();
        const r = e.currentTarget.getBoundingClientRect();
        menu.value = { x: r.left, y: r.bottom, above: r.top, opener: e.currentTarget };
      }}
    >
      ☰
    </button>
  );
}

/** What the menu does for a study (none on the analysis board). */
export interface StudyActions {
  newChapter(): void;
  chapterSettings(): void;
  settings(): void;
}

/** Outside the frame, as the move menu is: its size containment would place a fixed menu inside it. */
export function StudyMenu(props: { fen: string; study?: StudyActions }) {
  const m = menu.value;
  if (!m) return null;
  const explorer = prefs.value.on;
  const run = (f: () => void) => () => {
    close();
    f();
  };
  return (
    <FloatingMenu at={m} label="More" onClose={close}>
      <button type="button" role="menuitemcheckbox" aria-checked={explorer} title={explorer ? 'Close the explorer (no requests while it is closed)' : 'Open the explorer'} onClick={run(() => setPrefs({ on: !explorer }))}>
        <span class="menu-check" aria-hidden="true">{explorer ? '✓' : ''}</span>
        Explorer
      </button>
      <button type="button" role="menuitem" disabled={!doc.value?.past.length} onClick={run(undoEdit)}>
        <span class="menu-check" aria-hidden="true">↶</span>
        Undo <kbd>Ctrl+Z</kbd>
      </button>
      <button type="button" role="menuitem" disabled={!doc.value?.future.length} onClick={run(redoEdit)}>
        <span class="menu-check" aria-hidden="true">↷</span>
        Redo <kbd>Ctrl+Y</kbd>
      </button>
      <button type="button" role="menuitem" title={props.fen} onClick={run(() => void copyFen(props.fen))}>
        <span class="menu-check" aria-hidden="true" />
        Copy FEN
      </button>
      {props.study && (
        <>
          <hr class="menu-sep" role="separator" />
          <button type="button" role="menuitem" onClick={run(props.study.newChapter)}>
            <span class="menu-check" aria-hidden="true">+</span>
            New chapter…
          </button>
          <button type="button" role="menuitem" onClick={run(props.study.chapterSettings)}>
            <span class="menu-check" aria-hidden="true" />
            Chapter settings…
          </button>
          <button type="button" role="menuitem" onClick={run(props.study.settings)}>
            <span class="menu-check" aria-hidden="true" />
            Study settings…
          </button>
        </>
      )}
    </FloatingMenu>
  );
}

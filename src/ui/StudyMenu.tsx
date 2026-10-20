// The study's ☰ menu (the owner's notes of 2026-10-10, PLAN.md §5.87): first in the move-button
// bar, it holds what the bar and the row under the board held besides moving along the line: the
// explorer, undo and redo, and Copy FEN. The bar keeps ⏮ ◀ ▶ ⏭ (and ✎ ⋯ on a touch screen).
// Below them the study's own (§5.88): New chapter and the chapter's and the study's settings,
// which a phone's head had squeezed beside the chapter's name. Between the two, what starts from
// the move shown (§5.90, out of the move's menu): Analyse, Storm, Practise and its plan card.
// Export PGN downloads the open chapter as its file in the data repo, edits not yet synced included.
// An idea deck's cards are made or removed at the end (§5.128).
import { signal } from '@preact/signals';
import { makeFen } from 'chessops/fen';
import { at, chapter, doc, feedback, redoEdit, side, study, undoEdit } from '../app/editor.ts';
import { prefs, setPrefs } from '../app/explorer.ts';
import { open } from '../app/mode.ts';
import { enrolStudy, ideaEnrolled } from '../app/ideas.ts';
import { planEnrolled, setPlanCard } from '../app/plans.ts';
import { enrolledIn, isDeckChapter } from '../core/ideas/cards.ts';
import { trainData } from '../app/train.ts';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { chapterExportName, chapterFileText } from '../core/pgn/write.ts';
import { header } from '../core/study/model.ts';
import { nodeAt, positionAt } from '../core/study/tree.ts';
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
      title="The explorer, undo and redo, Copy FEN, from the move shown, the chapter and the study, Export PGN"
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
  exportPgn(): void;
  settings(): void;
}

/** Outside the frame, as the move menu is: its size containment would place a fixed menu inside it. */
/** Downloads the open chapter as a PGN file: the text its file in the data repo holds. */
export function exportChapterPgn(): void {
  const s = study.peek();
  const c = chapter.peek();
  if (!s || !c) return;
  const name = s.chapters.find((e) => e.id === s.cid)?.name ?? header(c, 'ChapterName') ?? '';
  const url = URL.createObjectURL(new Blob([chapterFileText(c)], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = chapterExportName(s.meta.name, name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  feedback.value = 'PGN exported';
}

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
      {props.study && <FromHere run={run} />}
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
          <button type="button" role="menuitem" title="Download this chapter as a PGN file" onClick={run(props.study.exportPgn)}>
            <span class="menu-check" aria-hidden="true">⤓</span>
            Export PGN
          </button>
          <button type="button" role="menuitem" onClick={run(props.study.settings)}>
            <span class="menu-check" aria-hidden="true" />
            Study settings…
          </button>
          <IdeaCards run={run} />
        </>
      )}
    </FloatingMenu>
  );
}

/**
 * An idea deck's cards (§5.128), made for the whole study: shown in a study whose open chapter is
 * a deck's (it has an `IdeaKind`), or which has cards. With cards, the chapters added since get
 * theirs, or every card goes.
 */
function IdeaCards(props: { run: (f: () => void) => () => void }) {
  const s = study.value;
  const c = chapter.value;
  if (!s) return null;
  const cards = enrolledIn(ideaEnrolled.value, s.sid).length;
  if (!cards && !(c && isDeckChapter(c))) return null;
  const enrol = (on: boolean) => () => void enrolStudy(s.sid, on).then((said) => (feedback.value = said));
  return (
    <>
      <hr class="menu-sep" role="separator" />
      <button type="button" role="menuitem" title="Every chapter of this idea deck but the rules of thumb, as a card asked from the study’s Train button" onClick={props.run(enrol(true))}>
        <span class="menu-check" aria-hidden="true" />
        {cards ? 'Idea cards for new chapters' : 'Make idea cards'}
      </button>
      {cards > 0 && (
        <button type="button" role="menuitem" onClick={props.run(enrol(false))}>
          <span class="menu-check" aria-hidden="true" />
          Remove the idea cards ({cards})
        </button>
      )}
    </>
  );
}

/** What starts from the move shown, in a study: the analysis board, the storm, a game, a plan card. */
function FromHere(props: { run: (f: () => void) => () => void }) {
  const s = study.value;
  const c = chapter.value;
  const path = at.value;
  const pos = c && positionAt(c, path);
  const node = c && nodeAt(c, path);
  if (!s || !c || !pos || !node) return null;
  const fen = makeFen(pos.toSetup());
  const key = positionKeyOf(pos);
  const enrolled = planEnrolled.value.has(key);
  // A plan card's content is the comments there, read live (§5.61): none without them.
  const plannable = enrolled || node.comments.some((t) => t.trim()) || node.shapes.length > 0;
  const { run } = props;
  return (
    <>
      <hr class="menu-sep" role="separator" />
      {/* Its lines able to come back here (§5.35); the board keeps the chapter's side, whoever is to move. */}
      <button type="button" role="menuitem" onClick={run(() => open({ name: 'analysis', fen, from: { sid: s.sid, cid: s.cid, at: [...path] }, side: side.peek() }))}>
        <span class="menu-check" aria-hidden="true" />
        Analyse from here
      </button>
      {/* The storm over the lines through this move (§5.43), in a repertoire chapter. */}
      {trainData.value?.chapters.has(`${s.sid}/${s.cid}`) && (
        <button type="button" role="menuitem" onClick={run(() => open({ name: 'storm', sid: s.sid, cid: s.cid, at: [...path] }))}>
          <span class="menu-check" aria-hidden="true" />
          Storm from here
        </button>
      )}
      {/* A game from this position against the database, Maia and Stockfish, as the chapter's side (§5.57). */}
      <button type="button" role="menuitem" onClick={run(() => open({ name: 'playOn', fen, side: side.peek() }))}>
        <span class="menu-check" aria-hidden="true" />
        Practise from here
      </button>
      {plannable && (
        <button
          type="button"
          role="menuitem"
          onClick={run(() => (enrolled ? setPlanCard(key, side.peek(), false) : (setPlanCard(key, side.peek(), true), (feedback.value = 'Plan card made: it comes up with the game cards'))))}
        >
          <span class="menu-check" aria-hidden="true" />
          {enrolled ? 'Remove the plan card' : 'Make a plan card'}
        </button>
      )}
    </>
  );
}

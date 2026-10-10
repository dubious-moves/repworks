// The chapter view (PLAN.md §4.11, D21), laid out as Qchess's study page: on a wide screen the
// chapters on the left (each with its ⚙, the study's ⚙ by its name, "+ New chapter" at the foot:
// §5.15), the board, and a panel with the notation, the conflicts at the move shown and the move
// buttons. On the phone: the board, the move buttons, the notation, then the tools; the study's
// and the chapter's ⚙ and "+" sit in the head, by the chapter menu. The head's switch goes to
// training as Qchess's Move Trainer does. Play a move to extend a line or branch from it; a
// move's other edits are in its menu (right-click, long-press or ⋯) and the comment dialog.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { parseSquare } from 'chessops/util';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import type { Key } from '@lichess-org/chessground/types';
import type { Move, Role } from 'chessops/types';
import { afterEdits, at, chapter, conflictsHere, doc, edit, feedback, move, play, problem, redoEdit, resolve, SCRATCH, side, study, undoEdit } from '../app/editor.ts';
import { AnalysisFen, AnalysisHead } from './Analysis.tsx';
import { open } from '../app/mode.ts';
import { left, trainingFrom } from '../app/train.ts';
import { endPreview, enterCommentLines, preview, stepPreview } from '../app/preview.ts';
import { isKeptMarker, parseTextConflict, type OpenConflict } from '../core/merge/markers.ts';
import type { Brush, Chapter } from '../core/study/model.ts';
import { setShapes } from '../core/study/ops.ts';
import { pathKey } from '../core/study/notation.ts';
import { nodeAt, positionAt, samePath, type Path } from '../core/study/tree.ts';
import { Board } from './Board.tsx';
import { addAlternative, altAdding, CardPanel } from './CardPanel.tsx';
import { CommentDialog, MoveMenu, openMenu } from './MoveMenu.tsx';
import { StudyMenu, StudyMenuButton } from './StudyMenu.tsx';
import { BranchPicker, branchOpen, chooseBranch, closeBranches, stepOn } from './BranchPicker.tsx';
import { Notation } from './Notation.tsx';
import { endPreviewOnBoard, PreviewBar, previewBoard } from './CommentText.tsx';
import { ModeSwitch } from './ModeSwitch.tsx';
import { openChapterSettings, openNewChapter, openStudySettings } from './StudyDialogs.tsx';
import { TranspositionList } from './Transpositions.tsx';
import { Explorer } from './Explorer.tsx';
import { EnginePanel, EvalBar, useEngineArrows } from './Engine.tsx';
import { analysePosition, setThreat, threat } from '../app/engine.ts';
import { Back } from './Back.tsx';

const BRUSH_NAMES: Brush[] = ['green', 'red', 'blue', 'yellow'];

function boardState(c: Chapter, path: Path) {
  const pos = positionAt(c, path)!;
  let lastMove: [Key, Key] | undefined;
  if (path.length) {
    const before = positionAt(c, path.slice(0, -1))!;
    const m = parseSan(before, path[path.length - 1]!);
    if (m) lastMove = chessgroundMove(m) as [Key, Key];
  }
  return { pos, fen: makeFen(pos.toSetup()), dests: chessgroundDests(pos) as Map<Key, Key[]>, lastMove, check: pos.isCheck() };
}

/**
 * Line jumping (§5.12): → on the last move of a line enters the first line written in its
 * comments. False when the move has a continuation or no line to enter.
 */
function jumpIntoComment(): boolean {
  const c = chapter.peek();
  const path = at.peek();
  const node = c && nodeAt(c, path);
  if (!c || !node || node.children.length) return false;
  return enterCommentLines('chapter', pathKey(path), node.comments, positionAt(c, path), path.length ? positionAt(c, path.slice(0, -1)) : undefined);
}

export function ChapterView() {
  const s = study.value;
  const c = chapter.value;
  const path = at.value;
  const [drawMode, setDrawMode] = useState(false);
  const [brush, setBrush] = useState<Brush>('green');
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('dialog'))) return;
      const ctrl = e.ctrlKey || e.metaKey;
      // A line from a comment on the board takes ← → and Escape (§5.12).
      if (preview.peek()?.owner === 'chapter' && !ctrl) {
        const step: Record<string, () => void> = { ArrowLeft: () => stepPreview(-1), ArrowRight: () => stepPreview(1), Escape: endPreview };
        if (step[e.key]) {
          e.preventDefault();
          return step[e.key]!();
        }
      }
      // Where the line branches, → opens the list of moves that go on (Qchess's), ↑ ↓ choose.
      const picking = branchOpen();
      const keys: Record<string, () => void> = {
        ArrowLeft: () => (picking ? closeBranches() : move('prev')),
        ArrowRight: () => void (stepOn() || jumpIntoComment()),
        ArrowUp: () => void (chooseBranch(-1) || move('up')),
        ArrowDown: () => void (chooseBranch(1) || move('down')),
        ...(picking ? { Enter: () => void stepOn(), Escape: closeBranches } : {}),
        ...(altAdding.peek() ? { Escape: () => (altAdding.value = undefined) } : {}),
        Home: () => move('start'),
        End: () => move('end'),
        w: () => setThreat(!threat.peek()),
      };
      if (ctrl && e.key.toLowerCase() === 'z') (e.shiftKey ? redoEdit : undoEdit)();
      else if (ctrl && e.key.toLowerCase() === 'y') redoEdit();
      else if (!ctrl && keys[e.key]) keys[e.key]!();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Picking an alternative (§5.18) shows the position before the own move, and nothing is written to the chapter.
  const adding = altAdding.value && samePath(altAdding.value, path) ? path : undefined;
  useEffect(() => {
    if (altAdding.peek() && !samePath(altAdding.peek()!, path)) altAdding.value = undefined;
  }, [path]);
  const board = useMemo(() => (c ? boardState(c, adding ? adding.slice(0, -1) : path) : undefined), [c, path, adding]);
  // The engine looks at the board's position (§5.31), and at nothing once the page is left.
  useEffect(() => analysePosition(board?.pos), [board]);
  useEffect(() => () => analysePosition(undefined), []);
  const arrows = useEngineArrows();

  // Another chapter opens at the board, wherever the page was scrolled.
  useEffect(() => scrollTo({ top: 0 }), [s?.sid, s?.cid]);

  if (!s) return <p class="muted">{problem.value ?? 'Opening…'}</p>;
  const node = c ? nodeAt(c, path) : undefined;
  const shownLine = previewBoard('chapter');

  const onMove = (orig: Key, dest: Key) => {
    if (!board) return;
    const from = parseSquare(orig)!;
    const to = parseSquare(dest)!;
    const piece = board.pos.board.get(from);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    submit(normalizeMove(board.pos, { from, to }));
  };
  const submit = (m: Move) => {
    if (!board) return;
    if (adding) addAlternative(adding, m);
    else play(makeSan(board.pos, m));
  };
  const promote_ = (role: Role) => {
    if (!board || !promotion) return;
    submit({ from: parseSquare(promotion.orig)!, to: parseSquare(promotion.dest)!, promotion: role });
    setPromotion(undefined);
  };

  const studySettings = () => openStudySettings({ sid: s.sid, name: s.meta.name, kind: s.meta.kind, chapters: s.chapters.length });
  // Qchess's switch: back to the session left for the study, or training from here.
  const train = async () => {
    await afterEdits(async () => undefined);
    open(trainingFrom({ sid: s.sid, cid: s.cid, at: at.peek(), kind: s.meta.kind }));
  };
  const waiting = !!left.value;
  const trainTitle = waiting ? 'Back to the training session' : s.meta.kind === 'repertoire' ? 'Train the line shown' : 'Play the line from this move';
  // The analysis board (§5.35): the same view over a chapter on this device only.
  const scratch = s.sid === SCRATCH;

  return (
    <div class={`chapter-view${c && board ? ' has-frame' : ''}${waiting ? ' session-waiting' : ''}${scratch ? ' scratch' : ''}`}>
      {scratch ? <AnalysisHead /> : <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">
            {s.meta.name}
            <button type="button" class="icon head-tool" aria-label="Study settings" title="Study settings" onClick={studySettings}>
              ⚙
            </button>
          </span>
          <div class="chapter-pick head-tool">
            {s.chapters.length > 0 && (
              <select aria-label="Chapter" value={s.cid} onChange={(e) => open({ name: 'chapter', sid: s.sid, cid: e.currentTarget.value })}>
                {s.chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            )}
            {s.cid && (
              <button type="button" class="icon" aria-label="Chapter settings" title="Chapter settings" onClick={() => openChapterSettings(s.sid, s.cid)}>
                ⚙
              </button>
            )}
            <button type="button" class="icon" aria-label="New chapter" title="New chapter" onClick={openNewChapter}>
              +
            </button>
          </div>
        </div>
        <ModeSwitch current="study" onTrain={() => void train()} trainTitle={trainTitle} />
      </div>}
      {problem.value && (
        <p class="warn" role="alert">
          {problem.value}
        </p>
      )}
      {c && board && (
        <div class="cv-frame">
          <div class="cv-grid">
            {!scratch && <nav class="cv-chapters" aria-label="Chapters">
              <div class="cv-study">
                <span>{s.meta.name}</span>
                <button type="button" class="icon" aria-label="Study settings" title="Study settings" onClick={studySettings}>
                  ⚙
                </button>
              </div>
              <ol>
                {s.chapters.map((ch) => (
                  <li key={ch.id} onContextMenu={(e) => (e.preventDefault(), openChapterSettings(s.sid, ch.id))}>
                    <a
                      href={`#/study/${s.sid}/${ch.id}`}
                      aria-current={ch.id === s.cid ? 'page' : undefined}
                      onClick={(e) => (e.preventDefault(), open({ name: 'chapter', sid: s.sid, cid: ch.id }))}
                    >
                      {ch.name}
                    </a>
                    <button type="button" class="icon" aria-label={`Settings: ${ch.name}`} title="Chapter settings" onClick={() => openChapterSettings(s.sid, ch.id)}>
                      ⚙
                    </button>
                  </li>
                ))}
              </ol>
              <div class="cv-new">
                <button type="button" onClick={openNewChapter}>
                  + New chapter
                </button>
              </div>
            </nav>}
            <div class="cv-board" onPointerDown={shownLine ? endPreviewOnBoard : undefined}>
              <Board
                fen={shownLine?.fen ?? board.fen}
                orientation={side.value}
                turn={shownLine?.turn ?? board.pos.turn}
                dests={doc.value && !shownLine ? board.dests : new Map()}
                lastMove={shownLine ? shownLine.lastMove : board.lastMove}
                check={shownLine?.check ?? board.check}
                shapes={shownLine || adding ? [] : (node?.shapes ?? [])}
                drawMode={drawMode}
                brush={brush}
                onMove={onMove}
                onShapes={(shapes) => edit((ch) => setShapes(ch, at.peek(), shapes))}
                autoShapes={shownLine || drawMode ? [] : arrows}
                promotion={promotion && { dest: promotion.dest, onPick: (role) => (role ? promote_(role) : setPromotion(undefined)) }}
              />
              <EvalBar orientation={side.value} />
              <PreviewBar owner="chapter" />
              <p class="feedback" role="status">
                {feedback.value ?? ''}
              </p>
              {scratch && <AnalysisFen />}
            </div>
            <div class="cv-panel">
              <EnginePanel board={board.pos} />
              <Notation chapter={c} />
              {!scratch && (
                <div class="cv-tools">
                  {doc.value && <Conflicts />}
                  <CardPanel />
                </div>
              )}
              <Explorer chapter={c} path={path} />
              {drawMode && (
                <div class="brushes" role="radiogroup" aria-label="Colour">
                  {BRUSH_NAMES.map((b) => (
                    <button key={b} type="button" role="radio" aria-checked={brush === b} aria-label={b} class={`brush brush-${b}${brush === b ? ' on' : ''}`} onClick={() => setBrush(b)} />
                  ))}
                  <span class="muted">Drag for an arrow, tap for a circle; again to remove.</span>
                </div>
              )}
              <div class="controls">
                <StudyMenuButton />
                <button type="button" aria-label="Start" onClick={() => move('start')}>
                  ⏮
                </button>
                <button type="button" aria-label="Previous move" onClick={() => move('prev')}>
                  ◀
                </button>
                <button type="button" aria-label="Next move" onClick={() => void stepOn()}>
                  ▶
                </button>
                <button type="button" aria-label="End of the line" onClick={() => move('end')}>
                  ⏭
                </button>
                <button type="button" aria-pressed={drawMode} aria-label="Draw mode" class={`touch-only${drawMode ? ' on' : ''}`} onClick={() => setDrawMode(!drawMode)}>
                  ✎
                </button>
                <button
                  type="button"
                  aria-label="Move menu"
                  aria-haspopup="menu"
                  class="touch-only"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    openMenu(at.peek(), r.left, r.bottom, r.top);
                  }}
                >
                  ⋯
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Outside the frame, whose size containment would place a fixed menu inside it. */}
      <MoveMenu />
      {c && board && <StudyMenu fen={shownLine?.fen ?? board.fen} />}
      <BranchPicker />
      <TranspositionList />
      <CommentDialog />
    </div>
  );
}

/** The conflicts at the move shown, resolved where they stand. */
function Conflicts() {
  const path = at.value;
  const here = conflictsHere.value.filter((x) => samePath(x.path, path));
  if (!here.length) return null;
  return (
    <section class="node-panel" aria-label="Conflicts at this move">
      {here.map((x, i) => (
        <ConflictBox key={`${x.index}-${x.starting}-${i}`} conflict={x} />
      ))}
    </section>
  );
}

function ConflictBox(props: { conflict: OpenConflict }) {
  const x = props.conflict;
  if (isKeptMarker(x.comment)) {
    return (
      <div class="conflict-box" role="group" aria-label="Conflict">
        <p>
          <strong>Kept after a delete.</strong> {x.comment.replace(/^<{7} kept: /, '')}: the other device edited inside this line.
        </p>
        <div class="actions">
          <button type="button" onClick={() => resolve(x, { kind: 'keep' })}>
            Keep the line
          </button>
          <button type="button" onClick={() => resolve(x, { kind: 'delete' })}>
            Delete it
          </button>
        </div>
      </div>
    );
  }
  const sides = parseTextConflict(x.comment);
  return <TextConflict conflict={x} ours={sides?.ours} theirs={sides?.theirs} labels={sides ? [sides.oursLabel, sides.theirsLabel] : undefined} />;
}

function TextConflict(props: { conflict: OpenConflict; ours: string | undefined; theirs: string | undefined; labels: [string, string] | undefined }) {
  const [text, setText] = useState(props.conflict.comment);
  return (
    <div class="conflict-box" role="group" aria-label="Conflict">
      <p>
        <strong>Two versions of this comment.</strong>
      </p>
      {props.labels && (
        <>
          <p class="side">
            <span class="muted">{props.labels[0]}:</span> {props.ours}
          </p>
          <p class="side">
            <span class="muted">{props.labels[1]}:</span> {props.theirs}
          </p>
          <div class="actions">
            <button type="button" onClick={() => resolve(props.conflict, { kind: 'ours' })}>
              Keep {props.labels[0]}
            </button>
            <button type="button" onClick={() => resolve(props.conflict, { kind: 'theirs' })}>
              Keep {props.labels[1]}
            </button>
            <button type="button" onClick={() => resolve(props.conflict, { kind: 'both' })}>
              Keep both
            </button>
          </div>
        </>
      )}
      <label>
        Or write it yourself
        <textarea rows={4} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      </label>
      <button type="button" onClick={() => resolve(props.conflict, { kind: 'text', text })}>
        Use this text
      </button>
    </div>
  );
}

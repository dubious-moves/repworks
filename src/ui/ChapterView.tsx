// The chapter view (PLAN.md §4.11, D21), laid out as Qchess's study page: on a wide screen the
// chapters on the left, the board, and a panel with the notation, the tools for the move shown
// (glyphs, comment, conflicts, line actions, the chapter and study drawer) and the move buttons.
// On the phone: the board, the move buttons, the notation, then the tools. Play a move to extend
// a line or branch from it.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import { parseSquare } from 'chessops/util';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import type { Key } from '@lichess-org/chessground/types';
import type { Role } from 'chessops/types';
import {
  addChapter,
  at,
  chapter,
  conflictsHere,
  currentLinePgn,
  deleteOpenChapter,
  doc,
  edit,
  feedback,
  move,
  moveOpenChapter,
  play,
  problem,
  redoEdit,
  renameOpenChapter,
  renameOpenStudy,
  resolve,
  setSide,
  setStudyKind,
  side,
  study,
  undoEdit,
} from '../app/editor.ts';
import { open } from '../app/mode.ts';
import { isKeptMarker, parseTextConflict, type OpenConflict } from '../core/merge/markers.ts';
import { LICHESS_COMMENT_LIMIT, sanitizeComment } from '../core/pgn/comment.ts';
import { GLYPHS, MOVE_GLYPHS, POSITION_GLYPHS } from '../core/pgn/nags.ts';
import { header, type Brush, type Chapter } from '../core/study/model.ts';
import { deletePath, makeMainline, ownComment, promote, setComment, setShapes, toggleGlyph } from '../core/study/ops.ts';
import { nodeAt, positionAt, samePath, type Path } from '../core/study/tree.ts';
import { Board } from './Board.tsx';
import { Notation } from './Notation.tsx';

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
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => move('prev'),
        ArrowRight: () => move('next'),
        ArrowUp: () => move('up'),
        ArrowDown: () => move('down'),
        Home: () => move('start'),
        End: () => move('end'),
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

  const board = useMemo(() => (c ? boardState(c, path) : undefined), [c, path]);

  // Another chapter opens at the board, wherever the page was scrolled.
  useEffect(() => scrollTo({ top: 0 }), [s?.sid, s?.cid]);

  if (!s) return <p class="muted">{problem.value ?? 'Opening…'}</p>;
  const node = c ? nodeAt(c, path) : undefined;

  const onMove = (orig: Key, dest: Key) => {
    if (!board) return;
    const from = parseSquare(orig)!;
    const to = parseSquare(dest)!;
    const piece = board.pos.board.get(from);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    const m = normalizeMove(board.pos, { from, to });
    play(makeSan(board.pos, m));
  };
  const promote_ = (role: Role) => {
    if (!board || !promotion) return;
    play(makeSan(board.pos, { from: parseSquare(promotion.orig)!, to: parseSquare(promotion.dest)!, promotion: role }));
    setPromotion(undefined);
  };

  return (
    <div class="chapter-view">
      <div class="chapter-head">
        <a href="#/" class="back" onClick={(e) => (e.preventDefault(), open({ name: 'list' }))}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">{s.meta.name}</span>
          <select aria-label="Chapter" value={s.cid} onChange={(e) => open({ name: 'chapter', sid: s.sid, cid: e.currentTarget.value })}>
            {s.chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {problem.value && (
        <p class="warn" role="alert">
          {problem.value}
        </p>
      )}
      {c && board && (
        <div class="cv-frame">
          <div class="cv-grid">
            <nav class="cv-chapters" aria-label="Chapters">
              <div class="cv-study">{s.meta.name}</div>
              <ol>
                {s.chapters.map((ch) => (
                  <li key={ch.id}>
                    <a
                      href={`#/study/${s.sid}/${ch.id}`}
                      aria-current={ch.id === s.cid ? 'page' : undefined}
                      onClick={(e) => (e.preventDefault(), open({ name: 'chapter', sid: s.sid, cid: ch.id }))}
                    >
                      {ch.name}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div class="cv-board">
              <Board
                fen={board.fen}
                orientation={side.value}
                turn={board.pos.turn}
                dests={doc.value ? board.dests : new Map()}
                lastMove={board.lastMove}
                check={board.check}
                shapes={node?.shapes ?? []}
                drawMode={drawMode}
                brush={brush}
                onMove={onMove}
                onShapes={(shapes) => edit((ch) => setShapes(ch, at.peek(), shapes))}
              />
              {promotion && (
                <div class="promotion" role="dialog" aria-label="Promote to">
                  {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map((r) => (
                    <button key={r} type="button" onClick={() => promote_(r)}>
                      {r}
                    </button>
                  ))}
                  <button type="button" class="secondary" onClick={() => setPromotion(undefined)}>
                    cancel
                  </button>
                </div>
              )}
              <p class="feedback" role="status">
                {feedback.value ?? ''}
              </p>
            </div>
            <div class="cv-panel">
              <Notation chapter={c} />
              <div class="cv-tools">
                {node && doc.value && <NodePanel chapter={c} path={path} />}
                <ChapterDrawer />
              </div>
              {drawMode && (
                <div class="brushes" role="radiogroup" aria-label="Colour">
                  {BRUSH_NAMES.map((b) => (
                    <button key={b} type="button" role="radio" aria-checked={brush === b} aria-label={b} class={`brush brush-${b}${brush === b ? ' on' : ''}`} onClick={() => setBrush(b)} />
                  ))}
                  <span class="muted">Drag for an arrow, tap for a circle; again to remove.</span>
                </div>
              )}
              <div class="controls">
                <button type="button" aria-label="Start" onClick={() => move('start')}>
                  ⏮
                </button>
                <button type="button" aria-label="Previous move" onClick={() => move('prev')}>
                  ◀
                </button>
                <button type="button" aria-label="Next move" onClick={() => move('next')}>
                  ▶
                </button>
                <button type="button" aria-label="End of the line" onClick={() => move('end')}>
                  ⏭
                </button>
                <button type="button" aria-label="Undo" disabled={!doc.value?.past.length} onClick={undoEdit}>
                  ↶
                </button>
                <button type="button" aria-label="Redo" disabled={!doc.value?.future.length} onClick={redoEdit}>
                  ↷
                </button>
                <button type="button" aria-pressed={drawMode} aria-label="Draw mode" class={drawMode ? 'on' : ''} onClick={() => setDrawMode(!drawMode)}>
                  ✎
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {!(c && board) && <ChapterDrawer />}
    </div>
  );
}

function NodePanel(props: { chapter: Chapter; path: Path }) {
  const node = nodeAt(props.chapter, props.path)!;
  const conflicts = conflictsHere.value.filter((x) => samePath(x.path, props.path));
  const isMove = props.path.length > 0;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(currentLinePgn());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section class="node-panel" aria-label="This move">
      {conflicts.map((x, i) => (
        <ConflictBox key={`${x.index}-${x.starting}-${i}`} conflict={x} />
      ))}
      {isMove && (
        <div class="glyphs" role="group" aria-label="Glyphs">
          {[...MOVE_GLYPHS, ...POSITION_GLYPHS, 146].map((nag) => (
            <button
              key={nag}
              type="button"
              title={GLYPHS[nag]!.name}
              aria-label={GLYPHS[nag]!.name}
              aria-pressed={node.nags.includes(nag)}
              class={node.nags.includes(nag) ? 'on' : ''}
              onClick={() => edit((c) => toggleGlyph(c, props.path, nag))}
            >
              {GLYPHS[nag]!.symbol}
            </button>
          ))}
        </div>
      )}
      <CommentBox key={props.path.join(' ')} chapter={props.chapter} path={props.path} />
      {isMove && (
        <div class="actions">
          <button type="button" onClick={() => edit((c) => deletePath(c, props.path), props.path.slice(0, -1))}>
            Delete from here
          </button>
          <button type="button" onClick={() => edit((c) => promote(c, props.path))}>
            Promote
          </button>
          <button type="button" onClick={() => edit((c) => makeMainline(c, props.path))}>
            Make main line
          </button>
          <button type="button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy line as PGN'}
          </button>
        </div>
      )}
    </section>
  );
}

function CommentBox(props: { chapter: Chapter; path: Path }) {
  const node = nodeAt(props.chapter, props.path)!;
  const own = ownComment(node);
  const editable = own === undefined || !own.includes('<<<<<<<');
  const [draft, setDraft] = useState(editable ? (own ?? '') : '');
  const checked = sanitizeComment(draft);
  const save = () => {
    if (!editable || checked.text === (own ?? '')) return;
    edit((c) => setComment(c, props.path, draft));
  };
  if (!editable) return null;
  return (
    <label class="comment-box">
      {props.path.length ? 'Comment on this move' : 'Comment before the first move'}
      <textarea name="comment" rows={3} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} onBlur={save} />
      {checked.tooLong && <span class="warn">Over {LICHESS_COMMENT_LIMIT.toLocaleString('en')} characters: Lichess would cut it.</span>}
      <button type="button" disabled={checked.text === (own ?? '')} onClick={save}>
        Save comment
      </button>
    </label>
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

function ChapterDrawer() {
  const s = study.value!;
  const c = chapter.value;
  const [chapterName, setChapterName] = useState(c ? (header(c, 'ChapterName') ?? '') : '');
  const [newName, setNewName] = useState('');
  const [newSide, setNewSide] = useState<'white' | 'black'>(side.value);
  const [studyName, setStudyName] = useState(s.meta.name);
  useEffect(() => setChapterName(c ? (header(c, 'ChapterName') ?? '') : ''), [s.cid, c && header(c, 'ChapterName')]);
  useEffect(() => setStudyName(s.meta.name), [s.meta.name]);
  return (
    <details class="card drawer form">
      <summary>Chapter and study</summary>
      {c && doc.value && (
        <>
          <fieldset class="choice">
            <legend>This chapter is for</legend>
            <label>
              <input type="radio" name="side" checked={side.value === 'white'} onChange={() => setSide('white')} /> White
            </label>
            <label>
              <input type="radio" name="side" checked={side.value === 'black'} onChange={() => setSide('black')} /> Black
            </label>
          </fieldset>
          <label>
            Chapter name
            <input name="chapter-name" value={chapterName} onInput={(e) => setChapterName(e.currentTarget.value)} />
          </label>
          <div class="actions">
            <button type="button" onClick={() => renameOpenChapter(chapterName)}>
              Rename chapter
            </button>
            <button type="button" onClick={() => void moveOpenChapter(-1)}>
              Move up
            </button>
            <button type="button" onClick={() => void moveOpenChapter(1)}>
              Move down
            </button>
            <button type="button" onClick={() => confirm(`Delete the chapter “${chapterName}”?`) && void deleteOpenChapter()}>
              Delete chapter
            </button>
          </div>
        </>
      )}
      <h3>New chapter</h3>
      <label>
        Name
        <input name="new-chapter" value={newName} onInput={(e) => setNewName(e.currentTarget.value)} />
      </label>
      <fieldset class="choice">
        <legend>For</legend>
        <label>
          <input type="radio" name="new-side" checked={newSide === 'white'} onChange={() => setNewSide('white')} /> White
        </label>
        <label>
          <input type="radio" name="new-side" checked={newSide === 'black'} onChange={() => setNewSide('black')} /> Black
        </label>
      </fieldset>
      <button type="button" onClick={() => void addChapter(newName, newSide).then(() => setNewName(''))}>
        Add chapter
      </button>
      <h3>Study</h3>
      <label>
        Study name
        <input name="study-name" value={studyName} onInput={(e) => setStudyName(e.currentTarget.value)} />
      </label>
      <div class="actions">
        <button type="button" onClick={() => void renameOpenStudy(studyName)}>
          Rename study
        </button>
      </div>
      <fieldset class="choice">
        <legend>Kind</legend>
        <label>
          <input type="radio" name="kind" checked={s.meta.kind === 'repertoire'} onChange={() => void setStudyKind('repertoire')} /> Repertoire
        </label>
        <label>
          <input type="radio" name="kind" checked={s.meta.kind === 'reference'} onChange={() => void setStudyKind('reference')} /> Reference
        </label>
      </fieldset>
    </details>
  );
}

// The Read view (PLAN.md §5.10), after Qchess's: a chapter's line through a move, to the end of
// the main line below it, stepped through with ← and →. The board with the study's arrows, the
// move and its comments in large text; no editing. "Quiz from here" opens the Interactive view
// at the move shown; Escape or "Edit" goes back to the chapter at it.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { chessgroundMove } from 'chessops/compat';
import type { Key } from '@lichess-org/chessground/types';
import { open } from '../app/mode.ts';
import { commentId, endPreview, enterCommentLines, preview, stepPreview } from '../app/preview.ts';
import { localStore } from '../app/state.ts';
import { dataVersion } from '../app/sync.ts';
import { chapterPath } from '../core/data/layout.ts';
import { glyphSymbol } from '../core/pgn/nags.ts';
import { parseChapterFile } from '../core/pgn/parse.ts';
import { header, type Chapter } from '../core/study/model.ts';
import { lineThrough, nodeAt, positionAt, startPosition } from '../core/study/tree.ts';
import { pathKey } from '../core/study/notation.ts';
import { Board } from './Board.tsx';
import { CommentText, endPreviewOnBoard, PreviewBar, previewBoard } from './CommentText.tsx';

type Loaded = { chapter: Chapter; line: string[] } | { problem: string };

/** Each move of a line as written in a book: `1. e4`, `1... c5`, from the chapter's start. */
function labels(chapter: Chapter, line: readonly string[]): string[] {
  const start = startPosition(chapter);
  if (!start) return [...line];
  let n = start.fullmoves;
  let turn = start.turn;
  return line.map((san) => {
    const label = turn === 'white' ? `${n}. ${san}` : `${n}... ${san}`;
    if (turn === 'black') n++;
    turn = turn === 'white' ? 'black' : 'white';
    return label;
  });
}

export function ReadView(props: { sid: string; cid: string; at: string[]; from?: number }) {
  const { sid, cid } = props;
  const atKey = props.at.join(',');
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [ply, setPly] = useState(props.from ?? props.at.length);
  const version = dataVersion.value;

  useEffect(() => setPly(props.from ?? props.at.length), [sid, cid, atKey, props.from]);
  useEffect(() => {
    let live = true;
    const store = localStore();
    if (!store) return;
    const path = chapterPath(sid, cid);
    void store.read((p) => p === path).then((files) => {
      if (!live) return;
      const text = files.get(path);
      if (text === undefined) return setLoaded({ problem: 'That chapter isn’t on this device.' });
      const parsed = parseChapterFile(text, cid);
      if (!parsed.ok) return setLoaded({ problem: `This chapter can't be read: ${parsed.reason}.` });
      const line = lineThrough(parsed.chapter, props.at);
      if (!line) return setLoaded({ problem: 'That move isn’t in the chapter any more.' });
      setLoaded({ chapter: parsed.chapter, line });
    });
    return () => void (live = false);
  }, [sid, cid, atKey, version]);

  const ok = loaded && 'chapter' in loaded ? loaded : undefined;
  const last = ok ? ok.line.length : 0;
  const shown = Math.min(ply, last);
  const path = ok ? ok.line.slice(0, shown) : [];
  const toChapter = () => open({ name: 'chapter', sid, cid, at: path });

  // The keys read the latest step through a ref: an effect re-registered after each render would
  // let a quick Escape leave at the move before.
  // Line jumping (§5.12): → on the line's last move enters the first line of its comments.
  const jump = () => {
    const node = ok && nodeAt(ok.chapter, path);
    return !!node && enterCommentLines('read', pathKey(path), [...node.startingComments, ...node.comments], positionAt(ok.chapter, path), path.length ? positionAt(ok.chapter, path.slice(0, -1)) : undefined);
  };
  const latest = useRef({ last, toChapter, jump, shown });
  latest.current = { last, toChapter, jump, shown };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const { last: end, toChapter: leave, jump: enter, shown: at } = latest.current;
      // A line from a comment on the board takes ← → and Escape first.
      const previewing = preview.peek()?.owner === 'read';
      const keys: Record<string, () => void> = previewing
        ? { ArrowLeft: () => stepPreview(-1), ArrowRight: () => stepPreview(1), Escape: endPreview }
        : {
            ArrowLeft: () => setPly((p) => Math.max(0, Math.min(p, end) - 1)),
            ArrowRight: () => void (at === end ? enter() : setPly((p) => Math.min(end, p + 1))),
            Home: () => setPly(0),
            End: () => setPly(end),
            Escape: leave,
          };
      const run = keys[e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const board = useMemo(() => {
    if (!ok) return undefined;
    const pos = positionAt(ok.chapter, path);
    if (!pos) return undefined;
    let lastMove: [Key, Key] | undefined;
    if (path.length) {
      const before = positionAt(ok.chapter, path.slice(0, -1))!;
      const m = parseSan(before, path[path.length - 1]!);
      if (m) lastMove = chessgroundMove(m) as [Key, Key];
    }
    return { pos, fen: makeFen(pos.toSetup()), lastMove };
  }, [ok, shown]);
  const names = useMemo(() => (ok ? labels(ok.chapter, ok.line) : []), [ok]);

  if (!loaded) return <p class="muted">Opening…</p>;
  if (!ok) return <p class="warn">{'problem' in loaded ? loaded.problem : ''}</p>;
  const node = nodeAt(ok.chapter, path);
  const comments = node ? [...node.startingComments, ...node.comments] : [];
  const glyphs = node && path.length ? node.nags.map(glyphSymbol).join('') : '';
  const side = header(ok.chapter, 'Orientation') === 'black' ? 'black' : 'white';
  const shownLine = previewBoard('read');
  const go = (n: number) => {
    endPreview();
    setPly(n);
  };
  const positions = () => ({ after: positionAt(ok.chapter, path)!, before: path.length ? positionAt(ok.chapter, path.slice(0, -1)) : undefined });

  return (
    <div class="train read">
      <div class="chapter-head">
        <a href="#/" class="back" aria-label="Back to the chapter" onClick={(e) => (e.preventDefault(), toChapter())}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">Read · {header(ok.chapter, 'ChapterName') ?? cid}</span>
        </div>
      </div>
      <div class="train-grid">
        <div class="train-board" onPointerDown={shownLine ? endPreviewOnBoard : undefined}>
          {board && (
            <Board
              fen={shownLine?.fen ?? board.fen}
              orientation={side}
              turn={shownLine?.turn ?? board.pos.turn}
              dests={new Map()}
              lastMove={shownLine ? shownLine.lastMove : board.lastMove}
              check={shownLine?.check ?? board.pos.isCheck()}
              shapes={shownLine ? [] : (node?.shapes ?? [])}
              drawMode={false}
              brush="green"
              onMove={() => undefined}
             
            />
          )}
          <PreviewBar owner="read" />
          <div class="controls read-controls">
            <button type="button" aria-label="Start" disabled={shown === 0} onClick={() => go(0)}>
              ⏮
            </button>
            <button type="button" aria-label="Previous move" disabled={shown === 0} onClick={() => go(shown - 1)}>
              ◀
            </button>
            <button type="button" aria-label="Next move" disabled={shown === last} onClick={() => go(shown + 1)}>
              ▶
            </button>
            <button type="button" aria-label="End of the line" disabled={shown === last} onClick={() => go(last)}>
              ⏭
            </button>
          </div>
        </div>
        <div class="train-panel">
          <p class="read-move" aria-live="polite">
            {shown === 0 ? 'Start' : names[shown - 1]}
            {glyphs && <span class="glyphs">{glyphs}</span>}
            <span class="muted read-count">
              {' '}
              {shown} / {last}
            </span>
          </p>
          <div class="read-comments" aria-label="Comments">
            {comments.length ? (
              comments.map((c, i) => (
                <p key={i}>
                  <CommentText text={c} owner="read" id={commentId(pathKey(path), c)} positions={positions} />
                </p>
              ))
            ) : (
              <p class="muted">No comment.</p>
            )}
          </div>
          <p class="read-line" aria-label="The line">
            {names.map((name, i) => (
              <span key={i}>
                <button type="button" class={`read-step${i + 1 === shown ? ' current' : ''}`} aria-current={i + 1 === shown ? 'true' : undefined} onClick={() => go(i + 1)}>
                  {/* A Black move after a White one goes without its number, as in a book. */}
                  {name.includes('...') && i > 0 ? ok.line[i] : name}
                </button>{' '}
              </span>
            ))}
          </p>
          <div class="actions">
            <button type="button" onClick={() => open({ name: 'play', sid, cid, at: props.at, from: shown })}>
              Quiz from here
            </button>
            <button type="button" class="secondary" onClick={toChapter}>
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The training screen (PLAN.md §5.7): the board first; under it the feedback line, the line's
// name and the comments of the move reached; one primary action per state, and the day's
// counters. The screen stays on while a session runs (Screen Wake Lock).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { normalizeMove, type Position } from 'chessops/chess';
import { makeUci, parseSquare, parseUci } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import type { Role, SquareName } from 'chessops/types';
import { open } from '../app/mode.ts';
import { commentId, endPreview, preview, stepPreview } from '../app/preview.ts';
import { beginTraining } from '../app/state.ts';
import { dataVersion } from '../app/sync.ts';
import { command, endSession, isGraded, leaveForStudy, pace, PACES, pinMissed, playMove, press, queueOf, session, sessionProblem, setPace, setSelfGrade, setSpeech, speech, trainData, undoSuspend, type Pace, type SessionKind, type SessionView, type TrainData } from '../app/train.ts';
import type { Mode } from '../core/app/fsm.ts';
import { pressOf } from '../core/train/showGrade.ts';
import { holdMediaKeys } from '../platform/mediaKeys.ts';
import { canSpeak } from '../platform/speech.ts';
import type { Note } from '../core/train/trainer.ts';
import { header } from '../core/study/model.ts';
import { nodeAt, positionAt, startPosition } from '../core/study/tree.ts';
import { Board } from './Board.tsx';
import { ModeSwitch } from './ModeSwitch.tsx';
import { CommentText, endPreviewOnBoard, PreviewBar, previewBoard } from './CommentText.tsx';
import { firstNewLine, LineList, nextLine } from './LineList.tsx';
import { openTrainSettings } from './TrainSettings.tsx';

const ASKING = new Set(['ask', 'teach', 'wrong', 'shown']);

export function noteText(note: Note | undefined): string {
  if (!note) return '';
  switch (note.kind) {
    case 'yourMove':
      return 'Your move';
    case 'correct':
      return 'Correct';
    case 'played':
      return 'That’s the move: it comes back soon';
    case 'wrong':
      return 'Not in your repertoire: try again';
    case 'shown':
      return `Play ${note.san}`;
    case 'newMove':
      return `New move: play ${note.san}`;
    case 'taught':
      return `New move learned: ${note.san}`;
    case 'alsoPlays':
      return 'Also in your repertoire. It has another move here too: find it';
    case 'suspended':
      return `${note.san} will always be played for you`;
  }
}

/** The moves so far, numbered from the chapter's start (`1. e4 c5 2. Nf3`). */
export function numbered(start: Position, path: readonly string[]): string {
  let n = start.fullmoves;
  let turn = start.turn;
  const out: string[] = [];
  path.forEach((san, i) => {
    if (turn === 'white') out.push(`${n}. ${san}`);
    else out.push(i === 0 ? `${n}... ${san}` : san);
    if (turn === 'black') n++;
    turn = turn === 'white' ? 'black' : 'white';
  });
  return out.join(' ');
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let stopped = false;
    const take = () => {
      if (document.visibilityState !== 'visible' || lock) return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (stopped) return void l.release();
          lock = l;
          l.addEventListener('release', () => (lock = undefined));
        },
        () => undefined,
      );
    };
    take();
    // The browser releases the lock when the page is hidden; it is taken again on return.
    document.addEventListener('visibilitychange', take);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [active]);
}

const TITLES = { retry: 'Retry mistakes', drill: 'Drill mistakes', pinned: 'Drill pinned', show: 'Show and grade' } as const;

export function TrainScreen(props: { of: SessionKind }) {
  const key = JSON.stringify(props.of);
  useEffect(() => {
    void beginTraining(props.of);
    return endSession;
  }, [key]);
  const s = session.value;
  const running = !!s && !s.done;
  // The session's end, or another session, ends a preview of a comment's line.
  useEffect(() => endPreview, [key, running]);
  useWakeLock(running);
  // Nothing to train yet, and new data arrives (a sync just after setup): look again.
  const version = dataVersion.value;
  const empty = !!s?.done && s.plan.lines.length === 0;
  useEffect(() => {
    if (empty) void beginTraining(props.of);
  }, [version]);

  const showing = running && s.selfGrade;
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never swallowed in a text field, and a held key is one press.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // A line from a comment on the board takes ← → and Escape first (§5.12).
      if (preview.peek()?.owner === 'train' && (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        return e.key === 'Escape' ? endPreview() : stepPreview(e.key === 'ArrowLeft' ? -1 : 1);
      }
      if (e.key === 'Escape') command('stop');
      else if (showing && !e.repeat && pressOf(e.key)) press(pressOf(e.key)!);
      // "1" switches a session to show and grade, as in Chessable (§5.16).
      else if (!showing && !e.repeat && e.key === '1') setSelfGrade(true);
      else if (!showing && e.key === ' ' && !(target && target.tagName === 'BUTTON')) command('hint');
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [running, showing]);

  // The ring's buttons, when they arrive as media keys rather than key events (§5.9).
  useEffect(() => {
    if (!showing) return;
    const keys = holdMediaKeys({ onNext: () => press('next'), onPrevious: () => press('wrong') });
    return () => keys.stop();
  }, [showing]);

  if (sessionProblem.value) return <p class="warn">{sessionProblem.value}</p>;
  if (!s) return <p class="muted">Reading the repertoire…</p>;
  const of = s.of;
  const chapterName = (sid: string, cid: string) => {
    const c = s.data.chapters.get(`${sid}/${cid}`);
    return c ? (header(c, 'ChapterName') ?? cid) : cid;
  };
  const title =
    of.kind === 'queue'
      ? `Training · ${s.scope ? (s.data.studyNames.get(s.scope) ?? s.scope) : 'Whole repertoire'}`
      : of.kind === 'line'
        ? `Line · ${chapterName(of.sid, of.cid)}`
        : of.kind === 'learn'
          ? `Learn · ${chapterName(of.sid, of.cid)}`
      : of.kind === 'play'
        ? `Play · ${s.chapter ? (header(s.chapter, 'ChapterName') ?? of.cid) : of.cid}`
        : of.kind === 'pinned' && of.all
          ? 'Drill all pins'
          : TITLES[of.kind];
  // The Interactive view goes back to its chapter, at the move on the board.
  const back = () => (of.kind === 'play' ? open({ name: 'chapter', sid: of.sid, cid: of.cid, at: s.path.length ? s.path : of.at }) : open({ name: 'list' }));
  // Qchess's switch: the line on the board, in its study, editable; "Train" there takes this up again.
  // With no line on the board, the study the screen is about (§5.16).
  const toStudy = () => {
    const there = leaveForStudy() ?? studyOf(s);
    if (there) open(there);
  };
  const data = trainData.value ?? s.data;
  const listed = of.kind === 'queue' || of.kind === 'show' || of.kind === 'line' || of.kind === 'learn';
  return (
    <div class="train">
      <div class="chapter-head">
        <a href="#/" class="back" onClick={(e) => (e.preventDefault(), back())}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">{title}</span>
        </div>
        <button type="button" class="icon" aria-label="Training settings" title="Training settings" onClick={openTrainSettings}>
          ⚙
        </button>
        <ModeSwitch current="train" {...(s.line || studyOf(s) ? { onStudy: toStudy } : {})} />
      </div>
      <div class={`train-body${listed ? ' with-list' : ''}`}>
        {listed && <Lines s={s} data={data} />}
        <div class="train-main">{s.done ? <Done s={s} /> : <Session s={s} />}</div>
      </div>
    </div>
  );
}

function Done(props: { s: SessionView }) {
  const { done, plan, of } = props.s;
  if (!done) return null;
  if (of.kind === 'play') {
    return (
      <section class="card train-done" aria-label="Session done">
        <h2>Line played</h2>
        <p>
          {props.s.answers} move{props.s.answers === 1 ? '' : 's'}, {props.s.right} right first time. Nothing recorded: training keeps its schedule.
        </p>
        <div class="actions">
          <button type="button" onClick={() => void beginTraining(of)}>
            Play again
          </button>
          <button type="button" class="secondary" onClick={() => open({ name: 'read', sid: of.sid, cid: of.cid, at: of.at, ...(of.from === undefined ? {} : { from: of.from }) })}>
            Read the line
          </button>
          <button type="button" class="secondary" onClick={() => open({ name: 'chapter', sid: of.sid, cid: of.cid, at: props.s.path.length ? props.s.path : of.at })}>
            Back to the chapter
          </button>
        </div>
      </section>
    );
  }
  // Show and grade records its grades; retry, drill and the pins never do.
  const practice = !isGraded(of);
  if (!practice && plan.lines.length === 0) return <NothingToTrain s={props.s} />;
  const after = of.kind === 'line' ? nextLine(trainData.value ?? props.s.data, props.s.scope, { sid: of.sid, cid: of.cid, path: of.at }) : undefined;
  return (
    <section class="card train-done" aria-label="Session done">
      <h2>{plan.lines.length === 0 ? 'Nothing to practise now' : of.kind === 'line' ? 'Line done' : 'Session done'}</h2>
      {practice && plan.lines.length > 0 && (
        <p>
          {props.s.answers} move{props.s.answers === 1 ? '' : 's'}, {props.s.right} right first time. Nothing graded: these moves keep their schedule.
        </p>
      )}
      {!practice && plan.lines.length > 0 && (
        <p>
          {done.lines} line{done.lines === 1 ? '' : 's'} · {done.reviews} move{done.reviews === 1 ? '' : 's'} reviewed, {done.good} right first time · {done.taught} new
          {done.suspended > 0 && <> · {done.suspended} always played for you</>}
        </p>
      )}
      <div class="actions">
        {after && (
          <button type="button" onClick={() => open({ name: 'train', sid: after.line.sid, cid: after.line.cid, at: [...after.line.path] })}>
            Next line
          </button>
        )}
        <button type="button" class={after ? 'secondary' : undefined} onClick={() => void beginTraining(of)}>
          {practice || of.kind === 'line' ? 'Again' : 'Train again'}
        </button>
        {(of.kind === 'line' || of.kind === 'learn') && (
          <button type="button" class="secondary" onClick={() => open({ name: 'train', sid: of.sid })}>
            Today's queue
          </button>
        )}
        {!practice && (
          <button type="button" class="secondary" onClick={() => open({ name: 'mistakes' })}>
            Mistakes
          </button>
        )}
        <button type="button" class="secondary" onClick={() => open({ name: 'list' })}>
          Home
        </button>
      </div>
    </section>
  );
}

function Session(props: { s: SessionView }) {
  const s = props.s;
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  const show = s.selfGrade;
  const asking = ASKING.has(s.phase) && !show;
  const pos = s.position;
  const board = useMemo(() => {
    if (!pos) return undefined;
    let lastMove: [Key, Key] | undefined;
    if (s.chapter && s.path.length) {
      const start = startPosition(s.chapter);
      if (start) {
        for (const san of s.path.slice(0, -1)) start.play(parseSan(start, san)!);
        const m = parseSan(start, s.path[s.path.length - 1]!);
        if (m) lastMove = chessgroundMove(m) as [Key, Key];
      }
    }
    return { fen: makeFen(pos.toSetup()), dests: chessgroundDests(pos) as Map<Key, Key[]>, lastMove, check: pos.isCheck() };
    // The tick sets the board again after a takeback, to the same position.
  }, [pos, s.tick]);

  const onMove = (orig: Key, dest: Key) => {
    if (!pos) return;
    const piece = pos.board.get(parseSquare(orig)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    playMove(makeUci(normalizeMove(pos, { from: parseSquare(orig)!, to: parseSquare(dest)! })));
  };
  const promote = (role: Role) => {
    if (!promotion) return;
    playMove(makeUci({ from: parseSquare(promotion.orig)!, to: parseSquare(promotion.dest)!, promotion: role }));
    setPromotion(undefined);
  };

  const shownLine = previewBoard('train');
  const arrow = s.arrow && !shownLine ? parseUci(s.arrow) : undefined;
  const sq = (n: number) => `${'abcdefgh'[n & 7]}${(n >> 3) + 1}` as SquareName;
  const shapes = arrow && 'from' in arrow ? [{ brush: 'green' as const, orig: sq(arrow.from), dest: sq(arrow.to) }] : [];
  const node = s.chapter ? nodeAt(s.chapter, s.path) : undefined;
  // Comments of the move reached, except while a move is asked: they could give it away.
  const comments = !asking || s.phase === 'teach' ? (node?.comments ?? []) : [];
  const start = s.chapter ? startPosition(s.chapter) : undefined;
  const moves = start ? numbered(start, s.path) : s.path.join(' ');
  const chapterName = s.chapter ? (header(s.chapter, 'ChapterName') ?? s.chapter.id) : '';
  const commentPositions = () => {
    const after = s.chapter && positionAt(s.chapter, s.path);
    return after ? { after, before: s.path.length ? positionAt(s.chapter!, s.path.slice(0, -1)) : undefined } : undefined;
  };

  return (
    <div class="train-grid">
      <div class="train-board" onPointerDown={shownLine ? endPreviewOnBoard : undefined}>
        {board && (
          <Board
            fen={shownLine?.fen ?? board.fen}
            orientation={s.side}
            turn={shownLine?.turn ?? pos!.turn}
            dests={asking && !shownLine ? board.dests : new Map()}
            lastMove={shownLine ? shownLine.lastMove : board.lastMove}
            check={shownLine?.check ?? board.check}
            shapes={shapes}
            drawMode={false}
            brush="green"
            onMove={onMove}
            onShapes={() => undefined}
          />
        )}
        {promotion && (
          <div class="promotion" role="dialog" aria-label="Promote to">
            {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map((r) => (
              <button key={r} type="button" onClick={() => promote(r)}>
                {r}
              </button>
            ))}
            <button type="button" class="secondary" onClick={() => setPromotion(undefined)}>
              cancel
            </button>
          </div>
        )}
        <PreviewBar owner="train" />
        <p class={`feedback train-feedback note-${s.note?.kind ?? 'none'}`} role="status">
          {noteText(s.note)}
        </p>
      </div>
      <div class="train-panel">
        <p class="train-counters" aria-label="Left today">
          {s.of.kind === 'play' ? (
            <>
              {s.right} of {s.answers} right first time
            </>
          ) : isGraded(s.of) ? (
            <>
              <span>{s.dueLeft} due</span> · <span>{s.newLeft} new</span> · line {s.number} of {s.total}
            </>
          ) : (
            <>
              {s.number} of {s.total} · {s.right} of {s.answers} right
            </>
          )}
        </p>
        <p class="train-line">
          <strong>{chapterName}</strong> <span class="muted">{moves}</span>
        </p>
        {comments.length > 0 && (
          <div class="train-comments">
            {comments.map((c, i) => (
              <p key={i}>
                <CommentText text={c} owner="train" id={commentId(s.path.join(' '), c)} positions={commentPositions} />
              </p>
            ))}
          </div>
        )}
        <div class="actions train-actions">
          {show && (
            <>
              <button type="button" class="press press-next" onClick={() => press('next')}>
                {s.phase === 'shown' ? 'Knew it' : 'Show'} <span class="muted">(2)</span>
              </button>
              <button type="button" class="press press-wrong" onClick={() => press('wrong')}>
                Missed it <span class="muted">(4)</span>
              </button>
              {speech.value && (
                <button type="button" class="secondary" onClick={() => press('repeat')}>
                  Say again <span class="muted">(1)</span>
                </button>
              )}
            </>
          )}
          {(s.phase === 'ask' || s.phase === 'wrong') && !show && (
            <button type="button" onClick={() => command('hint')}>
              Hint
            </button>
          )}
          {s.missed && (
            <button type="button" onClick={pinMissed}>
              Pin this mistake
            </button>
          )}
          {asking && isGraded(s.of) && (
            <button type="button" class="secondary" onClick={() => command('suspend')}>
              Always play this for me
            </button>
          )}
          {s.suspended && (
            <button type="button" class="secondary" onClick={undoSuspend}>
              Undo: ask {s.suspended.san} again
            </button>
          )}
          {show ? (
            <button type="button" class="secondary" disabled={s.phase === 'shown'} onClick={() => setSelfGrade(false)} title="Back to playing the moves on the board">
              Play the moves
            </button>
          ) : (
            <button type="button" class="secondary" onClick={() => setSelfGrade(true)} title="Show each move and grade it yourself, by 2 and 4">
              Show and grade <span class="muted">(1)</span>
            </button>
          )}
          {s.of.kind !== 'play' && s.of.kind !== 'line' && (
            <button type="button" class="secondary" onClick={() => command('skipLine')}>
              Skip line
            </button>
          )}
          <button type="button" class="secondary" onClick={() => command('stop')}>
            Stop
          </button>
        </div>
        {show && canSpeak() && (
          <label class="train-speech">
            <input type="checkbox" checked={speech.value} onChange={(e) => setSpeech(e.currentTarget.checked)} /> Speak each move
          </label>
        )}
        <label class="train-pace">
          Pace{' '}
          <select value={pace.value} onChange={(e) => setPace(e.currentTarget.value as Pace)}>
            {(Object.keys(PACES) as Pace[]).map((p) => (
              <option key={p} value={p}>
                {p} ({PACES[p]} ms)
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}


/** The study a screen with no line on the board opens on "Study": its chapter, or its study. */
function studyOf(s: SessionView): Mode | undefined {
  const of = s.of;
  if (of.kind === 'line' || of.kind === 'learn' || of.kind === 'play') return { name: 'chapter', sid: of.sid, cid: of.cid };
  if (s.scope) return { name: 'chapter', sid: s.scope };
  const first = s.data.index.lines[0];
  return first ? { name: 'chapter', sid: first.sid, cid: first.cid } : undefined;
}

/** The line list beside the board (a wide screen) or under it, folded, on the phone (§5.16). */
function Lines(props: { s: SessionView; data: TrainData }) {
  const { s, data } = props;
  const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 1150px)').matches;
  const nothing = !!s.done && s.plan.lines.length === 0;
  const [shown, setShown] = useState(wide || nothing);
  useEffect(() => {
    if (nothing) setShown(true);
  }, [nothing]);
  const active = s.line ? { sid: s.line.sid, cid: s.line.cid, path: s.line.path } : undefined;
  return (
    <aside class={`train-list${shown ? ' shown' : ''}`} aria-label="Lines to train">
      <button type="button" class="train-list-head" aria-expanded={shown} onClick={() => setShown(!shown)}>
        <span>{s.scope ? (data.studyNames.get(s.scope) ?? s.scope) : 'All lines'}</span>
        <span class="muted">{shown ? 'Hide' : 'Show'} lines</span>
      </button>
      {shown && <LineList data={data} {...(s.scope === undefined ? {} : { scope: s.scope })} {...(active ? { active } : {})} />}
    </aside>
  );
}

/** Nothing due and no room for new moves: say why, and what can still be done (§5.16). */
function NothingToTrain(props: { s: SessionView }) {
  const s = props.s;
  const data = trainData.value ?? s.data;
  const queue = queueOf(data, Date.now(), s.scope);
  const next = firstNewLine(data, s.scope);
  const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <section class="card train-done" aria-label="Session done">
      <h2>Nothing to train now</h2>
      <p>
        No moves are due
        {queue.later.length > 0 && (
          <>
            {' '}
            until {clock(queue.later[0]!.due)} ({queue.later.length} then)
          </>
        )}
        .
        {next && queue.room === 0 && (
          <>
            {' '}
            Today's {data.settings.newPerDay} new moves are learned ({queue.taughtToday} taught today).
          </>
        )}{' '}
        Any line can still be trained from the list: due moves are graded, new ones taught, and the rest asked without changing their schedule.
      </p>
      <div class="actions">
        {next && (
          <button type="button" onClick={() => open({ name: 'train', sid: next.line.sid, cid: next.line.cid, at: [...next.line.path] })}>
            Learn the next line
          </button>
        )}
        <button type="button" class="secondary" onClick={openTrainSettings}>
          Daily limit…
        </button>
        <button type="button" class="secondary" onClick={() => open({ name: 'mistakes' })}>
          Mistakes
        </button>
        <button type="button" class="secondary" onClick={() => open({ name: 'list' })}>
          Home
        </button>
      </div>
    </section>
  );
}

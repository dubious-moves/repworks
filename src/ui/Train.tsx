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
import { beginTraining } from '../app/state.ts';
import { command, endSession, pace, PACES, playMove, session, sessionProblem, setPace, undoSuspend, type Pace, type SessionView } from '../app/train.ts';
import type { Note } from '../core/train/trainer.ts';
import { header } from '../core/study/model.ts';
import { nodeAt, startPosition } from '../core/study/tree.ts';
import { Board } from './Board.tsx';

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
function numbered(start: Position, path: readonly string[]): string {
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

export function TrainScreen(props: { sid?: string }) {
  useEffect(() => {
    void beginTraining(props.sid);
    return endSession;
  }, [props.sid]);
  const s = session.value;
  const running = !!s && !s.done;
  useWakeLock(running);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) && e.key === ' ') return;
      if (e.key === ' ') command('hint');
      else if (e.key === 'Escape') command('stop');
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [running]);

  if (sessionProblem.value) return <p class="warn">{sessionProblem.value}</p>;
  if (!s) return <p class="muted">Reading the repertoire…</p>;
  const scopeName = s.scope ? (s.data.studyNames.get(s.scope) ?? s.scope) : 'Whole repertoire';
  return (
    <div class="train">
      <div class="chapter-head">
        <a href="#/" class="back" onClick={(e) => (e.preventDefault(), open({ name: 'list' }))}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">Training · {scopeName}</span>
        </div>
      </div>
      {s.done ? <Done s={s} /> : <Session s={s} />}
    </div>
  );
}

function Done(props: { s: SessionView }) {
  const { done, plan } = props.s;
  if (!done) return null;
  return (
    <section class="card train-done" aria-label="Session done">
      <h2>{plan.lines.length === 0 ? 'Nothing to train now' : 'Session done'}</h2>
      {plan.lines.length > 0 && (
        <p>
          {done.lines} line{done.lines === 1 ? '' : 's'} · {done.reviews} move{done.reviews === 1 ? '' : 's'} reviewed, {done.good} right first time · {done.taught} new
          {done.suspended > 0 && <> · {done.suspended} always played for you</>}
        </p>
      )}
      <div class="actions">
        <button type="button" onClick={() => void beginTraining(props.s.scope)}>
          Train again
        </button>
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
  const asking = ASKING.has(s.phase);
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

  const arrow = s.arrow ? parseUci(s.arrow) : undefined;
  const sq = (n: number) => `${'abcdefgh'[n & 7]}${(n >> 3) + 1}` as SquareName;
  const shapes = arrow && 'from' in arrow ? [{ brush: 'green' as const, orig: sq(arrow.from), dest: sq(arrow.to) }] : [];
  const node = s.chapter ? nodeAt(s.chapter, s.path) : undefined;
  // Comments of the move reached, except while a move is asked: they could give it away.
  const comments = !asking || s.phase === 'teach' ? (node?.comments ?? []) : [];
  const start = s.chapter ? startPosition(s.chapter) : undefined;
  const moves = start ? numbered(start, s.path) : s.path.join(' ');
  const chapterName = s.chapter ? (header(s.chapter, 'ChapterName') ?? s.chapter.id) : '';

  return (
    <div class="train-grid">
      <div class="train-board">
        {board && (
          <Board
            fen={board.fen}
            orientation={s.side}
            turn={pos!.turn}
            dests={asking ? board.dests : new Map()}
            lastMove={board.lastMove}
            check={board.check}
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
        <p class={`feedback train-feedback note-${s.note?.kind ?? 'none'}`} role="status">
          {noteText(s.note)}
        </p>
      </div>
      <div class="train-panel">
        <p class="train-counters" aria-label="Left today">
          <span>{s.dueLeft} due</span> · <span>{s.newLeft} new</span> · line {s.number} of {s.total}
        </p>
        <p class="train-line">
          <strong>{chapterName}</strong> <span class="muted">{moves}</span>
        </p>
        {comments.length > 0 && (
          <div class="train-comments">
            {comments.map((c, i) => (
              <p key={i}>{c}</p>
            ))}
          </div>
        )}
        <div class="actions train-actions">
          {(s.phase === 'ask' || s.phase === 'wrong') && (
            <button type="button" onClick={() => command('hint')}>
              Hint
            </button>
          )}
          {asking && (
            <button type="button" class="secondary" onClick={() => command('suspend')}>
              Always play this for me
            </button>
          )}
          {s.suspended && (
            <button type="button" class="secondary" onClick={undoSuspend}>
              Undo: ask {s.suspended.san} again
            </button>
          )}
          <button type="button" class="secondary" onClick={() => command('skipLine')}>
            Skip line
          </button>
          <button type="button" class="secondary" onClick={() => command('stop')}>
            Stop
          </button>
        </div>
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


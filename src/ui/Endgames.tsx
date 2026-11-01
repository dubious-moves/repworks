// Endgames (PLAN.md §5.145): the theoretical endgames by group, each with its board, its task and
// where it stands (new, due, or solved n times running and when it comes back); and one played for
// its goal against Stockfish: a move that throws the goal away stops the game ("Kd5 lets the win
// slip") until it is taken back, the move that kept it a press away; the method, open before a
// first try and a press away after; the result and what it counted for.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { endgameStandings, startEndgame } from '../app/endgames.ts';
import { analyseFrom, entryKey, open } from '../app/mode.ts';
import { canTakeBack, leavePractice, parkPractice, playOnAfterSlip, practice, practiceHint, practiceMove, showSlipMove, stopPractice, takeBack, takeUpPractice, type PracticeGame } from '../app/practice.ts';
import { decidingNow } from '../app/time.ts';
import { endgameById, ENDGAMES, GROUPS, nextEndgame, sideOf, solvedBy, taskOf, type Endgame, type Standing } from '../core/endgames/endgames.ts';
import { positionOf } from '../core/storm/walk.ts';
import { Back } from './Back.tsx';
import { MiniBoard } from './CommentOffer.tsx';
import { MoveBoard, MoveList } from './Practice.tsx';
import { useWakeLock } from './Train.tsx';

const DAY = 86_400_000;

/** "today", "tomorrow", "in 6 days". */
function inDays(t: number, now: number): string {
  const d = Math.ceil((t - now) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

/** Where an endgame stands, in a few words. */
function standingText(s: Standing, now: number): string {
  if (s.state === 'new') return 'New';
  if (s.state === 'due') return s.streak ? 'Due' : 'Due · missed last time';
  return `Solved ${s.streak === 1 ? 'once' : `${s.streak} times running`} · back ${inDays(s.next!, now)}`;
}

/** The last tries as ✓ and ✗, oldest first. */
function Marks(props: { marks: readonly boolean[] }) {
  if (!props.marks.length) return null;
  return (
    <span class="endgame-marks" aria-label={`Last tries: ${props.marks.map((m) => (m ? 'solved' : 'missed')).join(', ')}`}>
      {props.marks.map((m, i) => (
        <span key={i} class={m ? 'solved' : 'missed'}>
          {m ? '✓' : '✗'}
        </span>
      ))}
    </span>
  );
}

export function EndgamesScreen(props: { id?: string }) {
  if (props.id) {
    const e = endgameById(props.id);
    return e ? <EndgameDrill key={e.id} endgame={e} /> : <EndgameList />;
  }
  return <EndgameList />;
}

function EndgameList() {
  const now = decidingNow();
  const standings = endgameStandings(now);
  const next = nextEndgame(standings);
  const due = ENDGAMES.filter((e) => standings.get(e.id)?.state === 'due').length;
  const fresh = ENDGAMES.filter((e) => standings.get(e.id)?.state === 'new').length;
  const soonest = Math.min(...ENDGAMES.map((e) => standings.get(e.id)?.next ?? Infinity));
  return (
    <div class="games endgames">
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Endgames</span>
        </div>
      </div>
      <section class="card endgames-intro">
        <p>
          The endgames every player needs, each played against Stockfish’s best defence. A move that throws the goal away stops the game: take it back and find a better one. A
          try counts once, whatever happens after a take-back or a hint; a solved endgame comes back after 1, 3, 7, 14, 30 and 60 days.
        </p>
        <div class="actions">
          {next ? (
            <a class="button primary" href={`#/endgames/${next.id}`} data-testid="endgame-next">
              {standings.get(next.id)?.state === 'due' ? 'Next due' : 'Next new'}: {next.title}
            </a>
          ) : (
            <span class="muted">All solved for now{Number.isFinite(soonest) ? `: the next comes back ${inDays(soonest, now)}` : ''}.</span>
          )}
          <span class="muted" data-testid="endgame-counts">
            {due} due · {fresh} new
          </span>
        </div>
      </section>
      {GROUPS.map((g) => (
        <section key={g.id} class="card endgame-group" aria-labelledby={`endgame-group-${g.id}`}>
          <h2 id={`endgame-group-${g.id}`}>{g.title}</h2>
          <ul class="endgame-list">
            {ENDGAMES.filter((e) => e.group === g.id).map((e) => (
              <EndgameItem key={e.id} endgame={e} standing={standings.get(e.id)!} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EndgameItem(props: { endgame: Endgame; standing: Standing; now: number }) {
  const e = props.endgame;
  const s = props.standing;
  const pos = useMemo(() => positionOf(e.fen), [e.fen]);
  return (
    <li class={`endgame-item state-${s.state}`} data-endgame={e.id}>
      <a class="endgame-board" href={`#/endgames/${e.id}`} aria-label={`Play ${e.title}`} tabIndex={-1}>
        {pos && <MiniBoard position={pos} orientation={sideOf(e)} />}
      </a>
      <div class="endgame-text">
        <a class="endgame-title" href={`#/endgames/${e.id}`}>
          {e.title}
        </a>
        <span class="muted">{taskOf(e)}</span>
        <span class={`endgame-standing state-${s.state}`} data-testid="endgame-standing">
          {standingText(s, props.now)} <Marks marks={s.last} />
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ one endgame, played */

const GOAL_WORD = { win: 'the win', draw: 'the draw' } as const;

function EndgameDrill(props: { endgame: Endgame }) {
  const e = props.endgame;
  // Come back to from the analysis board: the try played on where it was left.
  const [entry] = useState(entryKey);
  const [resumed] = useState(() => takeUpPractice(entry));
  const standing = endgameStandings(decidingNow()).get(e.id)!;
  const [method, setMethod] = useState(standing.state === 'new');
  useEffect(() => {
    if (!resumed || practice.peek()?.setup.endgame?.id !== e.id) startEndgame(e);
    return () => parkPractice(entry);
  }, []);
  const p = practice.value?.setup.endgame?.id === e.id ? practice.value : undefined;
  useWakeLock(!!p && p.phase !== 'over');
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = (ev.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      const q = practice.peek();
      if (!q || q.setup.kind !== 'endgame') return;
      if (ev.key === 'h') void practiceHint();
      else if (ev.key === 'Backspace' && canTakeBack(q)) takeBack();
      else return;
      ev.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="games endgame">
      <div class="chapter-head">
        <Back parent={{ name: 'endgames' }} />
        <div class="titles">
          <span class="study-title">Endgame · {e.title}</span>
        </div>
      </div>
      {p ? <EndgameGame game={p} endgame={e} method={method} onMethod={setMethod} /> : <p class="muted">Setting up…</p>}
    </div>
  );
}

function EndgameGame(props: { game: PracticeGame; endgame: Endgame; method: boolean; onMethod(on: boolean): void }) {
  const p = props.game;
  const e = props.endgame;
  const over = p.phase === 'over';
  const slip = !over ? p.slip : undefined;
  const slipped = slip ? p.moves[slip.at] : undefined;
  // Each move is judged while the game goes on: a slip found after the user played on puts the board back on it.
  const last = slipped ?? p.moves[p.moves.length - 1];
  const fen = last ? last.fen : e.fen;
  const playedPast = !!slip && slip.at < p.moves.length - 1;
  const userMoves = p.moves.filter((m) => m.isUser).length;
  const hint = p.hint?.fen === fen && p.hint.uci ? p.hint : undefined;
  const arrows = hint ? [{ orig: hint.uci!.slice(0, 2), ...(hint.level === 2 ? { dest: hint.uci!.slice(2, 4) } : {}), brush: 'blue' }] : [];
  const slippedPos = slipped && positionOf(slipped.fen);
  const stalemate = slippedPos?.isStalemate();
  // In a long mate, the fifty-move rule draws a win that takes too long: Stockfish sees it coming.
  const fiftyNear = !stalemate && e.goal === 'win' && (slippedPos?.halfmoves ?? 0) >= 70;
  const halfmoves = positionOf(fen)?.halfmoves ?? 0;
  const fiftyLeft = e.goal === 'win' && !over && halfmoves >= 60 ? Math.ceil((100 - halfmoves) / 2) : undefined;
  const feedback = over
    ? endText(p, e)
    : slip
      ? `${slipped?.san ?? 'That move'} ${e.goal === 'win' ? 'lets the win slip' : 'loses the draw'}${stalemate ? ': stalemate' : fiftyNear ? ': the fifty-move rule comes first' : ''}. Take it back and find a better move.`
      : p.ending
        ? 'Checking your moves…'
        : p.phase === 'user'
          ? hint
            ? 'Your move: the hint is on the board'
            : 'Your move'
          : 'Stockfish is thinking…';
  const solved = over && p.end && solvedBy(e.goal, p.end.result);
  const restart = () => {
    // Started again before the end: the try so far is given up (Stop counts it as missed).
    if (!over && userMoves > 0) stopPractice();
    startEndgame(e);
  };
  return (
    <div class="train-grid practice-game endgame-game" data-phase={over ? 'over' : slip ? 'slip' : p.ending ? 'ending' : p.phase} data-moves={p.moves.length} data-testid="endgame-game">
      <MoveBoard fen={fen} orientation={p.setup.color} movable={p.phase === 'user' && !slip && !p.ending} lastUci={last?.uci} arrows={arrows} onMove={(u) => void practiceMove(u)} />
      <div class="train-panel">
        <p class="train-counters">
          {taskOf(e)}
          {e.goal === 'draw' ? ` · held ${Math.min(userMoves, e.hold ?? 0)} of ${e.hold}` : userMoves ? ` · ${userMoves} move${userMoves === 1 ? '' : 's'}` : ''}
          {fiftyLeft !== undefined && <span class="endgame-fifty"> · fifty-move rule: {fiftyLeft} left</span>}
        </p>
        <p class={`feedback train-feedback${slip ? ' endgame-slip' : over ? (solved ? ' endgame-solved' : ' endgame-missed') : ''}`} role="status" data-testid="endgame-feedback">
          {feedback}
        </p>
        {playedPast && (
          <p class="muted" data-testid="endgame-slip-later">
            Found after you had played on: the board is back on that move, and Take back takes the moves after it too.
          </p>
        )}
        {over && <p class="muted" data-testid="endgame-counted">{countedText(p, e)}</p>}
        {!over && p.failed && !slip && <p class="muted">This try counts as missed: play it out, or start again.</p>}
        <MoveList moves={p.moves} baseFen={e.fen} marks={false} slipAt={slip?.at} />
        <div class="actions train-actions">
          {slip ? (
            <>
              <button type="button" class="primary" data-testid="endgame-takeback" onClick={takeBack}>
                Take back
              </button>
              {slip.uci && (
                <button type="button" class="secondary" title={`Take it back, with the move that keeps ${GOAL_WORD[e.goal]} shown`} onClick={showSlipMove}>
                  Show a move that keeps it
                </button>
              )}
              <button type="button" class="secondary" title="Play on from here: the try is missed already" onClick={playOnAfterSlip}>
                Play on
              </button>
            </>
          ) : over ? (
            <>
              <button type="button" class={solved ? 'secondary' : 'primary'} onClick={() => startEndgame(e)}>
                Again
              </button>
              <NextButton after={e.id} primary={!!solved} />
            </>
          ) : (
            <>
              <button type="button" class="secondary" title="Stockfish’s move: the piece, then the move (H). The try counts as missed." disabled={p.phase !== 'user' || hint?.level === 2} onClick={() => void practiceHint()}>
                Hint
              </button>
              {canTakeBack(p) && (
                <button type="button" class="secondary" title="Your last move taken back, with the answer: a misclick, say (Backspace)" onClick={takeBack}>
                  Take back
                </button>
              )}
              <button type="button" class="secondary" title="From the start again: a try begun counts as missed" onClick={restart}>
                Restart
              </button>
            </>
          )}
          <button type="button" class="secondary" title="The analysis board at this position; ← comes back here" onClick={() => analyseFrom({ fen: e.fen, ...(p.moves.length ? { line: p.moves.slice(0, slip ? slip.at + 1 : undefined).map((m) => m.san) } : {}), side: p.setup.color })}>
            Analyse
          </button>
        </div>
        <details class="endgame-method" open={props.method} onToggle={(ev) => props.onMethod((ev.target as HTMLDetailsElement).open)}>
          <summary>The method</summary>
          <p>{e.idea}</p>
        </details>
      </div>
    </div>
  );
}

function NextButton(props: { after: string; primary: boolean }) {
  const next = nextEndgame(endgameStandings(decidingNow()), props.after);
  if (!next)
    return (
      <a class="button secondary" href="#/endgames">
        All endgames
      </a>
    );
  return (
    <button type="button" class={props.primary ? 'primary' : 'secondary'} onClick={() => (leavePractice(), open({ name: 'endgames', id: next.id }))}>
      Next: {next.title}
    </button>
  );
}

/** The end in words: how the goal was reached, or how it was missed. */
function endText(p: PracticeGame, e: Endgame): string {
  const end = p.end!;
  const n = p.moves.filter((m) => m.isUser).length;
  switch (end.reason) {
    case 'mate':
      return `Checkmate in ${n} move${n === 1 ? '' : 's'}.`;
    case 'goal':
      return e.goal === 'draw' ? `Held for ${n} moves: the draw is safe.` : e.until === 'bare' ? 'The pawn has fallen: the rest is a queen mate.' : 'The pawn queens: the win is yours.';
    case 'stalemate':
      return e.goal === 'draw' ? 'Stalemate: the draw is yours.' : 'Stalemate: the win is gone.';
    case 'draw':
      return e.goal === 'draw' ? 'Not enough material left to mate: a draw.' : 'Not enough material left to mate: the win is gone.';
    case 'repetition':
      return e.goal === 'draw' ? 'Threefold repetition: the draw is yours.' : 'Threefold repetition: the win is gone.';
    case 'fifty':
      return e.goal === 'draw' ? 'Fifty moves without a capture or a pawn move: a draw.' : 'Fifty moves without a capture or a pawn move: the win is gone.';
    case 'mated':
      return 'Checkmated.';
    case 'stopped':
      return 'Given up.';
    case 'interrupted':
      return 'Stockfish couldn’t answer: nothing counted.';
    default:
      return 'Over.';
  }
}

/** "3.Kd2", "3…Kd7": a move with its number, from the position before it. */
function numbered(fenBefore: string, san: string): string {
  const [, turn, , , , n] = fenBefore.split(' ');
  return `${n ?? 1}${turn === 'b' ? '…' : '.'}${san}`;
}

/** What the try counted for, and its first slip when it had one. */
function countedText(p: PracticeGame, e: Endgame): string {
  if (p.end?.reason === 'interrupted') return '';
  const solved = solvedBy(e.goal, p.end!.result);
  const m = p.missed;
  if (p.failed && m) {
    const keep = m.keep ? ` (${numbered(m.fenBefore, m.keep)} kept ${GOAL_WORD[e.goal]})` : '';
    return `${solved ? 'Reached after a take-back' : 'The try counts as missed'}: the first slip was ${numbered(m.fenBefore, m.san)}${keep}.${solved ? ' The try counts as missed.' : ''}`;
  }
  if (p.failed) return solved ? 'Reached after a hint or a take-back: the try counts as missed.' : 'The try counts as missed.';
  return solved ? 'Solved first time: it comes back in a while.' : 'The try counts as missed: it stays due.';
}

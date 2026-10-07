// Practice (PLAN.md §5.57): a game played on from a position (`#/practice?fen=…`), an advantage
// card's drill (inside the game cards' session), and the review at the end, also reopened from the
// history (`#/games/history/<id>`), after mistake-lab's Game Review (§6.3): the board with its eval
// bar and the move's classification on its square, stepped through the whole game; the result, the
// accuracy, the tally, the graph and the key moves; the move's card, to retry it, show the best
// move, the best line or the refutation (stepped, branched), save it as a practice mistake or make
// it into a sequence.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { makeUci, parseSquare } from 'chessops/util';
import { isNormal, type Role, type SquareName } from 'chessops/types';
import type { Key } from '@lichess-org/chessground/types';
import { open } from '../app/mode.ts';
import { recordEvent } from '../app/state.ts';
import { openingNameOf, practiceHistory, savedDeck } from '../app/games.ts';
import { analyse, claimVictory, clearPremove, detection, setFoundState, type FoundTactic, discardSaved, gameOfHistory, ignoreRepertoire, loadOpponent, practiceHint, resumePractice, savedPractice, saveOpponent, judge, leavePractice, practice, practiceMove, practiceReview, setPremove, startPractice, stopPractice, type Opponent, type PracticeGame, type PracticeMove } from '../app/practice.ts';
import { parseUciMove, standardUci } from '../core/chess/uci.ts';
import { makeFen } from 'chessops/fen';
import { CLASSIFICATION, moverScore, type Classification } from '../core/games/grade.ts';
import { positionEvals, PRACTICE, type Review } from '../core/games/practice.ts';
import { lineFen, lineScore, moveAt } from '../core/games/engineLine.ts';
import { whiteShare } from '../core/engine/winning.ts';
import { makeSan } from 'chessops/san';
import { closeReviewLine, reviewLine, reviewLineMove, reviewLineStep, reviewLineToAlt, reviewLineToMain, showBestLine, showRefutation } from '../app/reviewLine.ts';
import { EngineLinePanel, formatCp } from './EngineLinePanel.tsx';
import { practiceMistakeItem, practiceMistakeSaved } from '../core/games/saved.ts';
import { practiceTacticItem, tacticSaved, type DetectedTactic } from '../core/games/detect.ts';
import { nextLine, playReply, playUser, repliesDue, startTactic, type TacticRun } from '../core/games/tactic.ts';
import { gameCard } from '../core/progress/cards.ts';
import { positionOf } from '../core/storm/walk.ts';
import { Board, type BoardProps } from './Board.tsx';
import { answerPending, repeatOpponent, setVoiceConfirm, voice, voiceConfirm, voiceOff, voiceOn } from '../app/voice.ts';
import { useWakeLock } from './Train.tsx';
import { isoDay } from './day.ts';

const sq = (u: string, i: number) => u.slice(i, i + 2) as Key;

/* ------------------------------------------------------------------ the opponent's settings */

function OpponentSettings(props: { value: Opponent; onChange(o: Opponent): void }) {
  const o = props.value;
  const toggle = <T,>(list: readonly T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  return (
    <details class="practice-opponent">
      <summary>Opponent</summary>
      <p class="muted">The explorer’s games at this filter (a move drawn by its games: at least {PRACTICE.minGames} games and {PRACTICE.minFreq * 100}% of the position’s), then Maia, then Stockfish.</p>
      <div class="games-filters">
        {[1600, 1800, 2000, 2200, 2500].map((r) => (
          <label key={r} class="chip">
            <input type="checkbox" checked={o.ratings.includes(r)} onChange={(e) => props.onChange({ ...o, ratings: toggle(o.ratings, r, (e.target as HTMLInputElement).checked) })} /> {r === 2500 ? '2500+' : r}
          </label>
        ))}
      </div>
      <div class="games-filters">
        {['bullet', 'blitz', 'rapid', 'classical'].map((sp) => (
          <label key={sp} class="chip">
            <input type="checkbox" checked={o.speeds.includes(sp)} onChange={(e) => props.onChange({ ...o, speeds: toggle(o.speeds, sp, (e.target as HTMLInputElement).checked) })} /> {sp}
          </label>
        ))}
      </div>
      <label>
        Maia’s rating{' '}
        <input type="number" min={1100} max={2600} step={25} value={o.maiaElo} onChange={(e) => props.onChange({ ...o, maiaElo: Math.max(1100, Math.min(2600, Number((e.target as HTMLInputElement).value) || PRACTICE.maiaElo)) })} />
      </label>{' '}
      <label>
        Precision{' '}
        <input type="number" min={0} max={1} step={0.05} value={o.precision} onChange={(e) => props.onChange({ ...o, precision: Math.max(0, Math.min(1, Number((e.target as HTMLInputElement).value))) })} />
      </label>
    </details>
  );
}

/* ------------------------------------------------------------------ a board that takes moves */

export function MoveBoard(props: { fen: string; orientation: 'white' | 'black'; movable: boolean; lastUci?: string | undefined; arrows?: { orig: string; dest?: string; brush: string }[]; badge?: BoardProps['badge']; onMove(uci: string): void; premove?: BoardProps['premove'] }) {
  const pos = useMemo(() => positionOf(props.fen), [props.fen]);
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  if (!pos) return null;
  const dests = props.movable ? (chessgroundDests(pos) as Map<Key, Key[]>) : new Map<Key, Key[]>();
  const last = props.lastUci ? ([sq(props.lastUci, 0), sq(props.lastUci, 2)] as [Key, Key]) : undefined;
  const onMove = (orig: Key, dest: Key) => {
    const piece = pos.board.get(parseSquare(orig as SquareName)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    const move = normalizeMove(pos, { from: parseSquare(orig as SquareName)!, to: parseSquare(dest as SquareName)! });
    props.onMove(isNormal(move) ? standardUci(pos, move) : makeUci(move));
  };
  return (
    <div class="train-board">
      <Board fen={props.fen} orientation={props.orientation} turn={pos.turn} dests={dests} lastMove={last} check={pos.isCheck()} shapes={[]} autoShapes={props.arrows ?? []} drawMode={false} brush="green" onMove={onMove} onShapes={() => undefined} badge={props.badge} {...(props.premove ? { premove: props.premove } : {})} />
      {promotion && (
        <div class="promotion" role="dialog" aria-label="Promote to">
          {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => {
                props.onMove(makeUci({ from: parseSquare(promotion.orig as SquareName)!, to: parseSquare(promotion.dest as SquareName)!, promotion: role }));
                setPromotion(undefined);
              }}
            >
              {role}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the game */

const END_WORD = {
  mate: 'Checkmate: you won.',
  mated: 'Checkmated.',
  stalemate: 'Stalemate: a draw.',
  draw: 'A draw.',
  claim: 'Victory claimed.',
  collapse: 'The advantage is gone: the eval fell to +1 or below.',
  stopped: 'Stopped.',
  interrupted: 'The opponent couldn’t answer (no database, Maia or Stockfish): the game ends here, nothing graded.',
} as const;
const RESULT_WORD = { win: 'a win', draw: 'a draw', loss: 'a loss' } as const;
const GRADE_WORD = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;

/** The game being played (any kind), then its review. */
export function PracticeBoard(props: { onNext?: () => void }) {
  const p = practice.value;
  useWakeLock(!!p && p.phase !== 'over');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.key !== 'h') return;
      void practiceHint();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!p) return <p class="muted">Setting up…</p>;
  if (p.phase === 'over') return <PracticeReview game={p} onNext={props.onNext} />;
  const s = p.setup;
  const fen = p.moves.length ? p.moves[p.moves.length - 1]!.fen : s.fen;
  const last = p.moves[p.moves.length - 1];
  const lastUser = [...p.moves].reverse().find((m) => m.isUser);
  const cls = !s.silent && lastUser?.classification ? CLASSIFICATION[lastUser.classification] : undefined;
  const userMoves = p.moves.filter((m) => m.isUser).length;
  const hint = p.hint?.fen === fen && p.hint.uci ? p.hint : undefined;
  const arrows = hint ? [{ orig: hint.uci!.slice(0, 2), ...(hint.level === 2 ? { dest: hint.uci!.slice(2, 4) } : {}), brush: 'blue' }] : [];
  const canHint = s.kind === 'practice' && p.phase === 'user';
  const premove: BoardProps['premove'] = { color: s.color, current: p.premove ? [p.premove.from as Key, p.premove.to as Key] : undefined, onSet: (o, d) => setPremove(o, d), onUnset: clearPremove };
  return (
    <div class="train-grid practice-game" data-phase={p.phase} data-moves={p.moves.length} data-premove={p.premove ? p.premove.from + p.premove.to : ''}>
      <MoveBoard fen={fen} orientation={s.color} movable={p.phase === 'user'} lastUci={last?.uci} arrows={arrows} onMove={(u) => void practiceMove(u)} premove={premove} />
      <div class="train-panel">
        <p class="train-counters">
          {s.kind === 'advantage' ? 'Convert the advantage' : s.kind === 'checklist' ? `Checklist · ${s.preset}` : 'Practice'} · {s.title}
        </p>
        <p class="feedback train-feedback" role="status" data-testid="practice-feedback" style={cls ? { color: cls.colour } : undefined}>
          {p.phase === 'opponent'
            ? 'The opponent is thinking…'
            : cls && lastUser
              ? `${lastUser.san}: ${cls.word}${lastUser.wpDrop ? ` · −${lastUser.wpDrop}%` : ''}`
              : lastUser?.judging && !s.silent
                ? 'Your move (the last one is being judged)'
                : 'Your move'}
        </p>
        {p.deviation && (
          <div class="practice-deviation" role="status" data-testid="practice-deviation">
            <p>
              📖 <strong>{p.deviation.san}</strong> isn’t your repertoire: the study move is <strong>{p.deviation.repSan}</strong>.
            </p>
            <button type="button" class="secondary" onClick={ignoreRepertoire}>
              Ignore for this game
            </button>
          </div>
        )}
        {p.source && !s.silent && <p class="muted">Opponent: {p.source}</p>}
        {p.note && <p class="muted">{p.note}</p>}
        <MoveList moves={p.moves} baseFen={s.fen} />
        <VoiceControls />
        <div class="actions train-actions">
          {p.claim && (
            <button type="button" onClick={claimVictory}>
              Claim victory
            </button>
          )}
          {canHint && (
            <button type="button" class="secondary" title="The repertoire’s move, else Stockfish’s: the piece, then the move (H)" disabled={hint?.level === 2} onClick={() => void practiceHint()}>
              Hint
            </button>
          )}
          <button type="button" class="secondary" onClick={stopPractice} title={userMoves < PRACTICE.reviewMinMoves ? `Kept in the history from ${PRACTICE.reviewMinMoves} of your moves` : 'End here and review the game'}>
            Stop{userMoves >= PRACTICE.reviewMinMoves ? ' & review' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Voice input (§5.63): on and off, its last word, and whether a move waits for yes or no. */
function VoiceControls() {
  const v = voice.value;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || t === 'BUTTON') return;
      if (e.key === ' ') (voice.peek().on ? voiceOff : voiceOn)();
      else if (!voice.peek().on) return;
      else if (e.key === '1') repeatOpponent();
      else if (voice.peek().pending && (e.key === '2' || e.key === 'Enter')) answerPending(true);
      else if (voice.peek().pending && (e.key === '4' || e.key === 'Backspace')) answerPending(false);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="voice-controls" data-testid="voice">
      <button type="button" class={v.on ? '' : 'secondary'} aria-pressed={v.on} title="Say your moves (Space): “knight f3”, “egg four”, “castle”" onClick={() => (v.on ? voiceOff() : voiceOn())}>
        🎙 {v.on ? 'Listening' : 'Voice'}
      </button>
      {v.on && (
        <label class="check">
          <input type="checkbox" checked={voiceConfirm.value} onChange={(e) => setVoiceConfirm((e.target as HTMLInputElement).checked)} /> Confirm moves
        </label>
      )}
      {v.pending && (
        <>
          <button type="button" onClick={() => answerPending(true)}>
            Yes
          </button>
          <button type="button" class="secondary" onClick={() => answerPending(false)}>
            No
          </button>
        </>
      )}
      {v.note && (
        <span class="muted" role="status" data-testid="voice-note">
          {v.note}
        </span>
      )}
    </div>
  );
}

/** The game's moves while it is played, the user's with their symbols. */
function MoveList(props: { moves: readonly PracticeMove[]; baseFen: string }) {
  const [, turn, , , , n] = props.baseFen.split(' ');
  let number = Number(n) || 1;
  let white = turn !== 'b';
  return (
    <div class="game-moves" data-testid="practice-moves">
      {props.moves.map((m, i) => {
        const label = white ? `${number}. ` : i === 0 ? `${number}… ` : '';
        if (!white) number++;
        white = !white;
        const cls = m.classification ? CLASSIFICATION[m.classification] : undefined;
        return (
          <span key={i} class="game-move">
            {label && <span class="muted">{label}</span>}
            {m.san}
            {cls && m.isUser && cls.symbol && (
              <span class="practice-cls" style={{ color: cls.colour }} title={cls.word}>
                {cls.symbol}
              </span>
            )}{' '}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ the review */

/** The classifications in the tally's order. */
const CLASS_ORDER: readonly Classification[] = ['great', 'best', 'excellent', 'good', 'book', 'miss', 'inaccuracy', 'mistake', 'blunder'];
/** The moves whose refutation is worth showing (mistake-lab's: more than 5 points given up). */
const refutable = (wpDrop: number | undefined) => (wpDrop ?? 0) > PRACTICE.keyWp;
/** Classifications coloured in the move list (the rest only carry their symbol). */
const LOUD = new Set<Classification>(['miss', 'inaccuracy', 'mistake', 'blunder']);
const REP_PURPLE = '#8b7dd8';

const fenAfterMove = (fen: string, uci: string): string | undefined => {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  pos.play(move);
  return makeFen(pos.toSetup());
};
const sanOf = (fen: string, uci: string | undefined): string | undefined => {
  const pos = uci ? positionOf(fen) : undefined;
  const move = pos && parseUciMove(pos, uci!);
  return pos && move ? makeSan(pos, move) : undefined;
};
const badgeOf = (uci: string | undefined, c: Classification | undefined) => (uci && c ? { square: uci.slice(2, 4), symbol: CLASSIFICATION[c].symbol, colour: CLASSIFICATION[c].colour, word: CLASSIFICATION[c].word } : undefined);
/** A move's number and SAN ("12. Qxa2", "12… Qxa2"). */
const numbered = (fenBefore: string, san: string) => {
  const [, turn, , , , n] = fenBefore.split(' ');
  return `${n ?? '1'}${turn === 'w' ? '.' : '…'} ${san}`;
};
/** A finished position's score for White (a mate ±10,000), or undefined while the game goes on. */
function finalScore(fen: string): number | undefined {
  const pos = positionOf(fen);
  if (!pos?.isEnd()) return undefined;
  return pos.isCheckmate() ? (pos.turn === 'white' ? -10000 : 10000) : 0;
}

/** The eval bar beside the review's board: White's share from White's side, its score at the leader's end. */
function ReviewEvalBar(props: { cp: number | undefined; orientation: 'white' | 'black' }) {
  const cp = props.cp;
  const share = cp === undefined ? 50 : whiteShare(Math.abs(cp) >= 10000 ? { mate: cp > 0 ? 1 : -1 } : { cp });
  const whiteAhead = (cp ?? 0) >= 0;
  // The score sits at the end of the side ahead: White's end is the bottom with White below.
  const atBottom = whiteAhead === (props.orientation === 'white');
  return (
    <div class={`review-eval${props.orientation === 'black' ? ' flipped' : ''}${cp === undefined ? ' unknown' : ''}`} role="img" aria-label={cp === undefined ? 'No eval yet' : `Eval ${formatCp(cp)}`} data-testid="review-eval" data-white={share.toFixed(1)}>
      <div class="review-eval-white" style={{ height: `${share}%` }} />
      {cp !== undefined && <span class={`review-eval-score ${atBottom ? 'bottom' : 'top'} ${whiteAhead ? 'on-white' : 'on-black'}`}>{formatCp(cp).replace('+', '')}</span>}
    </div>
  );
}

/** The graph from the user's side: the area, the key moves as dots of their colour, the cursor; a click goes to that move. */
function Graph(props: { game: PracticeGame; points: Review['evalPoints']; keys: ReadonlySet<number>; at: number; onAt(i: number): void }) {
  const pts = props.points;
  if (pts.length < 2) return null;
  const w = 600;
  const h = 100;
  const n = props.game.moves.length + 1;
  const x = (idx: number) => ((idx + 1) / Math.max(1, n - 1)) * w;
  const y = (cp: number) => h - h / (1 + Math.pow(10, -cp / 400));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.idx).toFixed(1)},${y(p.cp).toFixed(1)}`).join(' ');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return (
    <svg
      class="eval-graph review-graph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="The evaluation through the game, from your side"
      onClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        props.onAt(Math.max(-1, Math.min(n - 2, Math.round(((e.clientX - r.left) / r.width) * (n - 1)) - 1)));
      }}
    >
      <path d={`${path} L${x(last.idx).toFixed(1)},${h} L${x(first.idx).toFixed(1)},${h} Z`} class="eval-area" />
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} class="eval-mid" />
      <path d={path} class="eval-line" fill="none" />
      <line x1={x(props.at)} x2={x(props.at)} y1="0" y2={h} class="eval-cursor" />
      {pts
        .filter((p) => props.keys.has(p.idx) && p.classification)
        .map((p) => (
          <circle key={p.idx} cx={x(p.idx)} cy={y(p.cp)} r="4" fill={CLASSIFICATION[p.classification!].colour} vector-effect="non-scaling-stroke" class="eval-dot" />
        ))}
    </svg>
  );
}

/** The whole game in two columns, the user's moves with their symbols; the current move kept in view. */
function ReviewMoves(props: { game: PracticeGame; at: number; onAt(i: number): void }) {
  const g = props.game;
  const box = useRef<HTMLDivElement>(null);
  const [, turn, , , , n] = g.setup.fen.split(' ');
  const rows: { num: number; cells: (number | undefined)[] }[] = [];
  let num = Number(n) || 1;
  let col = turn === 'b' ? 1 : 0;
  g.moves.forEach((_, i) => {
    if (col === 0 || !rows.length) rows.push({ num, cells: [undefined, undefined] });
    rows[rows.length - 1]!.cells[col] = i;
    if (col === 1) num++;
    col = 1 - col;
  });
  useEffect(() => {
    const el = box.current;
    const cur = el?.querySelector<HTMLElement>('.current');
    if (!el || !cur) return;
    // Within the list only: the page doesn't move.
    const top = cur.offsetTop - el.offsetTop;
    if (top < el.scrollTop) el.scrollTop = top - 4;
    else if (top + cur.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + cur.offsetHeight - el.clientHeight + 4;
  }, [props.at]);
  return (
    <div class="review-moves" ref={box} data-testid="review-moves">
      {rows.map((r) => (
        <div class="review-row" key={r.num}>
          <span class="review-num">{r.num}.</span>
          {r.cells.map((i, c) => {
            if (i === undefined) return <span key={c} class="review-cell empty">{c === 0 ? '…' : ''}</span>;
            const m = g.moves[i]!;
            const cls = m.isUser && m.classification ? CLASSIFICATION[m.classification] : undefined;
            return (
              <button key={c} type="button" class={`review-cell${props.at === i ? ' current' : ''}${m.isUser ? ' user' : ''}`} style={cls && LOUD.has(m.classification!) ? { color: cls.colour } : undefined} onClick={() => props.onAt(i)}>
                {m.san}
                {cls && cls.symbol && (
                  <span class="practice-cls" style={{ color: cls.colour }} title={cls.word}>
                    {cls.symbol}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** A retry of the move at `i`: the move tried, the position after it, and Stockfish's judgement. */
interface Retry {
  i: number;
  tried?: string;
  san?: string;
  fen?: string;
  judging?: boolean;
  judged?: Partial<PracticeMove>;
  failed?: boolean;
}

export function PracticeReview(props: { game: PracticeGame; onNext?: (() => void) | undefined }) {
  const g = props.game;
  const review = useMemo(() => practiceReview(g), [g]);
  const evals = useMemo(() => positionEvals(g.moves), [g]);
  const [at, setAtState] = useState(g.moves.length - 1);
  const [retry, setRetry] = useState<Retry | undefined>(undefined);
  const [best, setBest] = useState(false);
  const [savedNote, setSavedNote] = useState<string | undefined>(undefined);
  const [solving, setSolving] = useState<DetectedTactic | undefined>(undefined);
  // Scores Stockfish gave the board's positions no judge covered (White's, by FEN).
  const [searched, setSearched] = useState<ReadonlyMap<string, number>>(new Map());
  const det = detection.value?.gen === g.gen && g.gen >= 0 ? detection.value : undefined;
  const rl = reviewLine.value;
  const s = g.setup;
  const fenAt = (i: number) => (i < 0 ? s.fen : g.moves[i]!.fen);
  const keys = review.keyMoves;
  const keySet = new Set(keys);
  const white = (userCp: number | undefined) => (userCp === undefined ? undefined : s.color === 'white' ? userCp : -userCp);
  useEffect(() => () => closeReviewLine(), []);

  /** To a move of the game (−1 the start): any line, retry or best arrow put away. */
  const go = (i: number) => {
    closeReviewLine();
    setRetry(undefined);
    setBest(false);
    setSavedNote(undefined);
    setAtState(Math.max(-1, Math.min(g.moves.length - 1, i)));
  };
  const nextKey = keys.find((k) => k > at);
  const prevKey = [...keys].reverse().find((k) => k < at);
  const mv = at >= 0 ? g.moves[at] : undefined;
  const about = (suffix = '') => `${g.gen}|${g.historyId ?? ''}|${at}${suffix}`;
  const line = rl && (rl.about === about() || rl.about === about(':retry')) ? rl : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      const lineOpen = !!reviewLine.peek()?.line;
      if (e.key === 'ArrowLeft') lineOpen ? reviewLineStep(-1) : go(at - 1);
      else if (e.key === 'ArrowRight') lineOpen ? reviewLineStep(1) : go(at + 1);
      else if (e.key === 'Home') go(-1);
      else if (e.key === 'End') go(g.moves.length - 1);
      else if (e.key === 'Escape' && (reviewLine.peek() || retry || best)) go(at);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [at, g, retry, best]);

  // What the board shows: the line, the best move's arrow, a retry, or the game at the cursor.
  let board: string;
  let lastUci: string | undefined;
  let arrows: { orig: string; dest?: string; brush: string }[] = [];
  let badge: BoardProps['badge'];
  let movable = false;
  let onMove: (uci: string) => void = () => undefined;
  let cp: number | undefined;
  const prevUci = (i: number) => (i > 0 ? g.moves[i - 1]!.uci : undefined);
  if (line && mv) {
    const l = line.line;
    board = line.pendingFen ?? (l ? lineFen(l) : line.kind === 'best' ? mv.fenBefore : mv.fen);
    lastUci = line.pendingFen ? undefined : l ? (moveAt(l, l.currentIdx)?.uci ?? prevUci(at)) : line.kind === 'best' ? prevUci(at) : mv.uci;
    if (l && l.activeAlt === -1 && l.currentIdx === 0) badge = line.kind === 'best' ? badgeOf(l.moves[0]!.uci, 'best') : badgeOf(l.moves[0]!.uci, (retry?.tried ? retry.judged?.classification : mv.classification) ?? undefined);
    movable = !!l && !line.busy;
    onMove = reviewLineMove;
    cp = l ? (lineScore(l) ?? undefined) : undefined;
  } else if (best && mv) {
    board = mv.fenBefore;
    lastUci = prevUci(at);
    const compared = retry?.tried ?? mv.uci;
    if (mv.bestMoveUci && compared !== mv.bestMoveUci) arrows.push({ orig: compared.slice(0, 2), dest: compared.slice(2, 4), brush: 'red' });
    if (mv.bestMoveUci) arrows.push({ orig: mv.bestMoveUci.slice(0, 2), dest: mv.bestMoveUci.slice(2, 4), brush: 'green' });
    cp = white(evals[at]);
  } else if (retry && mv) {
    board = retry.fen ?? mv.fenBefore;
    lastUci = retry.tried ?? prevUci(at);
    movable = !retry.tried;
    onMove = (u) => void tryMove(u);
    badge = badgeOf(retry.tried, retry.judged?.classification);
    cp = retry.tried ? white(retry.judged?.afterCp) : white(evals[at]);
  } else {
    board = fenAt(at);
    lastUci = mv?.uci;
    badge = mv?.isUser ? badgeOf(mv.uci, mv.classification) : undefined;
    cp = white(evals[at + 1]) ?? finalScore(board) ?? searched.get(board);
  }
  // A position of the game no judge scored (the start, the opponent's last move): one search, once the judges are done.
  const unscored = !line && !best && !retry && cp === undefined && g.judged ? board : undefined;
  useEffect(() => {
    if (!unscored || searched.has(unscored)) return;
    let live = true;
    void analyse(unscored, 1).then((a) => {
      const l = a?.lines[0];
      if (live && l) setSearched((m) => new Map(m).set(unscored, moverScore(l.score, 'white')));
    });
    return () => {
      live = false;
    };
  }, [unscored]);

  const tryMove = async (uci: string) => {
    if (!retry || retry.tried) return;
    const m = g.moves[retry.i]!;
    const fen = fenAfterMove(m.fenBefore, uci);
    if (!fen) return;
    const san = sanOf(m.fenBefore, uci);
    const i = retry.i;
    setRetry({ i, tried: uci, ...(san ? { san } : {}), fen, judging: true });
    const j = await judge(m.fenBefore, uci, fen);
    setRetry((r) => (r && r.i === i && r.tried === uci ? { i, tried: uci, ...(san ? { san } : {}), fen, ...(j ? { judged: j } : { failed: true }) } : r));
  };
  const startRetry = (i: number) => {
    closeReviewLine();
    setBest(false);
    setSavedNote(undefined);
    setRetry({ i });
  };
  const saveMistake = (i: number) => {
    const m = g.moves[i]!;
    if (m.wpDrop === undefined || m.cpLoss === undefined || m.bestCp === undefined) return;
    if (practiceMistakeSaved(savedDeck.value, m.fenBefore, m.san)) return setSavedNote('Already saved.');
    const item = practiceMistakeItem({ move: { fenBefore: m.fenBefore, san: m.san, uci: m.uci, wpDrop: m.wpDrop, cpLoss: m.cpLoss, bestCp: m.bestCp }, color: s.color, now: Date.now(), ...(g.historyId ? { from: `h|${g.historyId}` } : {}) });
    if (!item) return setSavedNote(`Only a move that gives up more than 2% is saved.`);
    void recordEvent({ t: new Date().toISOString(), k: 'saved', card: gameCard(item.pid), item: { ...item } });
    setSavedNote('Saved: it is in your game cards.');
  };
  const saveTactic = (i: number, f: FoundTactic) => {
    if (tacticSaved(savedDeck.value, f.t)) return setFoundState(i, 'saved');
    const item = practiceTacticItem(f.t, { now: Date.now(), rand: Math.random().toString(36).slice(2, 7), ...(g.historyId ? { from: `h|${g.historyId}` } : {}) });
    if (!item) return;
    void recordEvent({ t: new Date().toISOString(), k: 'saved', card: gameCard(item.pid), item: { ...item } });
    setFoundState(i, 'saved');
  };
  if (solving) return <TacticSolver t={solving} onClose={() => setSolving(undefined)} />;

  const end = g.end;
  const keyNav = (
    <div class="review-keynav">
      <button type="button" class="secondary" disabled={prevKey === undefined} onClick={() => prevKey !== undefined && go(prevKey)}>
        ◀ Key move
      </button>
      <span class="muted">{keys.length ? `${keySet.has(at) ? keys.indexOf(at) + 1 : '–'} / ${keys.length}` : 'No key moves'}</span>
      <button type="button" class={nextKey === undefined ? 'secondary' : ''} disabled={nextKey === undefined} onClick={() => nextKey !== undefined && go(nextKey)}>
        Key move ▶
      </button>
    </div>
  );

  /** Show best, Show line, Show refutation for the move at `i` (or the move retried there). */
  const explore = (i: number, m: PracticeMove, opts: { refuteUci?: string; refuteSan?: string; bestShown: boolean }) => (
    <>
      {m.bestMoveUci && !opts.bestShown && (
        <button type="button" class="secondary" aria-pressed={best} onClick={() => (closeReviewLine(), setBest(!best))}>
          {best ? 'Hide best' : 'Show best'}
        </button>
      )}
      {(m.bestMoveUci || m.classification) && (
        <button type="button" class="secondary" title="The best move here and Stockfish’s line after it" onClick={() => (setBest(false), showBestLine(about(), m.fenBefore, m.bestMoveUci, sanOf(m.fenBefore, m.bestMoveUci) ?? 'the best move'))}>
          Show line
        </button>
      )}
      {opts.refuteUci && (
        <button type="button" class="secondary" title="How the opponent punishes it" onClick={() => (setBest(false), showRefutation(about(retry?.tried ? ':retry' : ''), m.fenBefore, opts.refuteUci!, opts.refuteSan ?? ''))}>
          Show refutation
        </button>
      )}
    </>
  );

  let focus;
  if (line && mv) {
    const back = (
      <button type="button" class="secondary" onClick={() => closeReviewLine()}>
        ← Back
      </button>
    );
    const title = line.kind === 'best' ? `Best line: ${numbered(mv.fenBefore, line.san)}` : `Refutation of ${numbered(mv.fenBefore, line.san)}`;
    focus = line.line ? (
      <EngineLinePanel line={line.line} busy={line.busy} title={title} hint="← → to step · a move on the board branches" onMain={reviewLineToMain} onAlt={reviewLineToAlt} onStep={reviewLineStep}>
        {back}
      </EngineLinePanel>
    ) : (
      <div class="engine-line-box" data-testid="engine-line">
        <p class="muted">{line.busy ? `${title} · Stockfish is looking…` : 'Stockfish gave no line here.'}</p>
        <div class="actions">{back}</div>
      </div>
    );
  } else if (retry && mv) {
    const j = retry.judged;
    const c = j?.classification ? CLASSIFICATION[j.classification] : undefined;
    const exact = j?.classification === 'best' || j?.classification === 'great';
    const improved = j?.wpDrop !== undefined && j.wpDrop < (mv.wpDrop ?? 100);
    focus = (
      <div class="review-card" style={{ '--cls': c?.colour ?? 'var(--muted)' }} data-testid="review-retry">
        {!retry.tried ? (
          <>
            <p class="review-card-title">Find a better move than {mv.san}</p>
            <p class="muted">Play it on the board.</p>
            <div class="actions">
              <button type="button" class="secondary" onClick={() => setRetry(undefined)}>
                Skip
              </button>
            </div>
          </>
        ) : retry.judging ? (
          <p class="review-card-title" role="status" data-testid="practice-retry">
            {retry.san}: Stockfish is judging…
          </p>
        ) : (
          <>
            <p class="review-card-title" role="status" data-testid="practice-retry" style={c ? { color: c.colour } : undefined}>
              {c ? `${c.symbol} ${c.word}${exact ? '!' : ''}` : 'Stockfish couldn’t judge it.'}
            </p>
            {j && (
              <p>
                <code>{retry.san}</code> {exact ? 'is the engine’s top choice.' : (j.wpDrop ?? 0) <= 2 ? 'is nearly as good as the best move.' : `gives up ${j.wpDrop}% winning chances.`}
              </p>
            )}
            {j && !exact && improved && (
              <p class="muted">
                Better than your original <code>{mv.san}</code> (−{mv.wpDrop}%).
              </p>
            )}
            {j && (
              <div class="actions">
                {explore(retry.i, { ...mv, ...(j.bestMoveUci ? { bestMoveUci: j.bestMoveUci } : {}) }, { bestShown: exact, ...(refutable(j.wpDrop) && retry.tried ? { refuteUci: retry.tried, refuteSan: retry.san ?? '' } : {}) })}
              </div>
            )}
            <div class="actions">
              <button type="button" class="secondary" onClick={() => startRetry(retry.i)}>
                ↺ Try again
              </button>
              {nextKey !== undefined ? (
                <button type="button" onClick={() => go(nextKey)}>
                  Next key move ▶
                </button>
              ) : (
                <button type="button" onClick={() => go(retry.i)}>
                  Done
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  } else if (mv?.isUser) {
    const c = mv.classification ? CLASSIFICATION[mv.classification] : undefined;
    const dev = review.deviations.get(at);
    const tried = review.corrected.has(at) ? mv.repTried?.san : undefined;
    const saved = practiceMistakeSaved(savedDeck.value, mv.fenBefore, mv.san);
    const loss = (mv.wpDrop ?? 0) > 2;
    const bestSan = best ? sanOf(mv.fenBefore, mv.bestMoveUci) : undefined;
    const exact = mv.classification === 'best' || mv.classification === 'great';
    focus = (
      <div class="review-card" style={{ '--cls': dev && !c ? REP_PURPLE : (c?.colour ?? 'var(--muted)') }} data-testid="review-move" data-cls={mv.classification ?? ''}>
        <p class="review-card-title">
          {c ? (
            <span style={{ color: c.colour }}>
              {c.symbol} {c.word}
            </span>
          ) : (
            <span class="muted">{g.judged ? 'Not judged' : 'Being judged…'}</span>
          )}{' '}
          · <code>{numbered(mv.fenBefore, mv.san)}</code>
        </p>
        {mv.wpDrop !== undefined && loss && (
          <p>
            Gave up {mv.wpDrop}% winning chances{mv.cpLoss ? ` (−${mv.cpLoss} cp)` : ''}.
          </p>
        )}
        {dev && (
          <p class="rep-dev">
            {tried ? `📖 You first tried ${tried} here before correcting to the repertoire move.` : '📖 Your repertoire plays a different move here.'}
          </p>
        )}
        {bestSan && (
          <p data-testid="review-best">
            Best: <strong style={{ color: CLASSIFICATION.best.colour }}>{bestSan}</strong>
            {!exact && <span class="muted"> · you played {mv.san}</span>}
          </p>
        )}
        {c && (
          <div class="actions">
            {!exact && (
              <button type="button" onClick={() => startRetry(at)}>
                ↺ Retry
              </button>
            )}
            {explore(at, mv, { bestShown: exact, ...(refutable(mv.wpDrop) ? { refuteUci: mv.uci, refuteSan: mv.san } : {}) })}
          </div>
        )}
        {loss && (
          <div class="actions">
            {saved ? (
              <button type="button" class="secondary" disabled>
                ✓ Saved
              </button>
            ) : (
              <button type="button" class="secondary" title="A practice mistake in your game cards" onClick={() => saveMistake(at)}>
                💾 Save as a mistake
              </button>
            )}
            <button type="button" class="secondary" title="Build the lines that refute it on the analysis board, and drill them as a sequence" onClick={() => open({ name: 'analysis', fen: mv.fenBefore, seq: '*' })}>
              🔍 Make a sequence
            </button>
          </div>
        )}
        {savedNote && <p role="status">{savedNote}</p>}
        {keyNav}
      </div>
    );
  } else {
    focus = (
      <div class="review-card" data-testid="review-move">
        <p class="review-card-title">{mv ? <>Their move · <code>{numbered(mv.fenBefore, mv.san)}</code></> : 'The starting position'}</p>
        {mv?.source && <p class="muted">From {mv.source}</p>}
        {keyNav}
      </div>
    );
  }

  const tally = CLASS_ORDER.filter((c) => review.tally[c] > 0);
  return (
    <div class="train-grid practice-review" data-testid="practice-review" data-at={at} data-view={line ? line.kind : best ? 'best' : retry ? 'retry' : 'game'}>
      <div class="train-board review-board">
        <div class="review-board-row">
          <ReviewEvalBar cp={cp} orientation={s.color} />
          <div class="review-board-main">
            <MoveBoard fen={board} orientation={s.color} movable={movable} lastUci={lastUci} arrows={arrows} badge={badge} onMove={onMove} />
          </div>
        </div>
        <div class="actions move-buttons">
          <button type="button" class="secondary" aria-label="Start" title="Start (Home)" onClick={() => go(-1)}>
            ⏮
          </button>
          <button type="button" class="secondary" aria-label="Back" title="Back (←)" onClick={() => (line?.line ? reviewLineStep(-1) : go(at - 1))}>
            ◀
          </button>
          <button type="button" class="secondary" aria-label="Forward" title="Forward (→)" onClick={() => (line?.line ? reviewLineStep(1) : go(at + 1))}>
            ▶
          </button>
          <button type="button" class="secondary" aria-label="End" title="End (End)" onClick={() => go(g.moves.length - 1)}>
            ⏭
          </button>
        </div>
      </div>
      <div class="train-panel review-panel">
        <section class="review-summary">
          {end && (
            <p data-testid="practice-end">
              <strong>{END_WORD[end.reason]}</strong> {end.reason === 'interrupted' ? '' : `Counted as ${RESULT_WORD[end.result]}.`}
              {end.grade && <span class="muted"> Recorded: {GRADE_WORD[end.grade]}.</span>}
            </p>
          )}
          <p class="review-accuracy" data-testid="practice-accuracy">
            {review.judged ? (
              <>
                <strong class="review-big">{review.accuracy}%</strong> accuracy · {review.judged} judged move{review.judged === 1 ? '' : 's'} · {keys.length} key move{keys.length === 1 ? '' : 's'}
              </>
            ) : g.judged ? (
              'No move could be judged.'
            ) : (
              'Stockfish is judging the moves…'
            )}
          </p>
          {tally.length > 0 && (
            <p class="review-tally">
              {tally.map((c) => (
                <span key={c} style={{ color: CLASSIFICATION[c].colour }} title={CLASSIFICATION[c].word}>
                  {CLASSIFICATION[c].symbol} {review.tally[c]} {CLASSIFICATION[c].word.toLowerCase()}
                </span>
              ))}
            </p>
          )}
          <Graph game={g} points={review.evalPoints} keys={keySet} at={at} onAt={go} />
          {keys.length > 0 && (
            <ul class="review-keys" data-testid="practice-keys">
              {keys.map((i) => {
                const m = g.moves[i]!;
                const c = m.classification ? CLASSIFICATION[m.classification] : undefined;
                const dev = review.deviations.get(i);
                const tried = review.corrected.has(i) ? m.repTried?.san : undefined;
                return (
                  <li key={i} class={at === i ? 'current' : ''}>
                    <button type="button" class="link" onClick={() => go(i)}>
                      {m.san}
                    </button>{' '}
                    <span style={c && !dev ? { color: c.colour } : undefined} class={dev ? 'rep-dev' : ''}>
                      {tried ? `📖 corrected: you first tried ${tried}` : dev ? '📖 off the repertoire' : (c?.word ?? '')}
                    </span>
                    {m.wpDrop ? <span class="muted"> −{m.wpDrop}%</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {g.historyId && <p class="muted">Kept in the history.</p>}
        </section>
        <section class={`review-focus${line?.kind === 'refutation' ? ' refutation' : ''}`}>{focus}</section>
        <ReviewMoves game={g} at={at} onAt={go} />
        {det && (
          <div class="practice-tactics" data-testid="practice-tactics">
            {det.scanning ? (
              <p class="muted">
                ⚡ Scanning for tactics… {det.done}/{det.total}
              </p>
            ) : (
              !det.found.length && <p class="muted">{det.total ? 'No tactic found in this game.' : 'No tactic to look for in this game.'}</p>
            )}
            {det.found.length > 0 && (
              <ul class="game-items">
                {det.found.map((f, i) => (
                  <li key={i} data-testid="detected-tactic" class={f.state === 'discarded' ? 'dropped' : ''}>
                    ⚡ {moveLabel(f.t)} <span style={{ color: f.t.found ? '#62cf8e' : '#e04040' }}>{f.t.found ? '✓ Found' : '✕ Missed'}</span>
                    <span class="muted">
                      {' '}
                      · {f.t.lines.length} line{f.t.lines.length === 1 ? '' : 's'}
                    </span>
                    <div class="actions">
                      {f.state === 'discarded' ? (
                        <button type="button" class="secondary" onClick={() => setFoundState(i, 'new')}>
                          Undo discard
                        </button>
                      ) : (
                        <>
                          <button type="button" class="secondary" onClick={() => setSolving(f.t)}>
                            Try
                          </button>
                          {f.state === 'saved' ? (
                            <span class="muted">✓ Saved</span>
                          ) : (
                            <button type="button" class="secondary" onClick={() => saveTactic(i, f)}>
                              Save
                            </button>
                          )}
                          {f.state !== 'saved' && (
                            <button type="button" class="secondary" onClick={() => setFoundState(i, 'discarded')}>
                              Discard
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div class="actions review-actions">
          {props.onNext ? (
            <button type="button" onClick={props.onNext}>
              Next
            </button>
          ) : (
            g.gen >= 0 && (
              <button type="button" onClick={() => startPractice({ ...s })}>
                Play again
              </button>
            )
          )}
          <button type="button" class="secondary" onClick={() => open({ name: 'analysis', fen: board })}>
            Analyse
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the screens */

/** `#/practice?fen=…`: a game from any position. */
export function PracticeScreen(props: { fen: string; side?: 'white' | 'black' | undefined }) {
  const [opponent, setOpponent] = useState(loadOpponent);
  // A game kept on this device (a reload, a switch of app) is offered first; one just resumed is played on.
  const [saved, setSaved] = useState(() => (practice.peek()?.phase !== 'over' && practice.peek()?.setup.fen === props.fen ? undefined : savedPractice()));
  const start = () => {
    const pos = positionOf(props.fen);
    // Titled by the opening most of the user's games reaching it carry (mistake-lab's `lookupOpeningName`).
    if (pos) startPractice({ kind: 'practice', fen: props.fen, color: props.side ?? pos.turn, silent: false, title: openingNameOf(props.fen) || 'From a position', opponent });
  };
  useEffect(() => {
    const live = practice.peek();
    if (!saved && !(live && live.phase !== 'over' && live.setup.fen === props.fen)) start();
    return () => leavePractice();
  }, [props.fen, props.side]);
  const ok = !!positionOf(props.fen);
  if (saved)
    return (
      <div class="games">
        <ResumeBanner
          onResume={() => (resumePractice(saved), setSaved(undefined))}
          onDiscard={() => (discardSaved(), setSaved(undefined), start())}
          saved={saved}
        />
      </div>
    );
  return (
    <div class="games">
      <div class="chapter-head">
        <a href="#/games" class="back" onClick={(e) => (e.preventDefault(), history.length > 1 ? history.back() : open({ name: 'games' }))}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">Practice</span>
        </div>
      </div>
      {ok ? <PracticeBoard /> : <p class="warn">That isn’t a position.</p>}
      <OpponentSettings
        value={opponent}
        onChange={(o) => {
          setOpponent(o);
          saveOpponent(o);
        }}
      />
    </div>
  );
}

/** `#/games/history/<id>`: a practice game's review, reopened. */
export function HistoryScreen(props: { id: string }) {
  const entry = practiceHistory.value.find((h) => h.id === props.id);
  const game = useMemo(() => (entry ? gameOfHistory(entry) : undefined), [entry]);
  return (
    <div class="games">
      <div class="chapter-head">
        <a href="#/games" class="back">
          ←
        </a>
        <div class="titles">
          <span class="study-title">Practice game</span>
          {entry && <span class="muted"> · {isoDay(entry.ts)} · {entry.openingName || entry.source}</span>}
        </div>
      </div>
      {game ? <PracticeReview game={game} /> : <p class="warn">That practice game isn’t in the history on this device.</p>}
    </div>
  );
}

/** A practice game kept on this device: Resume or Discard (mistake-lab's "Game in progress"). */
export function ResumeBanner(props: { saved: NonNullable<ReturnType<typeof savedPractice>>; onResume(): void; onDiscard(): void }) {
  const g = props.saved.game;
  const fen = g.moves.at(-1)?.fen ?? g.setup.fen;
  return (
    <section class="card resume-banner" data-testid="practice-resume">
      <p>
        <strong>Game in progress</strong> · {g.setup.title} · {g.moves.length} move{g.moves.length === 1 ? '' : 's'} played ·{' '}
        <span class="muted">{new Date(props.saved.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </p>
      <MoveBoard fen={fen} orientation={g.setup.color} movable={false} lastUci={g.moves.at(-1)?.uci} onMove={() => undefined} />
      <div class="actions">
        <button type="button" onClick={props.onResume}>
          Resume
        </button>
        <button type="button" class="secondary" onClick={props.onDiscard}>
          Discard
        </button>
      </div>
    </section>
  );
}

/** A detected tactic's first move with its number ("12. Bxf7+", "12… Nxe4"). */
function moveLabel(t: DetectedTactic): string {
  const [, turn, , , , n] = t.cand.preFen.split(' ');
  return `${n ?? '1'}${turn === 'w' ? '.' : '…'} ${t.lines[0]![0]!.san}`;
}

/** Try: a detected tactic played through on the board, its lines in turn (mistake-lab's tactic mode, ungraded). */
function TacticSolver(props: { t: DetectedTactic; onClose(): void }) {
  const t = props.t;
  const lines = useMemo(() => t.lines.map((l) => l.map((m) => ({ uci: m.uci, san: m.san, user: m.isUser }))), [t]);
  const [st, setSt] = useState<{ run: TacticRun; fen: string; last?: string; phase: 'asking' | 'reply' | 'wrong' | 'done'; note?: string }>(() => ({ run: startTactic(lines), fen: t.cand.preFen, phase: 'asking' }));
  const fenAfter = (fen: string, uci: string) => {
    const pos = positionOf(fen);
    const move = pos && parseUciMove(pos, uci);
    if (!pos || !move) return fen;
    pos.play(move);
    return makeFen(pos.toSetup());
  };
  const replies = (run: TacticRun, fen: string) => {
    const due = repliesDue(run);
    if (!due.length) return void setSt({ run, fen, phase: 'asking' });
    setSt((x) => ({ ...x, run, fen, phase: 'reply' }));
    let r = run;
    let f = fen;
    due.forEach((uci, i) =>
      setTimeout(() => {
        f = fenAfter(f, uci);
        r = playReply(r, uci);
        const end = i === due.length - 1;
        if (end && r.played.length >= r.lines[r.active]!.length) return lineDone(r, f, uci);
        setSt({ run: r, fen: f, last: uci, phase: end ? 'asking' : 'reply' });
      }, 400 * (i + 1)),
    );
  };
  const lineDone = (run: TacticRun, fen: string, last: string) => {
    const next = nextLine(run);
    if (!next) return setSt({ run, fen, last, phase: 'done', note: 'Solved' });
    let f = t.cand.preFen;
    for (const u of next.prefix) f = fenAfter(f, u);
    setSt({ run: next.run, fen: f, ...(next.prefix.length ? { last: next.prefix[next.prefix.length - 1]! } : {}), phase: 'asking', note: 'Another line: the opponent answers differently.' });
  };
  const onMove = (uci: string) => {
    if (st.phase !== 'asking') return;
    const a = playUser(st.run, uci);
    if (!a.ok) return setSt({ ...st, fen: fenAfter(st.fen, uci), last: uci, phase: 'wrong', note: 'Not this one' });
    const fen = fenAfter(st.fen, uci);
    if (a.lineDone) return lineDone(a.run, fen, uci);
    setSt({ run: a.run, fen, last: uci, phase: 'reply' });
    replies(a.run, fen);
  };
  const retry = () => {
    let f = t.cand.preFen;
    for (const u of st.run.played) f = fenAfter(f, u);
    const last = st.run.played[st.run.played.length - 1];
    setSt({ run: st.run, fen: f, ...(last ? { last } : {}), phase: 'asking' });
  };
  return (
    <div class="train-grid practice-review" data-testid="tactic-solver" data-phase={st.phase} data-step={st.run.played.length}>
      <MoveBoard fen={st.fen} orientation={t.cand.color} movable={st.phase === 'asking'} lastUci={st.last} onMove={onMove} />
      <div class="train-panel">
        <p class="train-counters">Detected tactic · {moveLabel(t)}</p>
        <p class="feedback train-feedback" role="status" data-testid="tactic-feedback">
          {st.phase === 'reply' ? 'The opponent answers…' : (st.note ?? 'Find the tactic')}
        </p>
        <div class="actions">
          {st.phase === 'wrong' && (
            <button type="button" onClick={retry}>
              Try again
            </button>
          )}
          <button type="button" class="secondary" onClick={props.onClose}>
            Back to the review
          </button>
        </div>
      </div>
    </div>
  );
}

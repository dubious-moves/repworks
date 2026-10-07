// Practice (PLAN.md §5.57): a game played on from a position (`#/practice?fen=…`), an advantage
// card's drill (inside the game cards' session), and the review at the end, also reopened from the
// history (`#/games/history/<id>`): the accuracy, the graph, the moves, and the key moves to retry,
// see the line of, save as a practice mistake or make into a sequence.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { makeUci, parseSquare } from 'chessops/util';
import { isNormal, type Role, type SquareName } from 'chessops/types';
import type { Key } from '@lichess-org/chessground/types';
import { open } from '../app/mode.ts';
import { recordEvent } from '../app/state.ts';
import { practiceHistory, savedDeck } from '../app/games.ts';
import { claimVictory, gameOfHistory, loadOpponent, saveOpponent, judge, leavePractice, practice, practiceMove, practiceReview, startPractice, stopPractice, type Opponent, type PracticeGame, type PracticeMove } from '../app/practice.ts';
import { parseUciMove, standardUci } from '../core/chess/uci.ts';
import { makeFen } from 'chessops/fen';
import { CLASSIFICATION } from '../core/games/grade.ts';
import { PRACTICE } from '../core/games/practice.ts';
import { practiceMistakeItem, practiceMistakeSaved } from '../core/games/saved.ts';
import { gameCard } from '../core/progress/cards.ts';
import { positionOf } from '../core/storm/walk.ts';
import { Board } from './Board.tsx';
import { useWakeLock } from './Train.tsx';

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

export function MoveBoard(props: { fen: string; orientation: 'white' | 'black'; movable: boolean; lastUci?: string | undefined; arrows?: { orig: string; dest?: string; brush: string }[]; onMove(uci: string): void }) {
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
      <Board fen={props.fen} orientation={props.orientation} turn={pos.turn} dests={dests} lastMove={last} check={pos.isCheck()} shapes={[]} autoShapes={props.arrows ?? []} drawMode={false} brush="green" onMove={onMove} onShapes={() => undefined} />
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
  if (!p) return <p class="muted">Setting up…</p>;
  if (p.phase === 'over') return <PracticeReview game={p} onNext={props.onNext} />;
  const s = p.setup;
  const fen = p.moves.length ? p.moves[p.moves.length - 1]!.fen : s.fen;
  const last = p.moves[p.moves.length - 1];
  const lastUser = [...p.moves].reverse().find((m) => m.isUser);
  const cls = !s.silent && lastUser?.classification ? CLASSIFICATION[lastUser.classification] : undefined;
  const userMoves = p.moves.filter((m) => m.isUser).length;
  return (
    <div class="train-grid practice-game" data-phase={p.phase} data-moves={p.moves.length}>
      <MoveBoard fen={fen} orientation={s.color} movable={p.phase === 'user'} lastUci={last?.uci} onMove={(u) => void practiceMove(u)} />
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
        {p.source && !s.silent && <p class="muted">Opponent: {p.source}</p>}
        {p.note && <p class="muted">{p.note}</p>}
        <MoveList moves={p.moves} baseFen={s.fen} />
        <div class="actions train-actions">
          {p.claim && (
            <button type="button" onClick={claimVictory}>
              Claim victory
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

function MoveList(props: { moves: readonly PracticeMove[]; baseFen: string; at?: number; onAt?(i: number): void; keys?: ReadonlySet<number> }) {
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
          <span key={i} class={`game-move${props.at === i ? ' current' : ''}${props.keys?.has(i) ? ' item-mistake' : ''}`}>
            {label && <span class="muted">{label}</span>}
            {props.onAt ? (
              <button type="button" class="link" onClick={() => props.onAt!(i)}>
                {m.san}
              </button>
            ) : (
              m.san
            )}
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

function Graph(props: { game: PracticeGame; points: { idx: number; cp: number }[]; at: number; onAt(i: number): void }) {
  const pts = props.points;
  if (pts.length < 2) return null;
  const w = 600;
  const h = 100;
  const n = props.game.moves.length + 1;
  const x = (idx: number) => ((idx + 1) / Math.max(1, n - 1)) * w;
  const y = (cp: number) => h - h / (1 + Math.pow(10, -cp / 400));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.idx).toFixed(1)},${y(p.cp).toFixed(1)}`).join(' ');
  return (
    <svg
      class="eval-graph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="The evaluation through the game, from your side"
      onClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        props.onAt(Math.max(-1, Math.min(n - 2, Math.round(((e.clientX - r.left) / r.width) * (n - 1)) - 1)));
      }}
    >
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} class="eval-mid" />
      <path d={path} class="eval-line" fill="none" />
      <line x1={x(props.at)} x2={x(props.at)} y1="0" y2={h} class="eval-cursor" />
    </svg>
  );
}

export function PracticeReview(props: { game: PracticeGame; onNext?: (() => void) | undefined }) {
  const g = props.game;
  const review = useMemo(() => practiceReview(g), [g]);
  const [at, setAt] = useState(g.moves.length - 1);
  const [key, setKey] = useState<number | undefined>(undefined);
  const [retry, setRetry] = useState<{ i: number; tried?: string; word?: string; fen?: string } | undefined>(undefined);
  const [line, setLine] = useState<number | undefined>(undefined);
  const [savedNote, setSavedNote] = useState<string | undefined>(undefined);
  const s = g.setup;
  const fenAt = (i: number) => (i < 0 ? s.fen : g.moves[i]!.fen);
  const keys = new Set(review.keyMoves);
  const k = key !== undefined ? g.moves[key] : undefined;
  const board = retry ? (retry.fen ?? g.moves[retry.i]!.fenBefore) : k ? k.fenBefore : fenAt(at);
  const lastUci = retry?.tried ?? (k ? (key! > 0 ? g.moves[key! - 1]!.uci : undefined) : at >= 0 ? g.moves[at]!.uci : undefined);
  const arrows = line !== undefined && g.moves[line]?.bestMoveUci ? [{ orig: g.moves[line]!.bestMoveUci!.slice(0, 2), dest: g.moves[line]!.bestMoveUci!.slice(2, 4), brush: 'green' }] : [];
  const end = g.end;
  const tryMove = async (uci: string) => {
    if (!retry || retry.tried) return;
    const mv = g.moves[retry.i]!;
    const pos = positionOf(mv.fenBefore);
    const move = pos && parseUciMove(pos, uci);
    if (!pos || !move) return;
    pos.play(move);
    const fen = makeFen(pos.toSetup());
    setRetry({ i: retry.i, tried: uci, fen, word: 'Stockfish is judging…' });
    const j = await judge(mv.fenBefore, uci, fen);
    const cls = j?.classification ? CLASSIFICATION[j.classification] : undefined;
    setRetry({ i: retry.i, tried: uci, fen, word: cls ? `${cls.word}${j?.wpDrop ? ` · −${j.wpDrop}%` : ''}` : 'Stockfish couldn’t judge it.' });
  };
  const saveMistake = (i: number) => {
    const mv = g.moves[i]!;
    if (mv.wpDrop === undefined || mv.cpLoss === undefined || mv.bestCp === undefined) return;
    if (practiceMistakeSaved(savedDeck.value, mv.fenBefore, mv.san)) return setSavedNote('Already saved.');
    const item = practiceMistakeItem({ move: { fenBefore: mv.fenBefore, san: mv.san, uci: mv.uci, wpDrop: mv.wpDrop, cpLoss: mv.cpLoss, bestCp: mv.bestCp }, color: s.color, now: Date.now(), ...(g.historyId ? { from: `h|${g.historyId}` } : {}) });
    if (!item) return setSavedNote(`Only a move that gives up more than 2% is saved.`);
    void recordEvent({ t: new Date().toISOString(), k: 'saved', card: gameCard(item.pid), item: { ...item } });
    setSavedNote('Saved: it is in your game cards.');
  };
  return (
    <div class="train-grid practice-review" data-testid="practice-review">
      <MoveBoard fen={board} orientation={s.color} movable={!!retry && !retry.tried} lastUci={lastUci} arrows={arrows} onMove={(u) => void tryMove(u)} />
      <div class="train-panel">
        {end && (
          <p data-testid="practice-end">
            <strong>{END_WORD[end.reason]}</strong> {end.reason === 'interrupted' ? '' : `Counted as ${RESULT_WORD[end.result]}.`}
            {end.grade && <span class="muted"> Recorded: {GRADE_WORD[end.grade]}.</span>}
          </p>
        )}
        <p data-testid="practice-accuracy">
          {review.judged ? (
            <>
              Accuracy <strong>{review.accuracy}%</strong> over {review.judged} judged move{review.judged === 1 ? '' : 's'} · {review.keyMoves.length} key move{review.keyMoves.length === 1 ? '' : 's'}
            </>
          ) : g.judged ? (
            'No move could be judged.'
          ) : (
            'Stockfish is judging the moves…'
          )}
        </p>
        {g.historyId && <p class="muted">Kept in the history.</p>}
        <Graph game={g} points={review.evalPoints} at={k ? key! : at} onAt={(i) => (setKey(undefined), setRetry(undefined), setAt(i))} />
        <MoveList moves={g.moves} baseFen={s.fen} at={k ? key! : at} keys={keys} onAt={(i) => (setKey(undefined), setRetry(undefined), setLine(undefined), setAt(i))} />
        {review.keyMoves.length > 0 && (
          <ul class="game-items" data-testid="practice-keys">
            {review.keyMoves.map((i) => {
              const mv = g.moves[i]!;
              const cls = mv.classification ? CLASSIFICATION[mv.classification] : undefined;
              const dev = review.deviations.get(i);
              return (
                <li key={i} class={key === i ? 'current' : ''}>
                  <button type="button" class="link" onClick={() => (setKey(i), setRetry(undefined), setLine(undefined), setSavedNote(undefined))}>
                    {mv.san}
                  </button>{' '}
                  <span style={cls ? { color: cls.colour } : undefined}>{dev ? 'off the repertoire' : (cls?.word ?? '')}</span>
                  {mv.wpDrop ? <span class="muted"> −{mv.wpDrop}%</span> : null}
                  {key === i && (
                    <div class="actions">
                      <button type="button" class="secondary" onClick={() => (setRetry({ i }), setLine(undefined))}>
                        Retry
                      </button>
                      <button type="button" class="secondary" onClick={() => (setLine(i), setRetry(undefined))}>
                        Show the line
                      </button>
                      <button type="button" class="secondary" onClick={() => saveMistake(i)}>
                        Save as a mistake
                      </button>
                      <button type="button" class="secondary" onClick={() => open({ name: 'analysis', fen: mv.fenBefore, seq: '*' })}>
                        Make a sequence
                      </button>
                    </div>
                  )}
                  {key === i && retry?.word && <p role="status" data-testid="practice-retry">{retry.word}</p>}
                  {key === i && line === i && mv.bestLine && (
                    <p class="muted" data-testid="practice-line">
                      Best: {mv.bestLine.join(' ')}
                    </p>
                  )}
                  {key === i && savedNote && <p role="status">{savedNote}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <div class="actions">
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
  useEffect(() => {
    const pos = positionOf(props.fen);
    if (pos) startPractice({ kind: 'practice', fen: props.fen, color: props.side ?? pos.turn, silent: false, title: 'From a position', opponent });
    return () => leavePractice();
  }, [props.fen, props.side]);
  const ok = !!positionOf(props.fen);
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
          {entry && <span class="muted"> · {new Date(entry.ts).toISOString().slice(0, 10)} · {entry.openingName || entry.source}</span>}
        </div>
      </div>
      {game ? <PracticeReview game={game} /> : <p class="warn">That practice game isn’t in the history on this device.</p>}
    </div>
  );
}

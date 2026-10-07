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
import { claimVictory, clearPremove, detection, setFoundState, type FoundTactic, discardSaved, gameOfHistory, ignoreRepertoire, loadOpponent, practiceHint, resumePractice, savedPractice, saveOpponent, judge, leavePractice, practice, practiceMove, practiceReview, setPremove, startPractice, stopPractice, type Opponent, type PracticeGame, type PracticeMove } from '../app/practice.ts';
import { parseUciMove, standardUci } from '../core/chess/uci.ts';
import { makeFen } from 'chessops/fen';
import { CLASSIFICATION } from '../core/games/grade.ts';
import { PRACTICE } from '../core/games/practice.ts';
import { practiceMistakeItem, practiceMistakeSaved } from '../core/games/saved.ts';
import { practiceTacticItem, tacticSaved, type DetectedTactic } from '../core/games/detect.ts';
import { nextLine, playReply, playUser, repliesDue, startTactic, type TacticRun } from '../core/games/tactic.ts';
import { gameCard } from '../core/progress/cards.ts';
import { positionOf } from '../core/storm/walk.ts';
import { Board, type BoardProps } from './Board.tsx';
import { answerPending, repeatOpponent, setVoiceConfirm, voice, voiceConfirm, voiceOff, voiceOn } from '../app/voice.ts';
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

export function MoveBoard(props: { fen: string; orientation: 'white' | 'black'; movable: boolean; lastUci?: string | undefined; arrows?: { orig: string; dest?: string; brush: string }[]; onMove(uci: string): void; premove?: BoardProps['premove'] }) {
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
      <Board fen={props.fen} orientation={props.orientation} turn={pos.turn} dests={dests} lastMove={last} check={pos.isCheck()} shapes={[]} autoShapes={props.arrows ?? []} drawMode={false} brush="green" onMove={onMove} onShapes={() => undefined} {...(props.premove ? { premove: props.premove } : {})} />
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
  const [solving, setSolving] = useState<DetectedTactic | undefined>(undefined);
  const det = detection.value?.gen === g.gen && g.gen >= 0 ? detection.value : undefined;
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
  const saveTactic = (i: number, f: FoundTactic) => {
    if (tacticSaved(savedDeck.value, f.t)) return setFoundState(i, 'saved');
    const item = practiceTacticItem(f.t, { now: Date.now(), rand: Math.random().toString(36).slice(2, 7), ...(g.historyId ? { from: `h|${g.historyId}` } : {}) });
    if (!item) return;
    void recordEvent({ t: new Date().toISOString(), k: 'saved', card: gameCard(item.pid), item: { ...item } });
    setFoundState(i, 'saved');
  };
  if (solving) return <TacticSolver t={solving} onClose={() => setSolving(undefined)} />;
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
              const tried = review.corrected.has(i) ? mv.repTried?.san : undefined;
              return (
                <li key={i} class={key === i ? 'current' : ''}>
                  <button type="button" class="link" onClick={() => (setKey(i), setRetry(undefined), setLine(undefined), setSavedNote(undefined))}>
                    {mv.san}
                  </button>{' '}
                  <span style={cls && !dev ? { color: cls.colour } : undefined} class={dev ? 'rep-dev' : ''}>{tried ? `📖 corrected: you first tried ${tried}` : dev ? '📖 off the repertoire' : (cls?.word ?? '')}</span>
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
  // A game kept on this device (a reload, a switch of app) is offered first; one just resumed is played on.
  const [saved, setSaved] = useState(() => (practice.peek()?.phase !== 'over' && practice.peek()?.setup.fen === props.fen ? undefined : savedPractice()));
  const start = () => {
    const pos = positionOf(props.fen);
    if (pos) startPractice({ kind: 'practice', fen: props.fen, color: props.side ?? pos.turn, silent: false, title: 'From a position', opponent });
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
          {entry && <span class="muted"> · {new Date(entry.ts).toISOString().slice(0, 10)} · {entry.openingName || entry.source}</span>}
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

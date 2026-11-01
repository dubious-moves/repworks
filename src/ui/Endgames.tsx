// Endgames (PLAN.md §5.145): the theoretical endgames by group, each with its board, its task and
// where it stands (new, due, or solved n times running and when it comes back); and one played for
// its goal against Maia's defence checked by Stockfish (§5.147), or Stockfish's alone without Maia: a move that throws the goal away stops the game ("Kd5 lets the win
// slip") until it is taken back, the move that kept it a press away; the method, open before a
// first try and a press away after; the result and what it counted for. And the endgames of the
// user's own repertoire (§5.149): gathered from real games through the line ends, by category,
// played the same way.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { checkEndgameMaia, endgameMaiaHere, endgameStandings, startEndgame } from '../app/endgames.ts';
import { gatherRepEndgames, loadRepEndgames, removeRepEndgame, repById, repEndgames, repGather, repStandings, stopRepGather } from '../app/repertoireEndgames.ts';
import { maiaDialog } from '../app/maia.ts';
import { analyseFrom, entryKey, open } from '../app/mode.ts';
import { canTakeBack, leavePractice, parkPractice, playOnAfterSlip, practice, practiceHint, practiceMove, showSlipMove, stopPractice, takeBack, takeUpPractice, type PracticeGame } from '../app/practice.ts';
import { decidingNow } from '../app/time.ts';
import { CONVERT_LEAD, endgameById, ENDGAMES, GROUPS, MAIA_ELO, nextEndgame, sideOf, solvedBy, taskOf, type Endgame, type Standing } from '../core/endgames/endgames.ts';
import { asEndgame, CATEGORIES, categoryById, isRepertoireId, REP, type Category, type RepertoireEndgame } from '../core/endgames/repertoire.ts';
import { lineTail } from '../core/storm/sources.ts';
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
  if (props.id && isRepertoireId(props.id)) return <RepertoireDrill id={props.id} />;
  if (props.id) {
    const e = endgameById(props.id);
    return e ? <EndgameDrill key={e.id} endgame={e} /> : <EndgameList />;
  }
  return <EndgameList />;
}

/** A repertoire endgame's drill, once the kept list is read (an address opened cold). */
function RepertoireDrill(props: { id: string }) {
  useEffect(() => void loadRepEndgames(), []);
  if (!repEndgames.value) return <p class="muted">Setting up…</p>;
  const r = repById(props.id);
  return r ? <EndgameDrill key={r.id} endgame={asEndgame(r)} rep={r} /> : <EndgameList />;
}

function EndgameList() {
  const now = decidingNow();
  const standings = endgameStandings(now);
  const next = nextEndgame(standings);
  const due = ENDGAMES.filter((e) => standings.get(e.id)?.state === 'due').length;
  const fresh = ENDGAMES.filter((e) => standings.get(e.id)?.state === 'new').length;
  const soonest = Math.min(...ENDGAMES.map((e) => standings.get(e.id)?.next ?? Infinity));
  useEffect(checkEndgameMaia, []);
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
          The endgames every player needs, each played against a defence that sets the traps a strong player sets. A move that throws the goal away stops the game: take it
          back and find a better one. A try counts once, whatever happens after a take-back or a hint; a solved endgame comes back after 1, 3, 7, 14, 30 and 60 days.
        </p>
        <OpponentNote />
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
      <RepertoireEndgames now={now} />
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

/** Who the opponent is: Maia checked by Stockfish, or Stockfish alone with the offer of Maia. */
function OpponentNote() {
  const here = endgameMaiaHere.value;
  if (here === undefined) return null;
  return (
    <p class="muted endgame-opponent" data-testid="endgame-opponent">
      {here ? (
        <>The opponent: Maia {MAIA_ELO} plays the move a strong player would try, among the moves Stockfish finds sound.</>
      ) : (
        <>
          The opponent: Stockfish alone. It knows a lost position is lost whichever move it plays, so it often plays one that sets no problem; Maia plays the testing move a strong
          player would try.{' '}
          <button type="button" class="link" onClick={() => (maiaDialog.value = true)}>
            Get Maia…
          </button>
        </>
      )}
    </p>
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

/* ------------------------------------------------------------------ the repertoire's endgames (§5.149) */

const CAT_KEY = 'repworks-endgames-category';
function readCat(): Category | 'all' {
  try {
    const c = localStorage.getItem(CAT_KEY);
    return c && categoryById(c) ? (c as Category) : 'all';
  } catch {
    return 'all';
  }
}
/** Items shown before "Show all". */
const REP_SHOWN = 12;
const STATE_RANK = { due: 0, new: 1, later: 2 } as const;

function RepertoireEndgames(props: { now: number }) {
  useEffect(() => void loadRepEndgames(), []);
  const [cat, setCat] = useState<Category | 'all'>(readCat);
  const [all, setAll] = useState(false);
  const list = repEndgames.value;
  const g = repGather.value;
  if (!list) return null;
  const standings = repStandings(props.now);
  const stateOf = (r: RepertoireEndgame) => standings.get(r.id)?.state ?? 'new';
  const shown = cat === 'all' ? list : list.filter((r) => r.category === cat);
  // What to play first at the top: due, then new, then the rest, each in the list's order.
  const ordered = [...shown].sort((a, b) => STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)]);
  const next = nextEndgame(standings, undefined, shown);
  const due = shown.filter((r) => stateOf(r) === 'due').length;
  const fresh = shown.filter((r) => stateOf(r) === 'new').length;
  const choose = (c: Category | 'all') => {
    setCat(c);
    setAll(false);
    try {
      localStorage.setItem(CAT_KEY, c);
    } catch {
      // Not kept: the choice is a convenience.
    }
  };
  return (
    <section class="card endgame-group endgame-repertoire" aria-labelledby="endgame-group-repertoire" data-testid="endgame-repertoire">
      <h2 id="endgame-group-repertoire">From your repertoire</h2>
      <p class="muted">
        Endgames reached in real games through your line ends (Lichess’s explorer): the first quiet moment of each game’s endgame with you to move, at most four pieces besides
        the kings and pawns. Where Stockfish has you +3 or better, win it: queen a pawn or go {CONVERT_LEAD} points up. Where it’s about level (−1 to +1.5), hold it for{' '}
        {REP.hold} moves.
      </p>
      <div class="actions">
        {g?.running ? (
          <button type="button" class="secondary" onClick={stopRepGather}>
            Stop
          </button>
        ) : (
          <button type="button" class={list.length ? 'secondary' : 'primary'} onClick={() => void gatherRepEndgames()} title="Walks the games the explorer names at each of your line ends to their endgames">
            {list.length ? 'Gather more' : 'Gather from your repertoire'}
          </button>
        )}
        {next && (
          <a class="button primary" href={`#/endgames/${next.id}`} data-testid="rep-endgame-next">
            {stateOf(next) === 'due' ? 'Next due' : 'Next new'}: {next.title}
          </a>
        )}
        {list.length > 0 && (
          <span class="muted" data-testid="rep-endgame-counts">
            {shown.length} kept · {due} due · {fresh} new
          </span>
        )}
      </div>
      {g && (
        <p class="muted" role="status" data-testid="rep-endgame-gather">
          {g.running ? `Walking your line ends: ${g.ends} of ${g.of} · ${g.games} games read · ${g.kept} kept` : g.note}
        </p>
      )}
      {list.length > 0 && (
        <div class="chips endgame-cats" role="group" aria-label="Category">
          <button type="button" class={`chip-toggle${cat === 'all' ? ' on' : ''}`} aria-pressed={cat === 'all'} onClick={() => choose('all')}>
            All <span class="storm-focus-n">{list.length}</span>
          </button>
          {CATEGORIES.map((c) => {
            const n = list.filter((r) => r.category === c.id).length;
            return (
              <button type="button" key={c.id} class={`chip-toggle${cat === c.id ? ' on' : ''}`} aria-pressed={cat === c.id} disabled={!n && cat !== c.id} onClick={() => choose(c.id)}>
                {c.title} <span class="storm-focus-n">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {ordered.length > 0 && (
        <ul class="endgame-list">
          {ordered.slice(0, all ? undefined : REP_SHOWN).map((r) => (
            <RepItem key={r.id} rep={r} standing={standings.get(r.id)!} now={props.now} />
          ))}
        </ul>
      )}
      {ordered.length > REP_SHOWN && !all && (
        <button type="button" class="link" onClick={() => setAll(true)}>
          Show all {ordered.length}
        </button>
      )}
    </section>
  );
}

/** Where a kept endgame comes from: its chapter, the line's last moves, and the game. */
function sourceText(r: RepertoireEndgame): string {
  const line = r.lines[0];
  const tail = line ? lineTail(line.path) : '';
  return `${r.names[0] ?? 'Your repertoire'}${tail ? `, ${tail}` : ''}`;
}

function RepItem(props: { rep: RepertoireEndgame; standing: Standing; now: number }) {
  const r = props.rep;
  const s = props.standing;
  const e = asEndgame(r);
  const pos = useMemo(() => positionOf(r.fen), [r.fen]);
  return (
    <li class={`endgame-item state-${s.state}`} data-endgame={r.id} data-category={r.category}>
      <a class="endgame-board" href={`#/endgames/${r.id}`} aria-label={`Play ${r.title}`} tabIndex={-1}>
        {pos && <MiniBoard position={pos} orientation={r.side} />}
      </a>
      <div class="endgame-text">
        <a class="endgame-title" href={`#/endgames/${r.id}`}>
          {r.title}
        </a>
        <span class="muted">{taskOf(e)}</span>
        <span class="muted endgame-source">{sourceText(r)}</span>
        <span class={`endgame-standing state-${s.state}`} data-testid="endgame-standing">
          {standingText(s, props.now)} <Marks marks={s.last} />
        </span>
        <button type="button" class="link endgame-remove" title="Take it off the list: its tries stay counted" onClick={() => void removeRepEndgame(r.id)}>
          Remove
        </button>
      </div>
    </li>
  );
}

/** A repertoire endgame's drill: where it comes from, and the score it started with. */
function RepSource(props: { rep: RepertoireEndgame }) {
  const r = props.rep;
  const g = r.game;
  const players = g.white && g.black ? `${g.white}–${g.black}` : '';
  const score = (r.cp >= 0 ? '+' : '') + (r.cp / 100).toFixed(2);
  return (
    <p class="muted endgame-source" data-testid="endgame-source">
      From {sourceText(r)}: {players ? `${players}, ` : ''}move {g.move}, {Math.round(g.ply / 2)} moves after your line’s end{r.san ? ` (after ${r.san})` : ''}. Stockfish at the start: {score}.
      {g.id && (
        <>
          {' '}
          <a href={`https://lichess.org/${g.id}`} target="_blank" rel="noopener noreferrer">
            The game
          </a>
        </>
      )}
    </p>
  );
}

function RepNextButton(props: { after: string; primary: boolean }) {
  const list = repEndgames.value ?? [];
  const r = list.find((x) => x.id === props.after);
  const among = r ? list.filter((x) => x.category === r.category) : list;
  const next = nextEndgame(repStandings(decidingNow()), props.after, among) ?? nextEndgame(repStandings(decidingNow()), props.after, list);
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

/* ------------------------------------------------------------------ one endgame, played */

const GOAL_WORD = { win: 'the win', draw: 'the draw' } as const;

function EndgameDrill(props: { endgame: Endgame; rep?: RepertoireEndgame }) {
  const e = props.endgame;
  // Come back to from the analysis board: the try played on where it was left.
  const [entry] = useState(entryKey);
  const [resumed] = useState(() => takeUpPractice(entry));
  const standing = (props.rep ? repStandings(decidingNow()) : endgameStandings(decidingNow())).get(e.id);
  // A repertoire endgame's technique is general: folded, its source open instead.
  const [method, setMethod] = useState(!props.rep && standing?.state === 'new');
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
          <span class="study-title">
            {props.rep ? `${categoryById(props.rep.category)?.title ?? 'Endgame'} · ${e.title}` : `Endgame · ${e.title}`}
          </span>
        </div>
      </div>
      {p ? <EndgameGame game={p} endgame={e} rep={props.rep} method={method} onMethod={setMethod} /> : <p class="muted">Setting up…</p>}
    </div>
  );
}

function EndgameGame(props: { game: PracticeGame; endgame: Endgame; rep?: RepertoireEndgame | undefined; method: boolean; onMethod(on: boolean): void }) {
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
          : `${endgameMaiaHere.value ? 'Maia' : 'Stockfish'} is thinking…`;
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
              {props.rep ? <RepNextButton after={e.id} primary={!!solved} /> : <NextButton after={e.id} primary={!!solved} />}
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
        {props.rep && <RepSource rep={props.rep} />}
        <details class="endgame-method" open={props.method} onToggle={(ev) => props.onMethod((ev.target as HTMLDetailsElement).open)}>
          <summary>{props.rep ? `Technique: ${categoryById(props.rep.category)?.title ?? 'endgames'}` : 'The method'}</summary>
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
      if (e.goal === 'draw') return `Held for ${n} moves: the draw is safe.`;
      if (e.until === 'bare') return 'The pawn has fallen: the rest is a queen mate.';
      if (e.until === 'convert' && p.moves.at(-1)?.uci.length !== 5) return `${CONVERT_LEAD} points of material ahead: the win is home.`;
      return 'The pawn queens: the win is yours.';
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

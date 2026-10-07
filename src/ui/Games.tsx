// The games (PLAN.md §5.54, §5.55): the games kept on this device with their filters and the
// day's game cards; one game on the board with its evaluation graph and its items; and the game
// cards' session (the mistake trainer). mistake-lab's Games and Review tabs, on the site's SRS.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { makeUci, parseSquare } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import type { Role, SquareName } from 'chessops/types';
import { open } from '../app/mode.ts';
import { recordEvent } from '../app/state.ts';
import { trainData } from '../app/train.ts';
import { forgetGames, gameById, gameDeck, gameQueueNow, gameRows, gamesPrefs, refreshGames, refreshState, setGamesPrefs, startGames, type GameFilters, type GameRow, type Since } from '../app/games.ts';
import { continueSession, dropCard, dropLine, endGameSession, gameSession, hint, hintMove, MAX_TRIES, playMove, revealBest, skipCard, startGameSession, tryAgain, type CardRun, type GameSession } from '../app/gameTrainer.ts';
import { cpFor, type GameItem } from '../core/games/extract.ts';
import { dropsOf } from '../core/games/deck.ts';
import { CLASSIFICATION } from '../core/games/grade.ts';
import { replay } from '../core/games/positions.ts';
import { resultFor, type GameRecord } from '../core/games/record.ts';
import { gameCard } from '../core/progress/cards.ts';
import { positionOf } from '../core/storm/walk.ts';
import { Board } from './Board.tsx';
import { useWakeLock } from './Train.tsx';

const sq = (u: string, i: number) => u.slice(i, i + 2) as SquareName;
const KIND_WORD: Record<GameItem['kind'], string> = { mistake: 'Mistake', tactic: 'Tactic', advantage: 'Advantage' };
const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

export function GamesScreen(props: { id?: string; ply?: number; review?: boolean }) {
  useEffect(() => startGames(), []);
  return (
    <div class="games">
      <div class="chapter-head">
        <a
          href={props.id || props.review ? '#/games' : '#/'}
          class="back"
          onClick={(e) => {
            e.preventDefault();
            if (props.review) endGameSession();
            open(props.id || props.review ? { name: 'games' } : { name: 'list' });
          }}
        >
          ←
        </a>
        <div class="titles">
          <span class="study-title">{props.review ? 'Game cards' : props.id ? 'Game' : 'Games'}</span>
        </div>
      </div>
      {props.review ? <Review /> : props.id ? <GameView id={props.id} ply={props.ply} /> : <Home />}
    </div>
  );
}

/* ------------------------------------------------------------------ the home: cards, sources, filters, the list */

function passes(row: GameRow, f: GameFilters): boolean {
  const g = row.game;
  if (f.color && g.color !== f.color) return false;
  if (f.speed.length && !f.speed.includes(g.speed)) return false;
  if (f.rated && g.rated !== (f.rated === 'rated')) return false;
  if (f.platform && g.platform !== f.platform) return false;
  return true;
}

function Home() {
  const rows = gameRows.value;
  const prefs = gamesPrefs.value;
  const f = prefs.filters;
  const [limit, setLimit] = useState(50);
  const deck = gameDeck.value;
  const queue = trainData.value ? gameQueueNow() : undefined;
  const inDeck = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of deck) m.set(c.item.gameId, (m.get(c.item.gameId) ?? 0) + 1);
    return m;
  }, [deck]);
  const shown = (rows ?? []).filter((r) => passes(r, f));
  const filter = (patch: Partial<GameFilters>) => setGamesPrefs({ filters: { ...f, ...patch } });
  return (
    <>
      <section class="card games-cards">
        <div class="card-head">
          <h2>Game cards</h2>
          <div class="actions">
            <a class={`button${queue && queue.due.length + queue.fresh.length ? '' : ' disabled'}`} href="#/games/review" aria-disabled={!queue || !(queue.due.length + queue.fresh.length)}>
              Review
            </a>
          </div>
        </div>
        <p data-testid="games-queue">
          {queue ? (
            <>
              <strong>{queue.due.length}</strong> due · <strong>{queue.fresh.length}</strong> new today{queue.waiting ? ` · ${queue.waiting} more new waiting` : ''} · {deck.length} in all
            </>
          ) : (
            'Reading…'
          )}
        </p>
      </section>
      <Sources />
      <section class="card">
        <div class="card-head">
          <h2>Games</h2>
          <span class="muted" data-testid="games-count">
            {rows ? `${shown.length} of ${rows.length}` : 'Reading…'}
          </span>
        </div>
        <div class="games-filters">
          <select aria-label="Colour" value={f.color} onChange={(e) => filter({ color: (e.target as HTMLSelectElement).value as GameFilters['color'] })}>
            <option value="">Both colours</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
          <select aria-label="Rated" value={f.rated} onChange={(e) => filter({ rated: (e.target as HTMLSelectElement).value as GameFilters['rated'] })}>
            <option value="">Rated and casual</option>
            <option value="rated">Rated</option>
            <option value="casual">Casual</option>
          </select>
          <select aria-label="Platform" value={f.platform} onChange={(e) => filter({ platform: (e.target as HTMLSelectElement).value as GameFilters['platform'] })}>
            <option value="">Lichess and chess.com</option>
            <option value="lichess">Lichess</option>
            <option value="chesscom">chess.com</option>
          </select>
          {SPEEDS.map((sp) => (
            <label key={sp} class="chip">
              <input type="checkbox" checked={f.speed.includes(sp)} onChange={(e) => filter({ speed: (e.target as HTMLInputElement).checked ? [...f.speed, sp] : f.speed.filter((x) => x !== sp) })} /> {sp}
            </label>
          ))}
        </div>
        {rows && rows.length === 0 && <p class="muted">No games on this device yet: set up a source above, then Refresh.</p>}
        <ul class="games-list">
          {shown.slice(0, limit).map((r) => (
            <GameRowView key={r.game.id} row={r} cards={inDeck.get(r.game.id) ?? 0} />
          ))}
        </ul>
        {shown.length > limit && (
          <button type="button" class="secondary" onClick={() => setLimit(limit + 50)}>
            Show more
          </button>
        )}
      </section>
    </>
  );
}

const RESULT_WORD = { win: 'Won', loss: 'Lost', draw: 'Drawn' } as const;
const opponentOf = (g: GameRecord) => (g.color === 'white' ? g.black : g.white);

function GameRowView(props: { row: GameRow; cards: number }) {
  const g = props.row.game;
  const opp = opponentOf(g);
  const counts = { mistake: 0, tactic: 0, advantage: 0 };
  for (const it of props.row.items) counts[it.kind]++;
  const result = resultFor(g);
  return (
    <li class={`games-row result-${result}`}>
      <a href={`#/games/${g.id}`} data-testid="game-row">
        <span class="games-date">{new Date(g.createdAt).toISOString().slice(0, 10)}</span>
        <span class={`games-side side-${g.color}`} title={g.color === 'white' ? 'You played White' : 'You played Black'} />
        <span class="games-opp">
          {opp.name}
          {opp.rating ? ` (${opp.rating})` : ''}
        </span>
        <span class="games-result">{RESULT_WORD[result]}</span>
        <span class="muted games-speed">{g.speed}</span>
        <span class="muted games-opening">{g.opening ?? ''}</span>
        <span class="games-items" title={`${counts.mistake} mistakes, ${counts.tactic} tactics, ${counts.advantage} advantages; ${props.cards} in the deck`}>
          {g.evals ? [counts.mistake ? `${counts.mistake}✗` : '', counts.tactic ? `${counts.tactic}⚡` : '', counts.advantage ? `${counts.advantage}♛` : ''].filter(Boolean).join(' ') || '—' : <span class="muted">not analysed</span>}
        </span>
      </a>
    </li>
  );
}

function Sources() {
  const prefs = gamesPrefs.value;
  const st = refreshState.value;
  const [open_, setOpen] = useState(!prefs.gist && !prefs.lichess && !prefs.chesscom);
  const input = (key: 'gist' | 'lichess' | 'chesscom', label: string, hint_: string) => (
    <label>
      {label}
      <input type="text" value={prefs[key]} placeholder={hint_} autocomplete="off" spellcheck={false} onChange={(e) => setGamesPrefs({ [key]: (e.target as HTMLInputElement).value.trim() } as Partial<typeof prefs>)} />
    </label>
  );
  return (
    <section class="card games-sources">
      <div class="card-head">
        <h2>Sources</h2>
        <div class="actions">
          <button type="button" class="secondary" onClick={() => setOpen(!open_)} aria-expanded={open_}>
            {open_ ? 'Hide' : 'Set up'}
          </button>
          <button type="button" disabled={st.running} onClick={() => void refreshGames()}>
            {st.running ? 'Reading…' : 'Refresh'}
          </button>
        </div>
      </div>
      {open_ && (
        <div class="games-setup">
          {input('gist', 'mistake-lab’s gist', 'its ID or address')}
          {input('lichess', 'Lichess name', 'your Lichess username')}
          {input('chesscom', 'chess.com name', 'your chess.com username')}
          <label>
            Games from
            <select value={prefs.since} onChange={(e) => setGamesPrefs({ since: (e.target as HTMLSelectElement).value as Since })}>
              <option value="all">all time</option>
              <option value="3">the last 3 months</option>
              <option value="6">the last 6 months</option>
              <option value="12">the last year</option>
              <option value="24">the last 2 years</option>
            </select>
          </label>
          <label>
            New game cards a day
            <input type="number" min={0} max={200} value={prefs.newPerDay} onChange={(e) => setGamesPrefs({ newPerDay: Math.max(0, Math.min(200, Number((e.target as HTMLInputElement).value) || 0)) })} />
          </label>
          <p class="muted">
            The gist is read only, as mistake-lab reads it: the analyzer keeps writing its games there. Lichess’s own games come in too (with its analysis where you asked Lichess for one); chess.com’s only through the analyzer if chess.com doesn’t answer this page.{' '}
            <button type="button" class="link" onClick={() => void forgetGames()}>
              Forget the games on this device
            </button>
          </p>
        </div>
      )}
      {st.lines.length > 0 && (
        <ul class="games-status" role="status" data-testid="games-status">
          {st.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ one game */

function EvalGraph(props: { game: GameRecord; ply: number; items: readonly GameItem[]; onPly(p: number): void }) {
  const evals = props.game.evals ?? [];
  if (!evals.length) return null;
  const w = 600;
  const h = 120;
  const n = evals.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / n) * w);
  // The user's side up, clamped to ±10 pawns, as a win chance.
  const y = (cp: number) => h - (h * (100 / (1 + Math.pow(10, -cp / 400)))) / 100;
  const pts = evals.map((e, i) => `${x(i + 1).toFixed(1)},${y(cpFor(e, props.game.color)).toFixed(1)}`);
  const path = `M0,${(h / 2).toFixed(1)} L${pts.join(' L')}`;
  return (
    <svg
      class="eval-graph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="The evaluation through the game, from your side"
      onClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        props.onPly(Math.max(0, Math.min(n, Math.round(((e.clientX - r.left) / r.width) * n))));
      }}
    >
      <line x1="0" x2={w} y1={h / 2} y2={h / 2} class="eval-mid" />
      <path d={`${path} L${x(n)},${h} L0,${h} Z`} class="eval-area" />
      <path d={path} class="eval-line" fill="none" />
      {props.items.map((it) => (
        <line key={it.pid} x1={x(it.ply)} x2={x(it.ply)} y1="0" y2={h} class={`eval-item item-${it.kind}`} />
      ))}
      <line x1={x(props.ply)} x2={x(props.ply)} y1="0" y2={h} class="eval-cursor" />
    </svg>
  );
}

function GameView(props: { id: string; ply?: number }) {
  const row = gameById.value.get(props.id);
  const played = useMemo(() => (row ? replay(row.game) : undefined), [row]);
  const [ply, setPlyState] = useState(props.ply ?? 0);
  const total = played?.plies.length ?? 0;
  const setPly = (p: number) => setPlyState(Math.max(0, Math.min(total, p)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') setPly(ply - 1);
      else if (e.key === 'ArrowRight') setPly(ply + 1);
      else if (e.key === 'Home') setPly(0);
      else if (e.key === 'End') setPly(total);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ply, total]);
  if (!gameRows.value) return <p class="muted">Reading the games…</p>;
  if (!row || !played) return <p class="warn">This game isn’t on this device.</p>;
  const g = row.game;
  const fen = ply === 0 ? (played.plies[0]?.fenBefore ?? played.finalFen) : ply < total ? played.plies[ply]!.fenBefore : played.finalFen;
  const last = ply > 0 ? played.plies[ply - 1]!.uci : undefined;
  const pos = positionOf(fen);
  const data = trainData.value;
  const itemAt = new Map(row.items.map((it) => [it.ply, it]));
  const opp = opponentOf(g);
  return (
    <div class="train-grid game-view" data-ply={ply}>
      <div class="train-board">
        <Board fen={fen} orientation={g.color} turn={pos?.turn ?? 'white'} dests={new Map()} lastMove={last ? [sq(last, 0) as Key, sq(last, 2) as Key] : undefined} check={!!pos?.isCheck()} shapes={[]} drawMode={false} brush="green" onMove={() => undefined} onShapes={() => undefined} />
        <div class="actions move-buttons">
          <button type="button" class="secondary" aria-label="Start" onClick={() => setPly(0)}>
            ⏮
          </button>
          <button type="button" class="secondary" aria-label="Back" onClick={() => setPly(ply - 1)}>
            ◀
          </button>
          <button type="button" class="secondary" aria-label="Forward" onClick={() => setPly(ply + 1)}>
            ▶
          </button>
          <button type="button" class="secondary" aria-label="End" onClick={() => setPly(total)}>
            ⏭
          </button>
        </div>
      </div>
      <div class="train-panel">
        <p>
          <strong>
            {g.white.name}
            {g.white.rating ? ` (${g.white.rating})` : ''} – {g.black.name}
            {g.black.rating ? ` (${g.black.rating})` : ''}
          </strong>{' '}
          <span class="muted">
            · {RESULT_WORD[resultFor(g)]} · {g.speed} · {new Date(g.createdAt).toISOString().slice(0, 10)} · against {opp.name}
          </span>
        </p>
        {g.opening && <p class="muted">{g.opening}</p>}
        <EvalGraph game={g} ply={ply} items={row.items} onPly={setPly} />
        <div class="game-moves" data-testid="game-moves">
          {played.plies.map((p) => {
            const it = itemAt.get(p.ply);
            return (
              <span key={p.ply} class={`game-move${p.ply === ply ? ' current' : ''}${it ? ` item-${it.kind}` : ''}`}>
                {p.turn === 'white' ? <span class="muted">{Math.ceil(p.ply / 2)}. </span> : null}
                <button type="button" class="link" onClick={() => setPly(p.ply)}>
                  {p.san}
                </button>{' '}
              </span>
            );
          })}
        </div>
        <ul class="game-items">
          {row.items.map((it) => {
            const card = gameCard(it.pid);
            const dropped = data ? dropsOf(data.eventsOf(card)).dropped : false;
            return (
              <li key={it.pid} class={`item-${it.kind}${dropped ? ' dropped' : ''}`} data-testid="game-item">
                <button type="button" class="link" onClick={() => setPly(it.ply - 1)}>
                  {KIND_WORD[it.kind]} at move {Math.ceil(it.ply / 2)}
                  {it.kind === 'mistake' ? ` (${it.san}, −${it.wpDrop}%)` : it.kind === 'advantage' ? ` (+${(it.peakCp / 100).toFixed(1)})` : ''}
                </button>{' '}
                <button type="button" class="link" onClick={() => void recordEvent({ t: new Date().toISOString(), k: 'drop', card, on: !dropped })}>
                  {dropped ? 'Put back' : 'Drop'}
                </button>
              </li>
            );
          })}
        </ul>
        <div class="actions">
          <button type="button" class="secondary" onClick={() => open({ name: 'analysis', fen })}>
            Analyse this position
          </button>
          {g.platform === 'lichess' && !g.id.startsWith('_') && (
            <a class="button secondary" href={`https://lichess.org/${g.id}${ply ? `#${ply}` : ''}`} target="_blank" rel="noopener">
              On Lichess
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the game cards' session */

function PlayBoard(props: { run: CardRun; asking: boolean; arrows: { orig: string; dest?: string; brush: string }[] }) {
  const r = props.run;
  const pos = useMemo(() => positionOf(r.board)!, [r.board]);
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  const dests = props.asking ? (chessgroundDests(pos) as Map<Key, Key[]>) : new Map<Key, Key[]>();
  const last = r.lastUci ? ([sq(r.lastUci, 0), sq(r.lastUci, 2)] as [Key, Key]) : undefined;
  const onMove = (orig: Key, dest: Key) => {
    const piece = pos.board.get(parseSquare(orig)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    playMove(makeUci(normalizeMove(pos, { from: parseSquare(orig)!, to: parseSquare(dest)! })));
  };
  return (
    <div class="train-board">
      <Board fen={r.board} orientation={r.card.item.color} turn={pos.turn} dests={dests} lastMove={last} check={pos.isCheck()} shapes={[]} autoShapes={props.arrows} drawMode={false} brush="green" onMove={onMove} onShapes={() => undefined} />
      {promotion && (
        <div class="promotion" role="dialog" aria-label="Promote to">
          {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => {
                playMove(makeUci({ from: parseSquare(promotion.orig)!, to: parseSquare(promotion.dest)!, promotion: role }));
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

const GRADE_WORD = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;

function Review() {
  const s = gameSession.value;
  useEffect(() => {
    if (!gameSession.value) startGameSession();
    return () => endGameSession();
  }, []);
  useWakeLock(!!s && s.phase !== 'done');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = gameSession.value;
      if (!st || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'h') hint();
      else if (e.key === 't') tryAgain();
      else if (e.key === 'n' && st.phase !== 'asking' && st.phase !== 'judging' && st.phase !== 'reply') continueSession();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!s) return <p class="muted">Dealing…</p>;
  if (s.phase === 'done') return <Done s={s} />;
  const r = s.run!;
  return <Card s={s} r={r} />;
}

function Done(props: { s: GameSession }) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const g of props.s.results.values()) counts[g]++;
  return (
    <section class="card" data-testid="games-done">
      <h2>{props.s.cards.length ? 'Done for now' : 'Nothing to review'}</h2>
      <p>
        {props.s.results.size} card{props.s.results.size === 1 ? '' : 's'} answered
        {props.s.results.size ? `: ${counts[4]} easy, ${counts[3]} good, ${counts[2]} hard, ${counts[1]} again` : ''}.
      </p>
      {props.s.message && <p class="muted">{props.s.message}</p>}
      <a class="button" href="#/games">
        Back to the games
      </a>
    </section>
  );
}

function Card(props: { s: GameSession; r: CardRun }) {
  const { s, r } = props;
  const item = r.card.item;
  const game = gameById.value.get(item.gameId)?.game;
  const asking = s.phase === 'asking';
  const hm = hintMove(r);
  const arrows: { orig: string; dest?: string; brush: string }[] = [];
  if (r.hint === 1 && hm) arrows.push({ orig: hm.slice(0, 2), brush: 'blue' });
  if ((r.hint === 2 || r.revealed) && hm) arrows.push({ orig: hm.slice(0, 2), dest: hm.slice(2, 4), brush: r.revealed ? 'green' : 'blue' });
  const j = r.judged;
  const cls = j ? CLASSIFICATION[j.classification] : undefined;
  const graded = s.results.get(r.card.card);
  const prompt = item.kind === 'tactic' ? 'Find the tactic' : item.kind === 'mistake' ? `Find a better move than ${item.san}` : '';
  return (
    <div class="train-grid game-card" data-phase={s.phase} data-card={r.card.card} data-kind={item.kind} data-step={r.tactic?.played.length ?? (r.lastUci ? 1 : 0)}>
      <PlayBoard run={r} asking={asking} arrows={arrows} />
      <div class="train-panel">
        <p class="train-counters">
          {s.index + 1} of {s.cards.length} · {KIND_WORD[item.kind]}
          {game ? ` · ${game.speed} against ${opponentOf(game).name}` : ''}
        </p>
        <p class="train-line">
          <strong>{prompt}</strong> <span class="muted">· move {Math.ceil(item.ply / 2)}</span>
        </p>
        <p class="feedback train-feedback" role="status" data-testid="game-feedback" style={cls ? { color: cls.colour } : undefined}>
          {s.phase === 'judging'
            ? 'Stockfish is judging…'
            : s.phase === 'reply'
              ? 'The opponent answers…'
              : s.phase === 'unjudged'
                ? 'Stockfish couldn’t judge the move: nothing is graded.'
                : s.phase === 'right'
                  ? item.kind === 'tactic'
                    ? 'Solved'
                    : `${cls?.word ?? 'Good'}${j && !j.exactBest ? ` · −${j.wpDrop}%` : ''}`
                  : s.phase === 'wrong'
                    ? item.kind === 'tactic'
                      ? 'Not this one'
                      : `${cls?.word ?? 'Not this one'}${j ? ` · −${j.wpDrop}%` : ''}${r.tries < MAX_TRIES ? '' : ' · three tries'}`
                    : asking
                      ? s.message && item.kind === 'tactic' && r.tactic?.solved.length
                        ? s.message
                        : 'Your move'
                      : ''}
        </p>
        {(r.revealed || s.phase === 'right') && r.bestSan && item.kind === 'mistake' && (
          <p class="muted" data-testid="game-best">
            Best: {r.bestSan}
            {r.bestLine && r.bestLine.length > 1 ? ` (${r.bestLine.join(' ')})` : ''} · played in the game: {item.san}
          </p>
        )}
        {graded && <p class="muted">Recorded: {GRADE_WORD[graded]}</p>}
        <div class="actions train-actions">
          {asking && (
            <button type="button" class="secondary" onClick={hint} disabled={r.hint >= 2 || !hm}>
              Hint
            </button>
          )}
          {s.phase === 'wrong' && !r.revealed && (
            <button type="button" onClick={tryAgain}>
              Try again
            </button>
          )}
          {s.phase === 'wrong' && !r.revealed && (
            <button type="button" class="secondary" onClick={revealBest}>
              Show the move
            </button>
          )}
          {(s.phase === 'right' || r.revealed || s.phase === 'unjudged') && (
            <button type="button" onClick={continueSession}>
              Next
            </button>
          )}
          {(asking || s.phase === 'wrong') && !graded && (
            <button type="button" class="secondary" onClick={skipCard}>
              Skip
            </button>
          )}
          {game && (
            <a class="button secondary" href={`#/games/${game.id}?ply=${item.ply - 1}`}>
              View the game
            </a>
          )}
          <button type="button" class="secondary" onClick={() => open({ name: 'analysis', fen: r.board })}>
            Analyse
          </button>
          {item.kind === 'tactic' && (r.tactic?.lines.length ?? 0) > 1 && (
            <button type="button" class="secondary" onClick={dropLine} title="Take this line out of the tactic">
              Drop this line
            </button>
          )}
          <button type="button" class="secondary" onClick={dropCard} title="Take this item out of the deck">
            Drop
          </button>
        </div>
      </div>
    </div>
  );
}

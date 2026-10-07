// The storm's screen (PLAN.md §5.42–§5.46): its home (the scope, the positions kept on this
// device, Gather, Start, the record), a card (the board, the clock, the verdict), and the review
// (every position, the best move behind a press, Try again, Analyse). Neither the engine panel nor
// the explorer is on this screen: during a card they would name the answer.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { makeUci, parseSquare } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import type { Role, SquareName } from 'chessops/types';
import { open } from '../app/mode.ts';
import { dataVersion } from '../app/sync.ts';
import { trainData } from '../app/train.ts';
import {
  answerMove,
  clockLeft,
  endStorm,
  deepen,
  deepening,
  gather,
  gathering,
  leaveStorm,
  nextCard,
  recordOf,
  refreshHome,
  retryFromReview,
  scopeData,
  setStormPrefs,
  showMove,
  startStorm,
  stopGathering,
  stormHome,
  stormPrefs,
  stormSession,
  toggleShown,
  tryAgain,
  puzzleFen,
  type StormItem,
  type StormScopeData,
  type StormSession,
  type StormWhere,
} from '../app/storm.ts';
import { STORM } from '../core/storm/config.ts';
import { averageWp, blankRow, foundShare, recordOver, type RecordRow } from '../core/storm/record.ts';
import { setTally } from '../core/storm/set.ts';
import { bestLine, formatWp, gapNote, sourceTitle, verdictLine, type CardFacts } from '../core/storm/verdict.ts';
import { storedList, type StoredPosition } from '../core/storm/harvest.ts';
import { positionOf, uciToSan } from '../core/storm/walk.ts';
import { themeLabel } from '../core/puzzles/dataset.ts';
import { Board } from './Board.tsx';
import { useWakeLock } from './Train.tsx';
import { collect, fillBodies, puzzlePrefs, puzzleState, refreshPuzzles, setPuzzlePrefs, SHARD_MB, SHARES, SHARDS_PER_COLLECT, stopPuzzles, WORKING_SET } from '../app/puzzles.ts';

const PUZZLE_WORD: Record<string, string> = { great: 'Solved', blunder: 'Not the solution', unanswered: 'Not answered' };

/** What a puzzle says once answered: its rating, how deep its game went into the line, its themes. */
function puzzleFacts(p: NonNullable<StormItem['puzzle']>): string {
  const bits = ['Lichess puzzle'];
  if (p.rating) bits.push(`rated ${p.rating}`);
  if (p.gamePly !== null) bits.push(`from a game that played the line ${p.gamePly} plies in`);
  if (p.themes.length) bits.push(p.themes.map(themeLabel).join(', '));
  return bits.join(' · ');
}
const solution = (p: NonNullable<StormItem['puzzle']>) => p.plies.map((x) => x.san).join(' ');

const BAND_WORD: Record<string, string> = { great: 'Great', good: 'Good', ok: 'Inaccuracy', bad: 'Mistake', blunder: 'Blunder', unknown: 'No verdict', unanswered: 'Not answered' };
const sq = (u: string, i: number) => u.slice(i, i + 2) as SquareName;

function facts(p: StoredPosition): CardFacts {
  const list = storedList(p);
  const best = list[0];
  const pos = positionOf(p.fen);
  return { bestSan: best && pos ? uciToSan(pos, best.uci) : '', bestScore: best?.score ?? 0, bestWinrate: best?.winrate, nScored: list.length, unc: p.unc ? { san: p.unc.san, share: p.unc.share } : null };
}

export function StormScreen(props: { where: StormWhere }) {
  const data = trainData.value;
  const version = dataVersion.value;
  const key = JSON.stringify(props.where);
  const scope = useMemo(() => (data ? scopeData(data, props.where) : undefined), [data, key]);
  useEffect(() => leaveStorm, [key]);
  useEffect(() => {
    if (scope && typeof scope !== 'string') void refreshHome(scope);
  }, [scope, version]);
  const s = stormSession.value;
  useWakeLock(!!gathering.value?.running || (!!s && s.phase !== 'done'));
  if (!data) return <p class="muted">Reading the repertoire…</p>;
  if (typeof scope === 'string' || !scope) return <p class="warn">{scope ?? 'Reading the repertoire…'}</p>;
  return (
    <div class="train storm">
      <div class="chapter-head">
        <a href="#/" class="back" onClick={(e) => (e.preventDefault(), s && s.phase !== 'done' ? endStorm('stop') : open({ name: 'list' }))}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">Storm · {scope.title}</span>
        </div>
      </div>
      {!s ? <Home scope={scope} where={props.where} /> : s.phase === 'done' ? <Review s={s} scope={scope} /> : <Card s={s} />}
    </div>
  );
}

function Home(props: { scope: StormScopeData; where: StormWhere }) {
  const scope = props.scope;
  const where = props.where;
  const home = stormHome.value;
  const g = gathering.value;
  const prefs = stormPrefs.value;
  const prefs2 = puzzlePrefs.value;
  const data = trainData.value;
  const record = data ? recordOf(data) : undefined;
  // The record of the scope picked: a study's or a chapter's chapters added up (a position's: its chapter's).
  const shown = record && where.sid ? recordOver(record, (k) => (where.cid ? k === `${where.sid}/${where.cid}` : k.startsWith(`${where.sid}/`))) : record;
  // Stockfish's standard while the home is open and nothing else runs (§5.45).
  useEffect(() => {
    if (prefs.deepen && home && home.deep < home.stored && !g?.running && !deepening.value) void deepen(scope);
  }, [prefs.deepen, home?.stored, home?.deep, g?.running]);
  // Positions, or puzzles when they are dealt.
  const canStart = !!home?.ready || (prefs2.share > 0 && (puzzleState.value?.ready ?? 0) > 0);
  const plies = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div class="storm-home">
      <section class="card">
        {data && <ScopePicker data={data} where={where} disabled={!!g?.running} />}
        <p>
          {scope.frontiers.length} line end{scope.frontiers.length === 1 ? '' : 's'} and {scope.decisions.length} place{scope.decisions.length === 1 ? '' : 's'} where the opponent may leave your lines.
        </p>
        <p class="storm-count" data-testid="storm-count">
          {home ? (
            <>
              <strong>{home.ready}</strong> position{home.ready === 1 ? '' : 's'} ready{home.done ? ` · ${home.done} done for now` : ''}
            </>
          ) : (
            '…'
          )}
        </p>
        <div class="actions">
          <button type="button" disabled={!canStart || g?.running} onClick={() => void startStorm(scope, 'storm')}>
            Start storm
          </button>
          <button type="button" class="secondary" disabled={!canStart || g?.running} onClick={() => void startStorm(scope, 'set')}>
            Set of {STORM.setSize}
          </button>
          {g?.running ? (
            <button type="button" class="secondary" onClick={stopGathering}>
              Stop
            </button>
          ) : (
            <button type="button" class="secondary gather" onClick={() => void gather(scope)}>
              Gather positions
            </button>
          )}
        </div>
        {g && (
          <p class="muted storm-gather" role="status">
            {g.running ? `Gathering: ${g.frontiers} of ${g.of} walked, ${g.stored} stored` : `${g.stored} stored from ${g.frontiers} of ${g.of}. ${g.note}`} · requests: {g.spent.explorer} explorer, {g.spent.games} game exports, {g.spent.chessdb} ChessDB, {g.spent.searches} Stockfish
          </p>
        )}
        {home && home.stored > 0 && (
          <p class="muted storm-deep" data-testid="storm-deep">
            Stockfish: {home.deep} of {home.stored} scored to depth {STORM.deepenDepth}
            {deepening.value ? ' · scoring…' : ''}
          </p>
        )}
      </section>
      <section class="card storm-settings">
        <label>
          From ply{' '}
          <select value={prefs.minPly} onChange={(e) => setStormPrefs({ minPly: Number(e.currentTarget.value) })}>
            {plies(1, STORM.minPlyMax).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          to{' '}
          <select value={prefs.maxPly} onChange={(e) => setStormPrefs({ maxPly: Number(e.currentTarget.value) })}>
            {plies(STORM.maxPlyMin, STORM.maxPlyMax).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>{' '}
          past the line
        </label>{' '}
        <label>
          Gather from{' '}
          <select value={prefs.source} onChange={(e) => setStormPrefs({ source: e.currentTarget.value as 'ends' | 'replies' | 'both' })}>
            <option value="both">line ends and replies</option>
            <option value="ends">line ends</option>
            <option value="replies">replies your lines don’t answer</option>
          </select>
        </label>{' '}
        <label class="check">
          <input type="checkbox" checked={prefs.deepen} onChange={(e) => setStormPrefs({ deepen: e.currentTarget.checked })} /> Stockfish re-scores the positions while this page is open
        </label>
      </section>
      <PuzzlesCard scope={scope} />
      {shown && <Record r={shown.positions} title={`Positions · ${where.sid ? scope.title : 'whole repertoire'}`} />}
      {record && data && !where.sid && <Breakdown title="By study" head="Study" rows={byStudy(data, record)} />}
      {record && data && where.sid && !where.cid && <Breakdown title="By chapter" head="Chapter" rows={byChapter(data, record, where.sid)} />}
      {shown && shown.puzzles.answered > 0 && <Record r={shown.puzzles} title="Puzzles" />}
    </div>
  );
}

/**
 * Puzzles (§5.48): the share of cards, Collect (the size said on the first press, done on the
 * second: it is the one control here that can spend a few hundred MB), the dataset's address.
 */
function PuzzlesCard(props: { scope: StormScopeData }) {
  const scope = props.scope;
  const st = puzzleState.value;
  const prefs = puzzlePrefs.value;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    void refreshPuzzles(scope).then(() => {
      const now = puzzleState.value;
      // The working set topped up in the background when there are candidates to fetch.
      if (prefs.share > 0 && now && !now.running && now.candidates > now.ready && now.ready < WORKING_SET) void fillBodies(scope).then(() => refreshPuzzles(scope));
    });
  }, [scope, prefs.share, prefs.base]);
  const shards = Math.min(st?.shardsLeft ?? 0, SHARDS_PER_COLLECT);
  const mb = Math.round(shards * SHARD_MB);
  const allMb = Math.round((st?.shardsLeft ?? 0) * SHARD_MB);
  return (
    <section class="card storm-puzzles" aria-label="Puzzles">
      <h2>Puzzles</h2>
      <p class="muted">Lichess puzzles from games that went through your lines, dealt among the positions.</p>
      {st && (
        <p data-testid="puzzle-count">
          {st.ready} ready · {st.candidates} found · {st.scanned} of {st.anchors} positions read
        </p>
      )}
      <div class="actions">
        {st?.running ? (
          <button type="button" class="secondary" onClick={stopPuzzles}>
            Stop
          </button>
        ) : armed ? (
          <>
            <button type="button" onClick={() => (setArmed(false), void collect(scope))}>
              Collect: about {mb} MB
            </button>
            {(st?.shardsLeft ?? 0) > shards && (
              <button type="button" class="secondary" onClick={() => (setArmed(false), void collect(scope, true))}>
                Collect all: about {allMb} MB
              </button>
            )}
          </>
        ) : (
          <button type="button" class="secondary" disabled={!st || st.shardsLeft === 0} onClick={() => setArmed(true)}>
            {st && st.shardsLeft === 0 && st.anchors > 0 ? 'Collected' : 'Collect puzzles…'}
          </button>
        )}
        <label>
          Share of cards{' '}
          <select value={prefs.share} onChange={(e) => setPuzzlePrefs({ share: Number(e.currentTarget.value) })}>
            {SHARES.map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
      </div>
      {armed && !st?.running && (
        <p class="muted" role="status">
          Reads {shards} of the dataset’s index files ({st?.shardsLeft ?? 0} left in all) for the positions 12 to 24 plies into your lines, deepest first, then fetches {WORKING_SET} puzzles. Best on Wi-Fi.
          {(st?.shardsLeft ?? 0) > shards && ' Collect all goes on until every file is read or you press Stop, with the page open; what it has read is kept.'}
        </p>
      )}
      {st?.note && (
        <p class="muted" role="status">
          {st.note}
        </p>
      )}
      {st?.error && <p class="warn">{st.error}</p>}
      <details>
        <summary>The dataset’s address</summary>
        <input type="url" value={prefs.base} aria-label="The puzzle dataset’s address" onChange={(e) => setPuzzlePrefs({ base: e.currentTarget.value })} />
      </details>
    </section>
  );
}

type Data = NonNullable<typeof trainData.value>;

const chapterTitle = (data: Data, key: string) => data.chapters.get(key)?.headers.find(([k]) => k === 'ChapterName')?.[1] ?? key.split('/')[1]!;

/** The repertoire's studies, each with its chapters' keys (`<sid>/<cid>`), in the repertoire's order. */
function studiesOf(data: Data): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const k of data.chapters.keys()) {
    const sid = k.split('/')[0]!;
    out.set(sid, [...(out.get(sid) ?? []), k]);
  }
  return out;
}

/**
 * The scope the storm deals from and gathers for: a study, then one of its chapters, or the whole
 * repertoire. "Storm from here" on a move narrows it to the lines through that move.
 */
function ScopePicker(props: { data: Data; where: StormWhere; disabled: boolean }) {
  const { data, where } = props;
  const studies = studiesOf(data);
  return (
    <div class="storm-scope">
      <label>
        Study{' '}
        <select value={where.sid ?? ''} disabled={props.disabled} onChange={(e) => open({ name: 'storm', ...(e.currentTarget.value ? { sid: e.currentTarget.value } : {}) })}>
          <option value="">Whole repertoire</option>
          {[...studies.keys()].map((sid) => (
            <option key={sid} value={sid}>
              {data.studyNames.get(sid) ?? sid}
            </option>
          ))}
        </select>
      </label>
      {where.sid && (
        <label>
          Chapter{' '}
          <select value={where.cid ?? ''} disabled={props.disabled} onChange={(e) => open({ name: 'storm', sid: where.sid!, ...(e.currentTarget.value ? { cid: e.currentTarget.value } : {}) })}>
            <option value="">All chapters</option>
            {(studies.get(where.sid) ?? []).map((k) => (
              <option key={k} value={k.split('/')[1]}>
                {chapterTitle(data, k)}
              </option>
            ))}
          </select>
        </label>
      )}
      {where.at && <span class="muted">from the move {where.at.length ? where.at.join(' ') : 'at the start'}</span>}
    </div>
  );
}

interface BreakdownRow {
  key: string;
  name: string;
  r: RecordRow;
  open(): void;
}

/** Each study's record, its row opening the study's scope. */
function byStudy(data: Data, record: ReturnType<typeof recordOf>): BreakdownRow[] {
  return [...studiesOf(data).keys()].map((sid) => ({
    key: sid,
    name: data.studyNames.get(sid) ?? sid,
    r: recordOver(record, (k) => k.startsWith(`${sid}/`)).positions,
    open: () => open({ name: 'storm', sid }),
  }));
}

/** A study's chapters' records, each row opening the chapter's scope. */
function byChapter(data: Data, record: ReturnType<typeof recordOf>, sid: string): BreakdownRow[] {
  return (studiesOf(data).get(sid) ?? []).map((k) => ({
    key: k,
    name: chapterTitle(data, k),
    r: record.chapters.get(k)?.positions ?? blankRow(),
    open: () => open({ name: 'storm', sid, cid: k.split('/')[1]! }),
  }));
}

/** The record per study or chapter (§5.46): the answers, the share found, the average given up, the bands. */
function Breakdown(props: { title: string; head: string; rows: BreakdownRow[] }) {
  if (!props.rows.length) return null;
  return (
    <section class="card storm-record">
      <h2>{props.title}</h2>
      <table class="storm-chapters">
        <thead>
          <tr>
            <th>{props.head}</th>
            <th>Answered</th>
            <th>Found</th>
            <th>Given up</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.rows.map(({ key, name, r, open: go }) => {
            const found = foundShare(r);
            const avg = averageWp(r);
            return (
              <tr key={key}>
                <td>
                  <button type="button" onClick={go}>
                    {name}
                  </button>
                </td>
                <td>{r.answered}</td>
                <td>{found === null ? '—' : `${Math.round(found)}%`}</td>
                <td>{avg === null ? '—' : formatWp(avg)}</td>
                <td class="bar-cell">
                  <div class="storm-bar">
                    {(['great', 'good', 'ok', 'bad', 'blunder'] as const).map((b) => (r.bands[b] ? <span key={b} class={`band-${b}`} style={{ flexGrow: r.bands[b] }} /> : null))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Record(props: { r: RecordRow; title: string }) {
  const r = props.r;
  const found = foundShare(r);
  const avg = averageWp(r);
  const bands = ['great', 'good', 'ok', 'bad', 'blunder'] as const;
  return (
    <section class="card storm-record">
      <h2>{props.title}</h2>
      {r.answered === 0 ? (
        <p class="muted">No answers yet.</p>
      ) : (
        <>
          <p>
            {r.answered} answered · {found === null ? '—' : `${Math.round(found)}% found`} · {avg === null ? '' : `${formatWp(avg)} of the game given up on average`}
            {r.set ? ` · ${r.set} in sets` : ''}
          </p>
          <div class="storm-bar" aria-label="Answers by band">
            {bands.map((b) => (r.bands[b] ? <span key={b} class={`band-${b}`} style={{ flexGrow: r.bands[b] }} title={`${BAND_WORD[b]}: ${r.bands[b]}`} /> : null))}
          </div>
        </>
      )}
    </section>
  );
}

function CardBoard(props: { item: StormItem; asking: boolean; onMove(uci: string): void; arrows?: { orig: string; dest: string; brush: string }[] }) {
  const p = props.item.card;
  const puzzle = props.item.puzzle;
  const step = props.item.step ?? 0;
  const fen = puzzle ? puzzleFen(props.item) : p.fen;
  const pos = useMemo(() => positionOf(fen)!, [fen]);
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  const dests = props.asking ? (chessgroundDests(pos) as Map<Key, Key[]>) : new Map<Key, Key[]>();
  const lastUci = puzzle && step ? puzzle.plies[step - 1]!.uci : p.arrived?.uci;
  const last = lastUci ? ([sq(lastUci, 0), sq(lastUci, 2)] as [Key, Key]) : undefined;
  const onMove = (orig: Key, dest: Key) => {
    const piece = pos.board.get(parseSquare(orig)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    props.onMove(makeUci(normalizeMove(pos, { from: parseSquare(orig)!, to: parseSquare(dest)! })));
  };
  return (
    <div class="train-board">
      <Board
        fen={fen}
        orientation={p.side}
        turn={pos.turn}
        dests={dests}
        lastMove={last}
        check={pos.isCheck()}
        shapes={[]}
        autoShapes={props.arrows ?? []}
        drawMode={false}
        brush="green"
        onMove={onMove}
        onShapes={() => undefined}
      />
      {promotion && (
        <div class="promotion" role="dialog" aria-label="Promote to">
          {(['queen', 'rook', 'bishop', 'knight'] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                props.onMove(makeUci({ from: parseSquare(promotion.orig)!, to: parseSquare(promotion.dest)!, promotion: r }));
                setPromotion(undefined);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Clock(props: { s: StormSession }) {
  const ms = clockLeft(props.s);
  const sec = Math.ceil(ms / 1000);
  return (
    <span class={`storm-clock${ms < STORM.lowTimeMs ? ' low' : ''}`} data-testid="storm-clock">
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
    </span>
  );
}

function Card(props: { s: StormSession }) {
  const s = props.s;
  const item = s.item;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endStorm('stop');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!item) return <p class="muted">Dealing…</p>;
  const f = facts(item.card);
  const v = item.answer;
  const asking = s.phase === 'solving';
  const held = s.phase === 'held';
  // The best move stays off the panel while a set holds the card and it wasn't asked for (§17.3).
  const showBest = !!v && (s.mode === 'storm' || !held || s.revealed);
  const best = storedList(item.card)[0];
  const arrows = s.revealed && best ? [{ orig: best.uci.slice(0, 2), dest: best.uci.slice(2, 4), brush: 'green' }] : [];
  return (
    <div class="train-grid storm-card" data-phase={s.phase} data-fen={item.card.fen} data-side={item.card.side} data-card={item.card.card} data-step={item.step ?? 0}>
      <CardBoard item={item} asking={asking} onMove={(u) => void answerMove(u)} arrows={arrows} />
      <div class="train-panel storm-panel">
        <p class="train-counters">
          {s.mode === 'storm' ? (
            <>
              <Clock s={s} /> · <strong data-testid="storm-points">{s.points}</strong> point{Math.abs(s.points) === 1 ? '' : 's'} · streak {s.streak}
            </>
          ) : (
            <>
              Set · {s.pass === 2 ? 'second pass' : `${s.history.length} of ${s.total}`}
            </>
          )}
        </p>
        <p class="train-line">
          <strong>{item.card.names[0] ?? ''}</strong>{' '}
          {/* The disguise (§13): before a move a puzzle and a position read the same. */}
          {!s.disguise && !item.puzzle && s.mode === 'storm' && <span class="muted">· {item.card.unc ? gapNote(f) : `${item.card.ply} ${item.card.ply === 1 ? 'ply' : 'plies'} past the line`}</span>}
        </p>
        <p class={`feedback train-feedback storm-verdict band-${v?.band ?? 'none'}`} role="status" data-testid="storm-verdict">
          {asking ? (s.disguise ? 'Find a good move' : 'Your move') : s.phase === 'grading' ? 'Checking…' : v ? (item.puzzle ? `${PUZZLE_WORD[v.band] ?? ''} · ${v.userSan ?? ''}${v.points ? ` · ${v.points > 0 ? '+' : ''}${v.points}` : ''}` : `${BAND_WORD[v.band] ?? ''} · ${verdictLine(v, f)}`) : ''}
        </p>
        {v && showBest && !item.puzzle && (
          <p class="muted storm-best" title={sourceTitle(v)}>
            {bestLine(v, f)}
          </p>
        )}
        {v && showBest && item.puzzle && (
          <p class="muted storm-best" data-testid="puzzle-facts">
            Solution: {solution(item.puzzle)} · {puzzleFacts(item.puzzle)}
          </p>
        )}
        <div class="actions train-actions">
          {held && (item.attempts ?? 0) < STORM.setRetryMax && (
            <button type="button" onClick={tryAgain}>
              Try again
            </button>
          )}
          {held && (
            <button type="button" class="secondary" onClick={showMove}>
              Show the move
            </button>
          )}
          {s.mode === 'set' && s.phase === 'verdict' && (
            <button type="button" onClick={nextCard}>
              Next position
            </button>
          )}
          {s.mode === 'set' && s.phase === 'verdict' && (
            <button type="button" class="secondary" onClick={() => open({ name: 'analysis', fen: item.card.fen })}>
              Analyse
            </button>
          )}
          <button type="button" class="secondary" onClick={() => endStorm('stop')}>
            End
          </button>
        </div>
      </div>
    </div>
  );
}

function Review(props: { s: StormSession; scope: StormScopeData }) {
  const s = props.s;
  const [at, setAt] = useState(0);
  const items = s.history;
  const item = items[at];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      if (e.key === 'b') toggleShown(at);
      else if (e.key === 't') retryFromReview(s.retry ? undefined : at);
      else if (e.key === 'ArrowDown') setAt((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === 'ArrowUp') setAt((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [at, items.length, !!s.retry]);
  const tally = s.mode === 'set' ? setTally(items) : undefined;
  const retry = s.retry;
  const shown = item?.shown;
  const best = item ? storedList(item.card)[0] : undefined;
  const mine = item?.answer?.userUci;
  const arrows = [...(shown && best ? [{ orig: best.uci.slice(0, 2), dest: best.uci.slice(2, 4), brush: 'green' }] : []), ...(mine && mine !== best?.uci ? [{ orig: mine.slice(0, 2), dest: mine.slice(2, 4), brush: 'red' }] : [])];
  return (
    <div class="storm-review">
      <p class="storm-summary" data-testid="storm-summary">
        {s.note}{' '}
        {s.mode === 'storm' ? (
          <>
            <strong>{s.points}</strong> point{Math.abs(s.points) === 1 ? '' : 's'} from {items.filter((i) => i.answer && i.answer.band !== 'unanswered').length} answered
          </>
        ) : (
          tally && (
            <>
              <strong>{tally.first}</strong> of {tally.asked} found first time{tally.again ? ` · ${tally.againClean} of ${tally.again} in the second pass` : ''}
            </>
          )
        )}
      </p>
      {item && (
        <div class="train-grid">
          {retry ? <CardBoard item={retry} asking={!retry.answer} onMove={(u) => void answerMove(u)} /> : <CardBoard item={item} asking={false} onMove={() => undefined} arrows={arrows} />}
          <div class="train-panel">
            <p class="train-line">
              <strong>{item.card.names[0] ?? ''}</strong> <span class="muted">· {item.card.unc ? gapNote(facts(item.card)) : `${item.card.ply} ${item.card.ply === 1 ? 'ply' : 'plies'} past the line`}</span>
            </p>
            {retry ? (
              <p class="feedback storm-verdict" role="status">
                {retry.answer ? `${BAND_WORD[retry.answer.band] ?? ''} · ${verdictLine(retry.answer, facts(item.card))}` : 'Your move · nothing is scored'}
              </p>
            ) : (
              item.answer && (
                <p class={`feedback storm-verdict band-${item.answer.band}`}>
                  {item.puzzle ? `${PUZZLE_WORD[item.answer.band] ?? ''} · ${item.answer.userSan || '—'}` : `${BAND_WORD[item.answer.band]} · ${verdictLine(item.answer, facts(item.card))}`}
                </p>
              )
            )}
            {item.puzzle && <p class="muted">{puzzleFacts(item.puzzle)}</p>}
            {shown && item.answer && <p class="muted storm-best">{item.puzzle ? `Solution: ${solution(item.puzzle)}` : bestLine(item.answer, facts(item.card))}</p>}
            <div class="actions">
              <button type="button" class="secondary" onClick={() => toggleShown(at)}>
                {shown ? 'Hide best move' : 'Best move'} <span class="muted">(b)</span>
              </button>
              <button type="button" class="secondary" onClick={() => retryFromReview(retry ? undefined : at)}>
                {retry ? 'Back to the review' : 'Try again'} <span class="muted">(t)</span>
              </button>
              <button type="button" class="secondary" onClick={() => open({ name: 'analysis', fen: item.card.fen })}>
                Analyse
              </button>
            </div>
          </div>
        </div>
      )}
      <ol class="storm-list">
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" class={`storm-row band-${it.answer?.band ?? 'unanswered'}${i === at ? ' current' : ''}`} onClick={() => (setAt(i), s.retry && retryFromReview(undefined))}>
              <span>{it.card.names[0] ?? ''}</span>
              <span>{it.answer?.userSan || '—'}</span>
              <span>{it.answer ? (it.puzzle ? PUZZLE_WORD[it.answer.band] ?? '' : BAND_WORD[it.answer.band]) : ''}</span>
              <span>{it.answer && typeof it.answer.wp === 'number' ? formatWp(it.answer.wp) : '—'}</span>
              <span>{it.shown && it.answer ? facts(it.card).bestSan : '…'}</span>
            </button>
          </li>
        ))}
      </ol>
      <div class="actions">
        <button type="button" onClick={() => void startStorm(props.scope, s.mode)}>
          {s.mode === 'storm' ? 'Another storm' : 'Another set'}
        </button>
        <button type="button" class="secondary" onClick={() => (stormSession.value = undefined)}>
          Done
        </button>
      </div>
    </div>
  );
}

// The storm's screen (PLAN.md §5.42–§5.46): its home (the scope, the positions kept on this
// device, Gather, Start, the record), a card (the board, the clock, the verdict), and the review
// (every position, the best move behind a press, Try again, Analyse). Neither the engine panel nor
// the explorer is on this screen: during a card they would name the answer. Analyse opens the
// analysis board with the session kept, and "Back to the storm" comes back to it (§18.4).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { makeUci, parseSquare } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import type { Role, SquareName } from 'chessops/types';
import { mode, open } from '../app/mode.ts';
import { dataVersion } from '../app/sync.ts';
import { trainData } from '../app/train.ts';
import {
  analyse,
  answerMove,
  clearGathered,
  clockLeft,
  endStorm,
  endStormSession,
  deepen,
  deepening,
  gather,
  gathering,
  leaveStorm,
  nextCard,
  pauseVerdict,
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
  suspendStorm,
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
import { bestLine, estimated, formatWp, gapNote, sourceTitle, verdictLine, type CardFacts } from '../core/storm/verdict.ts';
import { positionLineKey, positionLineLabel, storedList, type StoredPosition } from '../core/storm/harvest.ts';
import { fenAfterUci, positionOf, uciToSan } from '../core/storm/walk.ts';
import { themeLabel } from '../core/puzzles/dataset.ts';
import { Board } from './Board.tsx';
import { useWakeLock } from './Train.tsx';
import { collect, fillBodies, puzzlePrefs, puzzleState, refreshPuzzles, setPuzzlePrefs, SHARD_MB, SHARES, SHARDS_PER_COLLECT, stopPuzzles, WORKING_SET } from '../app/puzzles.ts';

const PUZZLE_WORD: Record<string, string> = { great: 'Solved', blunder: 'Not the solution', unanswered: 'Not answered' };
const BAND_WORD: Record<string, string> = { great: 'Great', good: 'Good', ok: 'Inaccuracy', bad: 'Mistake', blunder: 'Blunder', unknown: 'No verdict', unanswered: 'Not answered' };
/** The card's title once answered: the band as a move's verdict reads in an annotated game. */
const TITLE_WORD: Record<string, string> = { great: 'Great move', good: 'Good move', ok: 'Inaccuracy', bad: 'Mistake', blunder: 'Blunder', unknown: 'No verdict', unanswered: 'Not answered' };
const BANDS = ['great', 'good', 'ok', 'bad', 'blunder'] as const;

/** What a puzzle says once answered: its rating, how deep its game went into the line, its themes. */
function puzzleFacts(p: NonNullable<StormItem['puzzle']>): string {
  const bits = ['Lichess puzzle'];
  if (p.rating) bits.push(`rated ${p.rating}`);
  if (p.gamePly !== null) bits.push(`from a game that played the line ${p.gamePly} plies in`);
  if (p.themes.length) bits.push(p.themes.map(themeLabel).join(', '));
  return bits.join(' · ');
}
const solution = (p: NonNullable<StormItem['puzzle']>) => p.plies.map((x) => x.san).join(' ');
const sq = (u: string, i: number) => u.slice(i, i + 2) as SquareName;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function facts(p: StoredPosition): CardFacts {
  const list = storedList(p);
  const best = list[0];
  const pos = positionOf(p.fen);
  return { bestSan: best && pos ? uciToSan(pos, best.uci) : '', bestScore: best?.score ?? 0, bestWinrate: best?.winrate, nScored: list.length, unc: p.unc ? { san: p.unc.san, share: p.unc.share } : null };
}

/** How far past the line a card is, in words: a claim about a game, or about an invented line, or an uncovered reply. */
function pastLine(p: StoredPosition): string {
  if (p.unc) return gapNote(facts(p));
  const moves = p.ply === 1 ? 'move' : 'moves';
  return `${p.ply} ${p.invented ? `plausible ${moves}` : moves} past the line`;
}

/** Where a card is in the repertoire: its chapter, and (unless disguised) its line's last moves. */
function Where(props: { item: StormItem; hush: boolean }) {
  const p = props.item.card;
  const chapter = p.names[0] ?? '';
  const tail = !props.hush && !props.item.puzzle ? positionLineLabel(p) : '';
  return (
    <p class="train-line storm-where">
      <strong>{chapter}</strong>
      {tail && <span class="storm-moves">{tail}</span>}
      {!props.hush && !props.item.puzzle && <span class="muted storm-past">{pastLine(p)}</span>}
    </p>
  );
}

export function StormScreen(props: { where: StormWhere }) {
  const data = trainData.value;
  const version = dataVersion.value;
  const key = JSON.stringify(props.where);
  const scope = useMemo(() => (data ? scopeData(data, props.where) : undefined), [data, key]);
  useEffect(() => {
    // A session from another scope (left on the analysis board, then another storm opened) isn't this one's.
    const s = stormSession.peek();
    if (s && s.scopeKey !== key) endStormSession();
    // Off to the analysis board from here: the session waits. Anywhere else: it ends.
    return () => {
      const m = mode.peek();
      if (m.name === 'analysis' && m.back) suspendStorm();
      else leaveStorm();
    };
  }, [key]);
  useEffect(() => {
    if (scope && typeof scope !== 'string') void refreshHome(scope);
  }, [scope, version]);
  const s = stormSession.value;
  useWakeLock(!!gathering.value?.running || (!!s && s.phase !== 'done'));
  if (!data) return <p class="muted">Reading the repertoire…</p>;
  if (typeof scope === 'string' || !scope) return <p class="warn">{scope ?? 'Reading the repertoire…'}</p>;
  const live = !!s && s.phase !== 'done';
  return (
    <div class="train storm">
      <div class="chapter-head">
        <a
          href="#/"
          class="back"
          title={live ? 'End the session' : s ? 'Back to the storm’s page' : 'Back to the studies'}
          onClick={(e) => (e.preventDefault(), live ? endStorm('stop') : s ? (stormSession.value = undefined) : open({ name: 'list' }))}
        >
          ←
        </a>
        <div class="titles">
          <span class="study-title">
            {s ? (s.mode === 'storm' ? 'Storm' : `Set of ${STORM.setSize}`) : 'Storm'} · {scope.title}
          </span>
        </div>
      </div>
      {!s ? <Home scope={scope} where={props.where} /> : s.phase === 'done' ? <Review s={s} scope={scope} /> : <Card s={s} scope={scope} />}
    </div>
  );
}

/* ------------------------------------------------------------------ the home */

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
  const puzzlesReady = prefs2.share > 0 ? (puzzleState.value?.ready ?? 0) : 0;
  const canStart = !!home?.ready || puzzlesReady > 0;
  const ends = scope.frontiers.length;
  const plies = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div class="storm-home">
      <section class="card storm-hero">
        {data && <ScopePicker data={data} where={where} disabled={!!g?.running} />}
        <div class="storm-ready">
          <p class="storm-count" data-testid="storm-count">
            {home ? (
              <>
                <strong>{home.ready}</strong> position{home.ready === 1 ? '' : 's'} ready{home.done ? ` · ${home.done} done for now` : ''}
              </>
            ) : (
              '…'
            )}
          </p>
          {home && home.ready > 0 && (
            <p class="muted storm-spread" data-testid="storm-spread">
              from {plural(home.lines, 'line end')}
              {ends > 0 && home.lines < Math.min(ends, 6) ? ' · gather more for variety' : ''}
              {puzzlesReady ? ` · ${plural(puzzlesReady, 'puzzle')} at ${prefs2.share}%` : ''}
            </p>
          )}
        </div>
        <div class="actions storm-start">
          <button type="button" class="primary" disabled={!canStart || g?.running} onClick={() => void startStorm(scope, 'storm')}>
            Start storm
          </button>
          <button type="button" class="secondary" disabled={!canStart || g?.running} onClick={() => void startStorm(scope, 'set')}>
            Set of {STORM.setSize}
          </button>
        </div>
        <p class="muted storm-about">
          <strong>Storm:</strong> {STORM.sessionMs / 60000} minutes; the clock runs only while a position waits for your move. <strong>Set:</strong> {STORM.setSize} positions, no clock, a
          mistake held until you find a good move. A move is graded by how much of the game it gives up against the best: within {STORM.greatWp}% is great, within {STORM.goodWp}% good.
        </p>
      </section>

      <section class="card storm-gather-card" aria-label="Gather">
        <div class="card-head">
          <h2>Positions</h2>
          {g?.running ? (
            <button type="button" class="secondary" onClick={stopGathering}>
              Stop
            </button>
          ) : (
            <button type="button" class={home?.ready ? 'secondary gather' : 'primary gather'} onClick={() => void gather(scope)}>
              Gather positions
            </button>
          )}
        </div>
        <p class="muted">
          {ends} line end{ends === 1 ? '' : 's'} and {scope.decisions.length} place{scope.decisions.length === 1 ? '' : 's'} where the opponent may leave your lines. Gathering follows real games past
          them and keeps the positions worth a question on this device.
        </p>
        {g && (
          <>
            {g.running && g.of > 0 && (
              <div class="storm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={g.of} aria-valuenow={g.frontiers}>
                <span style={{ width: `${(100 * g.frontiers) / g.of}%` }} />
              </div>
            )}
            <p class="muted storm-gather" role="status">
              {g.running ? `Gathering: ${g.frontiers} of ${g.of} walked, ${g.stored} stored` : `${g.stored} stored from ${g.frontiers} of ${g.of}. ${g.note}`} · requests: {g.spent.explorer} explorer, {g.spent.games} game exports, {g.spent.chessdb} ChessDB, {g.spent.searches} Stockfish
            </p>
          </>
        )}
        {home && home.stored > 0 && (
          <p class="muted storm-deep" data-testid="storm-deep">
            Stockfish: {home.deep} of {home.stored} scored to depth {STORM.deepenDepth}
            {deepening.value ? ' · scoring…' : ''}
          </p>
        )}
        {home && <ClearPositions scope={scope} stored={home.stored} whole={!where.sid} disabled={!!g?.running} />}
        <details class="storm-settings">
          <summary>Settings</summary>
          <div class="storm-settings-grid">
            <label>
              Positions from ply{' '}
              <select value={prefs.minPly} onChange={(e) => setStormPrefs({ minPly: Number(e.currentTarget.value) })}>
                {plies(1, STORM.minPlyMax).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
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
            </label>
            <label>
              Gather from{' '}
              <select value={prefs.source} onChange={(e) => setStormPrefs({ source: e.currentTarget.value as 'ends' | 'replies' | 'both' })}>
                <option value="both">line ends and replies</option>
                <option value="ends">line ends</option>
                <option value="replies">replies your lines don’t answer</option>
              </select>
            </label>
            <label class="check">
              <input type="checkbox" checked={prefs.deepen} onChange={(e) => setStormPrefs({ deepen: e.currentTarget.checked })} /> Stockfish re-scores the positions while this page is open
            </label>
          </div>
        </details>
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
 * Clears the scope's gathered positions from this device, on a second press: a gather spends
 * many requests, so the first press only says what goes and what stays.
 */
function ClearPositions(props: { scope: StormScopeData; stored: number; whole: boolean; disabled: boolean }) {
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => (setArmed(false), setNote('')), [props.scope.key]);
  if (props.stored === 0 && !note) return null;
  const what = props.whole ? `all ${plural(props.stored, 'gathered position')}` : `the ${plural(props.stored, 'gathered position')} of ${props.scope.title}`;
  const clear = () => {
    setArmed(false);
    void clearGathered(props.scope).then((n) => setNote(`${plural(n, 'position')} cleared.`));
  };
  return (
    <div class="storm-clear">
      {armed ? (
        <>
          <p class="muted" role="status">
            Removes {what} from this device. Your answers and the record stay; gathering again finds positions anew.
          </p>
          <div class="actions">
            <button type="button" class="danger" disabled={props.disabled} onClick={clear}>
              Clear {plural(props.stored, 'position')}
            </button>
            <button type="button" class="secondary" onClick={() => setArmed(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        props.stored > 0 && (
          <div class="actions">
            <button type="button" class="secondary" disabled={props.disabled} onClick={() => (setNote(''), setArmed(true))}>
              Clear positions…
            </button>
          </div>
        )
      )}
      {note && !armed && (
        <p class="muted" role="status">
          {note}
        </p>
      )}
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
      <div class="card-head">
        <h2>Puzzles</h2>
        <label class="storm-share">
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
      <p class="muted">Lichess puzzles from games that went through your lines, dealt among the positions. Before a move, a puzzle and a position look the same.</p>
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
            <button type="button" class="secondary" onClick={() => setArmed(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" class="secondary" disabled={!st || st.shardsLeft === 0} onClick={() => setArmed(true)}>
            {st && st.shardsLeft === 0 && st.anchors > 0 ? 'Collected' : 'Collect puzzles…'}
          </button>
        )}
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

function BandBar(props: { bands: RecordRow['bands']; label?: string }) {
  return (
    <div class="storm-bar" aria-label={props.label}>
      {BANDS.map((b) => (props.bands[b] ? <span key={b} class={`band-${b}`} style={{ flexGrow: props.bands[b] }} title={`${BAND_WORD[b]}: ${props.bands[b]}`} /> : null))}
    </div>
  );
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
                  <BandBar bands={r.bands} />
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
          <BandBar bands={r.bands} label="Answers by band" />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ the board */

/**
 * A card's board: the position, or once a move is played the position after it (the move stays
 * while it is graded and the verdict is read); arrows drawn on it stay until the next card.
 */
function CardBoard(props: { item: StormItem; asking: boolean; onMove(uci: string): void; arrows?: { orig: string; dest: string; brush: string }[]; sketch: string; draw?: boolean }) {
  const p = props.item.card;
  const puzzle = props.item.puzzle;
  const step = props.item.step ?? 0;
  const base = puzzle ? puzzleFen(props.item) : p.fen;
  const played = props.item.played;
  const fen = (played && fenAfterUci(base, played)) || base;
  const pos = useMemo(() => positionOf(fen)!, [fen]);
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  // Only the side asked moves, and only before its move is played (a puzzle's reply is the board's).
  const mine = pos.turn === (puzzle ? puzzle.solver : p.side);
  const dests = props.asking && mine && fen === base ? (chessgroundDests(pos) as Map<Key, Key[]>) : new Map<Key, Key[]>();
  const lastUci = played ?? (puzzle && step ? puzzle.plies[step - 1]!.uci : p.arrived?.uci);
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
        drawMode={!!props.draw}
        brush="green"
        onMove={onMove}
        onShapes={() => undefined}
        sketchKey={props.sketch}
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
          <button type="button" class="secondary" onClick={() => setPromotion(undefined)}>
            cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ a card */

function Clock(props: { s: StormSession }) {
  const ms = clockLeft(props.s);
  const sec = Math.ceil(ms / 1000);
  const running = props.s.endsAt !== undefined;
  return (
    <span class={`storm-clock${ms < STORM.lowTimeMs ? ' low' : ''}${running ? '' : ' stopped'}`} data-testid="storm-clock" title={running ? 'Running: a position waits for your move' : 'Stopped while nothing is asked'}>
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
    </span>
  );
}

/** The storm's head: the clock, the points, and the streak towards its next multiplier (§8.1). */
function Hud(props: { s: StormSession }) {
  const s = props.s;
  if (s.mode === 'set') {
    const t = setTally(s.history);
    return (
      <div class="storm-hud storm-hud-set" data-testid="storm-set">
        <div class="storm-hud-cell">
          <span class="storm-hud-label">{s.pass === 2 ? 'Second pass' : 'Position'}</span>
          <span class="storm-hud-value">{s.pass === 2 ? `${t.again} done` : `${s.history.length} of ${s.total}`}</span>
        </div>
        <div class="storm-hud-cell">
          <span class="storm-hud-label">Found first time</span>
          <span class="storm-hud-value">{t.first}</span>
        </div>
      </div>
    );
  }
  const mult = Math.min(STORM.streakMax, 1 + Math.floor(s.streak / STORM.streakStep));
  const fill = mult >= STORM.streakMax ? 1 : (s.streak % STORM.streakStep) / STORM.streakStep;
  return (
    <div class="storm-hud">
      <div class="storm-hud-cell">
        <span class="storm-hud-label">Time</span>
        <Clock s={s} />
      </div>
      <div class="storm-hud-cell">
        <span class="storm-hud-label">Points</span>
        <strong class="storm-hud-value storm-points" data-testid="storm-points">
          {s.points}
        </strong>
      </div>
      <div class="storm-hud-cell storm-hud-streak" title={`Streak ${s.streak}: a good answer scores ×${mult}; ${STORM.streakStep} in a row add one, up to ×${STORM.streakMax}. A mistake ends it.`}>
        <span class="storm-hud-label">Streak {s.streak}</span>
        <span class="storm-combo">
          <span class="storm-combo-bar">
            <span style={{ width: `${Math.round(fill * 100)}%` }} />
          </span>
          <span class="storm-mult">×{mult}</span>
        </span>
      </div>
    </div>
  );
}

/** The session so far, one mark per position in its band's colour. */
function Strip(props: { s: StormSession }) {
  const items = props.s.history;
  if (items.length < 2 && !items[0]?.answer) return null;
  const shown = items.slice(-40);
  return (
    <ol class="storm-strip" aria-label="This session’s answers">
      {shown.map((it, i) => {
        const b = it.answer?.band;
        const word = b ? (it.puzzle ? (PUZZLE_WORD[b] ?? BAND_WORD[b]) : BAND_WORD[b]) : 'Now';
        return <li key={i} class={b ? `band-${b}` : 'current'} title={`${it.answer?.userSan ? it.answer.userSan + ' · ' : ''}${word}`} />;
      })}
    </ol>
  );
}

function Card(props: { s: StormSession; scope: StormScopeData }) {
  const s = props.s;
  const item = s.item;
  const phase = s.phase;
  const held = phase === 'held';
  // Draw mode (touch): a drag draws an arrow, a tap a circle; off again for each new card.
  const [draw, setDraw] = useState(false);
  const sketch = item ? `${item.card.card}|${s.pass}` : '';
  useEffect(() => setDraw(false), [sketch]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = stormSession.peek();
      if (!now || now.phase === 'done') return;
      if (e.key === 'Escape') endStorm('stop');
      else if ((e.key === ' ' || e.key === 'Enter') && now.phase === 'verdict') nextCard();
      else if (e.key === 'p' && now.phase === 'verdict' && now.nextAt !== undefined) pauseVerdict();
      else if (e.key === 't' && now.phase === 'held') tryAgain();
      else if (e.key === 's' && now.phase === 'held') showMove();
      else if (e.key === 'a' && now.mode === 'set' && now.item && (now.phase === 'held' || now.phase === 'verdict')) analyse(now.item, props.scope.route);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.scope.route]);
  if (!item) return <p class="muted">Dealing…</p>;
  const f = facts(item.card);
  const v = item.answer;
  const asking = phase === 'solving';
  // The disguise (§13): before a move a puzzle and a position read the same.
  const hush = s.disguise && !v;
  // The best move stays off the panel while a set holds the card and it wasn't asked for (§17.3).
  const showBest = !!v && (s.mode === 'storm' || !held || s.revealed);
  const best = storedList(item.card)[0];
  const arrows = s.revealed && best && !item.puzzle ? [{ orig: best.uci.slice(0, 2), dest: best.uci.slice(2, 4), brush: 'green' }] : [];
  const turn = positionOf(item.puzzle ? puzzleFen(item) : item.card.fen)?.turn ?? item.card.side;
  const band = v?.band ?? (phase === 'grading' ? 'checking' : 'none');
  const title = v ? (item.puzzle ? (PUZZLE_WORD[v.band] ?? '') : (TITLE_WORD[v.band] ?? '')) : phase === 'grading' && !item.puzzle ? 'Checking…' : 'Find a good move';
  const left = STORM.setRetryMax - (item.attempts ?? 0);
  const line = v
    ? item.puzzle
      ? `${v.userSan || '—'}${v.points ? ` · ${v.points > 0 ? '+' : ''}${v.points}` : ''}`
      : verdictLine(s.mode === 'storm' ? { ...v, points: 0 } : v, f)
    : `${turn === 'white' ? 'White' : 'Black'} to play`;
  return (
    <div class="train-grid storm-card" data-phase={phase} data-fen={item.card.fen} data-side={item.card.side} data-card={item.card.card} data-step={item.step ?? 0} data-line={item.puzzle ? '' : positionLineKey(item.card)}>
      <CardBoard item={item} asking={asking} onMove={(u) => void answerMove(u)} arrows={arrows} sketch={sketch} draw={draw} />
      <div class="train-panel storm-panel">
        <Hud s={s} />
        <Strip s={s} />
        <Where item={item} hush={hush} />
        <div class={`storm-status band-${band}`} role="status" data-testid="storm-verdict">
          <p class="storm-title">
            {!v && <span class={`storm-side side-${turn}`} aria-hidden="true" />}
            {title}
            {v && s.mode === 'storm' && typeof v.points === 'number' && v.points !== 0 && <span class={`storm-delta ${v.points > 0 ? 'up' : 'down'}`}>{`${v.points > 0 ? '+' : ''}${v.points}`}</span>}
          </p>
          <p class="storm-line">{line}</p>
        </div>
        {v && held && !s.revealed && (
          <p class="muted storm-hint">{left > 0 ? `Play it again: ${plural(left, 'attempt')} left, then the move is shown.` : 'No attempts left: show the move to go on.'}</p>
        )}
        {v && showBest && !item.puzzle && v.band !== 'unknown' && (
          <p class={`muted storm-best${estimated(v) ? ' est' : ''}`} title={sourceTitle(v)}>
            {bestLine(v, f)}
          </p>
        )}
        {v && showBest && item.puzzle && (
          <p class="muted storm-best" data-testid="puzzle-facts">
            Solution: {solution(item.puzzle)} · {puzzleFacts(item.puzzle)}
          </p>
        )}
        {phase === 'verdict' && s.mode === 'storm' && s.nextAt !== undefined && s.nextIn !== undefined && (
          <div class="storm-next" aria-hidden="true">
            <span key={s.nextAt} style={{ animationDuration: `${s.nextIn}ms` }} />
          </div>
        )}
        <div class="actions train-actions">
          {held && left > 0 && (
            <button type="button" class="primary" onClick={tryAgain}>
              Try again <kbd>T</kbd>
            </button>
          )}
          {held && (
            <button type="button" class="secondary" onClick={showMove}>
              Show the move <kbd>S</kbd>
            </button>
          )}
          {phase === 'verdict' && (
            <button type="button" class="primary" onClick={nextCard}>
              {s.mode === 'set' ? 'Next position' : 'Next'} <kbd>Space</kbd>
            </button>
          )}
          {phase === 'verdict' && s.mode === 'storm' && s.nextAt !== undefined && (
            <button type="button" class="secondary" title="Keep this position on the board; the clock is stopped" onClick={pauseVerdict}>
              Pause <kbd>P</kbd>
            </button>
          )}
          {s.mode === 'set' && (held || phase === 'verdict') && (
            <button
              type="button"
              class="secondary"
              title={held && !s.revealed ? 'Show the move and open the analysis board; it counts as shown, and the position comes back in the second pass' : 'Open the analysis board here; the set waits'}
              onClick={() => analyse(item, props.scope.route)}
            >
              Analyse <kbd>A</kbd>
            </button>
          )}
          <button type="button" aria-pressed={draw} aria-label="Draw mode" title="Draw arrows and circles to think with" class={`secondary touch-only storm-draw${draw ? ' on' : ''}`} onClick={() => setDraw(!draw)}>
            ✎
          </button>
          <button type="button" class="secondary storm-end" onClick={() => endStorm('stop')}>
            End <kbd>Esc</kbd>
          </button>
        </div>
        {phase === 'verdict' && s.mode === 'storm' && s.nextAt === undefined && <p class="muted storm-hint">Paused: the clock is stopped until the next position.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the review */

function Review(props: { s: StormSession; scope: StormScopeData }) {
  const s = props.s;
  const items = s.history;
  const [at, setAtState] = useState(() => Math.min(s.reviewAt ?? 0, Math.max(0, items.length - 1)));
  const setAt = (i: number) => {
    const n = Math.max(0, Math.min(items.length - 1, i));
    setAtState(n);
    if (s.retry) retryFromReview(undefined);
  };
  const item = items[at];
  const retry = s.retry;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'SELECT' || t === 'INPUT' || t === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = stormSession.peek();
      if (e.key === 'b') toggleShown(at);
      else if (e.key === 't') retryFromReview(now?.retry ? undefined : at);
      else if (e.key === 'a' && items[at]) analyse(items[at]!, props.scope.route, at);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') setAt(at + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') setAt(at - 1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [at, items.length, props.scope.route]);
  const tally = s.mode === 'set' ? setTally(items) : undefined;
  const shown = item?.shown;
  const best = item ? storedList(item.card)[0] : undefined;
  const mine = item?.answer?.userUci;
  const arrows = item?.puzzle ? [] : [...(shown && best ? [{ orig: best.uci.slice(0, 2), dest: best.uci.slice(2, 4), brush: 'green' }] : []), ...(mine && mine !== best?.uci ? [{ orig: mine.slice(0, 2), dest: mine.slice(2, 4), brush: 'red' }] : [])];
  // The session's own figures: answered (an unanswered card aside), found, given up, the bands.
  const answered = items.filter((i) => i.answer && i.answer.band !== 'unanswered');
  const graded = answered.filter((i) => i.answer!.band !== 'unknown');
  const found = graded.filter((i) => i.answer!.band === 'great' || i.answer!.band === 'good').length;
  const wps = graded.map((i) => i.answer!.wp).filter((w): w is number => typeof w === 'number');
  const bands = { great: 0, good: 0, ok: 0, bad: 0, blunder: 0, unknown: 0 } as RecordRow['bands'];
  for (const i of graded) bands[i.answer!.band as keyof RecordRow['bands']]++;
  const again = s.mode === 'storm' ? 'Another storm' : 'Another set';
  const label = (it: StormItem) => (it.puzzle ? 'Puzzle' : positionLineLabel(it.card));
  return (
    <div class="storm-review">
      <section class="card storm-result">
        <div class="storm-result-head">
          {s.mode === 'storm' ? (
            <div class="storm-result-score">
              <strong>{s.points}</strong>
              <span>point{Math.abs(s.points) === 1 ? '' : 's'}</span>
            </div>
          ) : (
            tally && (
              <div class="storm-result-score">
                <strong>
                  {tally.first}/{tally.asked}
                </strong>
                <span>found first time</span>
              </div>
            )
          )}
          <div class="storm-result-facts">
            <p class="storm-summary" data-testid="storm-summary">
              {s.note}{' '}
              {s.mode === 'storm' ? (
                <>
                  <strong>{s.points}</strong> point{Math.abs(s.points) === 1 ? '' : 's'} from {answered.length} answered
                </>
              ) : (
                tally && (
                  <>
                    <strong>{tally.first}</strong> of {tally.asked} found first time{tally.again ? ` · ${tally.againClean} of ${tally.again} in the second pass` : ''}
                  </>
                )
              )}
            </p>
            {graded.length > 0 && (
              <p class="muted">
                {found} of {graded.length} found{wps.length ? ` · ${formatWp(wps.reduce((a, b) => a + b, 0) / wps.length)} of the game given up on average` : ''}
              </p>
            )}
            {graded.length > 0 && <BandBar bands={bands} label="This session’s answers by band" />}
          </div>
        </div>
        <div class="actions">
          <button type="button" class="primary" onClick={() => void startStorm(props.scope, s.mode)}>
            {again}
          </button>
          <button type="button" class="secondary" onClick={() => void startStorm(props.scope, s.mode === 'storm' ? 'set' : 'storm')}>
            {s.mode === 'storm' ? `Set of ${STORM.setSize}` : 'Storm'}
          </button>
          <button type="button" class="secondary" onClick={() => (stormSession.value = undefined)}>
            Done
          </button>
        </div>
      </section>
      {item && (
        <div class="train-grid storm-review-grid">
          {retry ? (
            <CardBoard item={retry} asking={!retry.answer && !retry.played} onMove={(u) => void answerMove(u)} sketch={`retry|${retry.card.card}`} />
          ) : (
            <CardBoard item={{ ...item, played: undefined, step: 0 }} asking={false} onMove={() => undefined} arrows={arrows} sketch={`review|${at}`} />
          )}
          <div class="train-panel storm-panel">
            <div class="storm-nav">
              <button type="button" class="secondary" aria-label="Previous position" disabled={at === 0} onClick={() => setAt(at - 1)}>
                ‹
              </button>
              <span class="storm-nav-count">
                Position {at + 1} of {items.length}
              </span>
              <button type="button" class="secondary" aria-label="Next position" disabled={at >= items.length - 1} onClick={() => setAt(at + 1)}>
                ›
              </button>
            </div>
            <Where item={item} hush={false} />
            {retry ? (
              <div class={`storm-status band-${retry.answer?.band ?? (retry.played ? 'checking' : 'none')}`} role="status">
                <p class="storm-title">{retry.answer ? (retry.puzzle ? PUZZLE_WORD[retry.answer.band] : TITLE_WORD[retry.answer.band]) : retry.played ? 'Checking…' : 'Try this one again'}</p>
                <p class="storm-line">{retry.answer ? (retry.puzzle ? retry.answer.userSan || '—' : verdictLine(retry.answer, facts(item.card))) : 'Nothing is scored'}</p>
              </div>
            ) : (
              item.answer && (
                <div class={`storm-status band-${item.answer.band}`}>
                  <p class="storm-title">{item.puzzle ? PUZZLE_WORD[item.answer.band] : TITLE_WORD[item.answer.band]}</p>
                  <p class="storm-line">{item.puzzle ? item.answer.userSan || '—' : verdictLine(item.answer, facts(item.card))}</p>
                </div>
              )
            )}
            {item.puzzle && <p class="muted">{puzzleFacts(item.puzzle)}</p>}
            {shown && item.answer && (
              <p class="muted storm-best" title={item.puzzle ? '' : sourceTitle(item.answer)}>
                {item.puzzle ? `Solution: ${solution(item.puzzle)}` : bestLine(item.answer, facts(item.card))}
              </p>
            )}
            <div class="actions">
              <button type="button" class="secondary" onClick={() => toggleShown(at)}>
                {shown ? 'Hide best move' : 'Best move'} <kbd>B</kbd>
              </button>
              <button type="button" class="secondary" onClick={() => retryFromReview(retry ? undefined : at)}>
                {retry ? 'Back to the review' : 'Try again'} <kbd>T</kbd>
              </button>
              <button type="button" class="secondary" title="The analysis board, with the engine and the explorer; “Back to the storm” comes back here" onClick={() => analyse(item, props.scope.route, at)}>
                Analyse <kbd>A</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
      <ol class="storm-list">
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" class={`storm-row band-${it.answer?.band ?? 'unanswered'}${i === at ? ' current' : ''}`} onClick={() => setAt(i)}>
              <span class="storm-row-where">
                <span class="storm-row-n">{i + 1}</span> {it.card.names[0] ?? ''} <span class="muted">{label(it)}</span>
              </span>
              <span>{it.answer?.userSan || '—'}</span>
              <span>{it.answer ? (it.puzzle ? (PUZZLE_WORD[it.answer.band] ?? '') : BAND_WORD[it.answer.band]) : ''}</span>
              <span>{it.answer && typeof it.answer.wp === 'number' ? formatWp(it.answer.wp) : '—'}</span>
              <span>{it.shown && it.answer ? (it.puzzle ? (it.puzzle.plies[0]?.san ?? '') : facts(it.card).bestSan) : '…'}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

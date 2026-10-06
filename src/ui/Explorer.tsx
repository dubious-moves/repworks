// The explorer panel (PLAN.md §5.23, D21), laid out as Qchess's: tabs per database with a ⚙ for
// the settings, a header row (Move, Eval, Games, Score, ⇅ sort), a row per move with ChessDB's eval,
// the move's share and count of games and its results as a bar, ChessDB's other moves as novelty
// rows, and Σ. A click on a row plays the move. A move the chapter plays here is on a lighter
// band; a move other repertoire chapters play here carries their count, which lists them.
// As Qchess's, the panel keeps its height between positions (§5.23, the owner's notes): a handle
// on its top edge drags it, saved per device, and the last position's rows stay, faded, until the
// next answer.
import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { localAddress } from '../core/explorer/providers.ts';
import type { ExplorerTab } from '../core/explorer/service.ts';
import { barLabel, buildTable, evalTone, formatEval, formatShare, SORT_LABELS, type SortMode, type Table, type TableInput, type TableRow } from '../core/explorer/table.ts';
import { filterLabel, practicalDetails, preparedDetails, previewDetails, type DetailOptions } from '../core/explorer/details.ts';
import { autoRows, bestOf } from '../core/explorer/rows.ts';
import { expectedScore, type RowResult, type Split } from '../core/explorer/search.ts';
import { cellOf, computeRow, excludedAt, practicalAt, practicalOff, practicalVersion, practicalView, previewOn, showsMaia, toggleExclude, type CellState } from '../app/practical.ts';
import type { Occurrence } from '../core/repertoire/index.ts';
import type { Chapter } from '../core/study/model.ts';
import { nodeAt, positionAt, type Path } from '../core/study/tree.ts';
import { play, side as chapterSide, study } from '../app/editor.ts';
import { lookAt, lookup, pausedUntil, prefs, retryLookup, setPrefs } from '../app/explorer.ts';
import { maiaElo, maiaKey, maiaPrefs, maiaSeen, maiaState, requestPolicy, requestScores } from '../app/maia.ts';
import { logInWithLichess } from '../app/lichess.ts';
import { trainData } from '../app/train.ts';
import { openExplorerSettings } from './ExplorerSettings.tsx';
import { openTranspositions } from './Transpositions.tsx';

/** Qchess's database button, first in the move-button bar: the panel on or off, per device. */
export function ExplorerToggle() {
  const on = prefs.value.on;
  return (
    <button type="button" aria-pressed={on} aria-label="Explorer" title={on ? 'Close the explorer (no requests while it is closed)' : 'Open the explorer'} class={`explorer-toggle${on ? ' on' : ''}`} onClick={() => setPrefs({ on: !on })}>
      ⛁
    </button>
  );
}

const TABS: { tab: ExplorerTab; label: string }[] = [
  { tab: 'lichess', label: 'Lichess' },
  { tab: 'masters', label: 'Masters' },
];

const fmtCount = (n: number) => n.toLocaleString('en-US');
/** The width of the longest count, in rem at the rows' size: a digit about 0.48rem, a comma half that. */
function countWidth(counts: readonly number[]): number {
  const longest = Math.max(1000, ...counts);
  const digits = String(longest).length;
  return Math.max(2.4, digits * 0.48 + Math.floor((digits - 1) / 3) * 0.24 + 0.2);
}

/** Qchess's Maia: likelihoods for its top 20 moves; its top four added as rows, scored (Ms). */
const MAIA_SHOWN = 20;
const MAIA_ROWS = 4;

/** Qchess's `fmtProb`: one decimal under 10%. */
export const formatProb = (p: number): string => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

/** The last position's rows, shown faded while the next position is asked. */
interface Shown {
  fen: string;
  table: Table;
  games: boolean;
  prac: boolean;
  maia: boolean;
}

export function Explorer(props: { chapter: Chapter; path: Path }) {
  const p = prefs.value;
  const box = useRef<HTMLElement>(null);
  const shown = useRef<Shown | undefined>(undefined);
  const pos = useMemo(() => positionAt(props.chapter, props.path), [props.chapter, props.path]);
  const fen = pos ? makeFen(pos.toSetup()) : undefined;
  const filter = `${p.speeds.join()}|${p.ratings.join()}|${p.recent}|${p.local}`;
  useEffect(() => lookAt(p.on ? fen : undefined), [fen, p.on, p.tab, filter]);
  useEffect(() => () => lookAt(undefined), []);
  // Maia's policy here (§5.33), once Maia is ready, a moment after the position is shown.
  const maiaOn = p.on && maiaPrefs.value.on && maiaState.value.kind === 'ready';
  const elo = maiaElo.value;
  useEffect(() => {
    if (!maiaOn || !fen) return;
    const t = setTimeout(() => requestPolicy(fen), 120);
    return () => clearTimeout(t);
  }, [fen, maiaOn, elo]);

  const s = study.value;
  const data = trainData.value;
  // The moves the repertoire plays here, by SAN: the other chapters, transpositions included.
  const repertoire = useMemo(() => {
    const out = new Map<string, Occurrence[]>();
    const here = pos && data?.index.positions.get(positionKeyOf(pos));
    if (!pos || !here) return out;
    for (const map of [here.own, here.opponent]) {
      for (const [uci, places] of map) {
        const move = parseUciMove(pos, uci);
        if (!move) continue;
        const san = makeSan(pos, move);
        const seen = new Set((out.get(san) ?? []).map((o) => `${o.sid}/${o.cid}`));
        for (const o of places) {
          const where = `${o.sid}/${o.cid}`;
          if ((o.sid === s?.sid && o.cid === s?.cid) || seen.has(where)) continue;
          seen.add(where);
          out.set(san, [...(out.get(san) ?? []), o]);
        }
      }
    }
    return out;
  }, [pos, data, s?.sid, s?.cid]);

  if (!p.on || !pos || !fen) return null;
  const node = nodeAt(props.chapter, props.path);
  const covered = new Set(node?.children.map((c) => c.san) ?? []);
  const l = lookup.value?.fen === fen && lookup.value.tab === p.tab ? lookup.value : undefined;
  const side = chapterSide.value === 'black' ? 'b' : 'w';
  const input: TableInput = {
    turn: pos.turn === 'white' ? 'w' : 'b',
    ...(l?.games ? { games: l.games } : {}),
    ...(l?.evals ? { evals: l.evals } : {}),
    sort: p.sort,
    side,
    covered,
    repertoire: new Map([...repertoire].map(([san, o]) => [san, o.length])),
  };
  // Maia's likelihoods (Qchess shows its top 20) and its top four, once it has answered.
  const seen = maiaOn ? maiaSeen.value.get(maiaKey(fen, elo)) : undefined;
  if (seen?.policy) input.maia = { probs: new Map(seen.policy.slice(0, MAIA_SHOWN).map((m) => [m.san, m.prob] as const)), top: seen.policy.slice(0, MAIA_ROWS).map((m) => m.san) };
  // Maia's order without Maia: Qchess falls back to popularity.
  if (p.sort === 'maia' && !maiaOn) input.sort = 'popularity';
  let table = buildTable(input);
  // Without a Lichess login there are no games: ChessDB's moves alone, under the login's note.
  const games = !l?.gamesError?.login;
  const waitingGames = games && !l?.games && !l?.gamesError;
  const turn = pos.turn === 'white' ? 'w' : 'b';
  // The Practical column: on the games tabs, computed on the chapter's side's moves only.
  const prac = games && p.practical;
  const mine = turn === side;
  const shares = new Map(table.rows.filter((r) => !r.novelty).map((r) => [r.san, r.share] as const));
  practicalVersion.value; // redraw as values come
  const cellsOf = (t: Table) => new Map<string, CellState>(t.rows.map((r) => [r.san, cellOf(fen, r.san)] as const));
  let cells = cellsOf(table);
  if (p.sort === 'prac') {
    const values = new Map<string, number>();
    for (const [san, c] of cells) if (prac && mine && !c.excluded && c.result?.state === 'value') values.set(san, c.result.value!);
    table = buildTable({ ...input, practical: values });
    cells = cellsOf(table);
  }
  const viewMaia = prac && showsMaia();
  const values = [...cells.values()].filter((c) => !c.excluded && c.result?.state === 'value').map((c) => c.result!);
  const best = bestOf(values);
  // Green in Maia's view: the best among its values (q_extension's peRenderMaia).
  const maiaBest = bestOf([...cells.values()].filter((c) => !c.excluded && c.maia?.state === 'value').map((c) => c.maia!));
  const detail: DetailOptions = { replyThreshold: p.replyThreshold, minGames: p.minGames, filter: filterLabel(p.speeds, p.ratings), analyse: p.analyse };
  // The prepared bars: the Score header's switch, on rows with a prepared split.
  const preparedOn = prac && p.prepared && mine;
  let bestPrep: number | null = null;
  if (preparedOn) {
    const scores = [...best.cmp].filter((r) => r.prep).map((r) => Math.round(expectedScore(r.prep, turn)! * 100));
    if (scores.length >= 2) bestPrep = Math.max(...scores);
  }
  const paused = pausedUntil.value > Date.now();
  const lichessLabel = localAddress(p.local) ? 'Local' : 'Lichess';

  // While this position is asked, the last one's rows stay, faded and inert, so nothing jumps.
  const asking = !l || (waitingGames && !paused);
  if (!asking && table.rows.length) shown.current = { fen, table, games, prac, maia: maiaOn };
  const stale = asking && shown.current && shown.current.fen !== fen ? shown.current : undefined;

  const message = (() => {
    if (l?.gamesError?.login) {
      return (
        <div class="explorer-note" role="status">
          <p>{l.gamesError.message}</p>
          <button type="button" onClick={() => void logInWithLichess(location.hash)}>
            Log in with Lichess
          </button>
        </div>
      );
    }
    const error = (games ? l?.gamesError : undefined) ?? (!table.rows.length ? l?.evalsError : undefined);
    if (error) {
      return (
        <div class="explorer-note" role="alert">
          <p>{error.message}</p>
          <button type="button" class="secondary" onClick={retryLookup}>
            Retry
          </button>
        </div>
      );
    }
    if (waitingGames && paused) return <p class="explorer-note muted">Lichess asked to slow down: waiting up to a minute.</p>;
    if (!l || waitingGames) return stale ? null : <p class="explorer-note muted">Asking…</p>;
    if (!table.rows.length) return <p class="explorer-note muted">{games ? 'No games here.' : 'ChessDB doesn’t know this position.'}</p>;
    return null;
  })();

  const sortBy = (mode: SortMode, label: string, cls: string, title: string) => (
    <button type="button" class={`${cls} ex-sortable${p.sort === mode ? ' on' : ''}`} aria-pressed={p.sort === mode} title={title} onClick={() => setPrefs({ sort: mode })}>
      {label}
      {p.sort === mode && <span aria-hidden="true"> ▾</span>}
    </button>
  );

  // One width for the games' count on every row and the header, so the bars line up (Qchess's).
  const counted = (stale ?? { table }).table;
  const style: Record<string, string> = { '--ex-count-w': `${countWidth([...counted.rows.map((r) => r.games), counted.total?.games ?? 0]).toFixed(2)}rem` };
  if (p.height) style['--ex-height'] = `${p.height}px`;
  return (
    <section class="explorer" aria-label="Explorer" ref={box} style={style}>
      <Grip box={box} />
      <div class="explorer-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.tab} type="button" role="tab" aria-selected={p.tab === t.tab} class={p.tab === t.tab ? 'on' : ''} onClick={() => setPrefs({ tab: t.tab })}>
            {t.tab === 'lichess' ? lichessLabel : t.label}
          </button>
        ))}
        <button type="button" class="icon explorer-gear" aria-label="Explorer settings" title="Explorer settings" onClick={openExplorerSettings}>
          ⚙
        </button>
      </div>
      {prac && <PracticalDriver fen={fen} mine={mine} rows={table.rows} turn={turn} shares={shares} excludedKey={[...excludedAt(fen)].join()} />}
      <div class={`explorer-head${games ? '' : ' no-games'}${prac ? ' with-prac' : ''}${maiaOn ? ' with-maia' : ''}`}>
        <span class="ex-move">Move</span>
        {sortBy('eval', 'Eval', 'ex-eval', 'Sort by eval')}
        {prac && (
          <button
            type="button"
            class={`ex-prac ex-sortable${p.sort === 'prac' ? ' on' : ''}${viewMaia ? ' maia-view' : ''}`}
            aria-pressed={p.sort === 'prac'}
            title={
              (viewMaia
                ? `Maia: your expected score when each opponent reply is weighted by Maia’s predictions at the filter’s rating instead of by Lichess games. ChessDB and Maia only, so it goes deeper faster.`
                : `Practical: your expected score when each opponent reply is weighted by how often Lichess players (${detail.filter}) play it. Green: the highest among rows searched to the same depth. A small d3: still searching, 3 plies deep so far.${p.tab === 'lichess' ? '' : ' Lichess data, whatever the tab.'}${previewOn() ? ' Purple: mostly Maia’s predictions, where there are few games.' : ''}`) +
              (p.sort !== 'prac' ? ' Click to sort by it.' : previewOn() ? ` Click to show ${viewMaia ? 'the Lichess values' : 'Maia’s values: its predictions in place of Lichess games, much faster'}.` : '')
            }
            onClick={() => {
              // q_extension's rule: the first click sorts; a click on the column already sorted by switches the view.
              if (p.sort !== 'prac') setPrefs({ sort: 'prac' });
              else if (previewOn()) practicalView.value = practicalView.peek() === 'maia' ? 'lichess' : 'maia';
            }}
          >
            {viewMaia ? 'Maia' : 'Prac'}
            {p.sort === 'prac' && <span aria-hidden="true"> ▾</span>}
          </button>
        )}
        {games && sortBy('popularity', 'Games', 'ex-games', 'Sort by popularity')}
        {games &&
          (prac ? (
            <button
              type="button"
              class={`ex-score link-like${p.prepared ? ' on' : ''}`}
              title={p.prepared ? 'Prepared: the results if you follow the Practical choices at your moves while opponents play their real replies. Click for the games’ own results.' : 'Score: the games’ own results. Click for the prepared results (following the Practical choices at your moves).'}
              onClick={() => setPrefs({ prepared: !p.prepared })}
            >
              {p.prepared ? 'Prepared' : 'Score'}
            </button>
          ) : (
            sortBy('score', 'Score', 'ex-score', 'Sort by score')
          ))}
        {maiaOn && sortBy('maia', 'Ml', 'ex-ml', `Maia likelihood: how likely a ${elo} player is to choose the move. Click to sort by it.`)}
        {maiaOn && (
          <span class="ex-ms" title={`Maia score: the expected score of the side to move after the move, as Maia (${elo}) sees it; for the first ${MAIA_ROWS} rows.`}>
            Ms
          </span>
        )}
        <label class="ex-sort" title="Sort order">
          <span aria-hidden="true">⇅</span>
          <select aria-label="Sort" value={p.sort} onChange={(e) => setPrefs({ sort: e.currentTarget.value as SortMode })}>
            {(Object.keys(SORT_LABELS) as SortMode[]).filter((k) => k !== 'maia' || maiaOn).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message}
      <Details fen={fen} />
      {stale && <StaleRows shown={stale} />}
      {!stale && table.rows.length > 0 && (
        <div class={`explorer-rows${games ? '' : ' no-games'}${prac ? ' with-prac' : ''}${maiaOn ? ' with-maia' : ''}`} role="list">
          {maiaOn && seen?.policy && <MaiaScores fen={fen} sans={table.rows.slice(0, MAIA_ROWS).map((r) => r.san)} />}
          {table.rows.map((r, i) => {
            const cell = cells.get(r.san)!;
            const res = cell.result;
            const usable = preparedOn && !cell.excluded && res?.state === 'value' && res.prep ? res : undefined;
            return (
              <Row
                key={r.san}
                row={r}
                games={games}
                others={repertoire.get(r.san) ?? []}
                path={props.path}
                {...(prac
                  ? {
                      practical: (
                        <PracCell
                          fen={fen}
                          san={r.san}
                          cell={cell}
                          mine={mine}
                          viewMaia={viewMaia}
                          best={viewMaia ? (cell.maia && maiaBest.cmp.has(cell.maia) ? maiaBest.best : null) : res && best.cmp.has(res) ? best.best : null}
                          detail={detail}
                          onCompute={() => computeRow(fen, r.san, shares)}
                          onExclude={() => toggleExclude(fen, r.san, shares)}
                        />
                      ),
                    }
                  : {})}
                {...(usable ? { prepared: { split: usable.prep!, muted: (usable.prior ?? 0) >= 0.5, best: bestPrep != null && best.cmp.has(usable) && Math.round(expectedScore(usable.prep, turn)! * 100) === bestPrep, title: preparedDetails(usable, turn, detail).join('\n') } } : {})}
                faded={preparedOn && !usable && !r.novelty}
                {...(maiaOn ? { maia: { elo, ms: i < MAIA_ROWS ? (seen?.scores[r.san] ?? (seen?.asked.has(r.san) ? 'asking' : undefined)) : undefined, turn } } : {})}
              />
            );
          })}
          {games && table.total && (
            <div class="ex-row ex-total" role="listitem">
              <span class="ex-move">Σ</span>
              <span class="ex-eval" />
              {prac && <span class="ex-prac" />}
              <span class="ex-share">100%</span>
              <span class="ex-count">{fmtCount(table.total.games)}</span>
              {maiaOn && <span class="ex-ml" />}
              {maiaOn && <span class="ex-ms" />}
              <Bar white={table.total.white} draws={table.total.draws} black={table.total.black} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** The last position's rows, faded and inert, while this one is asked. */
function StaleRows(props: { shown: Shown }) {
  const { table, games, prac, maia } = props.shown;
  return (
    <div class={`explorer-rows stale${games ? '' : ' no-games'}${prac ? ' with-prac' : ''}${maia ? ' with-maia' : ''}`} aria-hidden="true" inert>
      {table.rows.map((r) => (
        <div key={r.san} class={`ex-row${r.covered ? ' covered' : ''}${r.novelty ? ' novelty' : ''}`}>
          <span class="ex-move">
            <span class="ex-san">{r.san}</span>
          </span>
          <span class={`ex-eval${r.eval ? ` ${evalTone(r.eval)}` : ''}`}>{r.eval ? formatEval(r.eval) : ''}</span>
          {prac && <span class="ex-prac" />}
          {games && <span class="ex-share">{r.novelty ? '' : formatShare(r.share)}</span>}
          {games && <span class="ex-count">{r.novelty || r.maiaOnly ? '' : fmtCount(r.games)}</span>}
          {maia && <span class="ex-ml">{r.maia !== undefined ? formatProb(r.maia) : ''}</span>}
          {maia && <span class="ex-ms" />}
          {games && (r.novelty || r.maiaOnly ? <span class="ex-bar ex-novelty">{r.maiaOnly ? 'Maia' : 'novelty'}</span> : <Bar white={r.white} draws={r.draws} black={r.black} />)}
        </div>
      ))}
    </div>
  );
}

const MIN_HEIGHT = 120;
const STEP = 24;

/** The largest height the panel may take: room left for the notation and the move buttons. */
function maxHeight(box: HTMLElement): number {
  const parent = box.parentElement;
  const wide = matchMedia('(min-width: 900px)').matches;
  const engine = parent ? parseFloat(getComputedStyle(parent).getPropertyValue('--engine-h')) || 0 : 0;
  const room = wide && parent ? parent.clientHeight - 240 - engine : innerHeight * 0.85;
  return Math.max(MIN_HEIGHT, Math.round(room));
}

/** Qchess's resize handle on the panel's top edge: drag (or arrow keys) for the height; double-click resets it. */
function Grip(props: { box: { current: HTMLElement | null } }) {
  const set = (h: number) => {
    const box = props.box.current;
    if (!box) return;
    setPrefs({ height: Math.round(Math.min(maxHeight(box), Math.max(MIN_HEIGHT, h))) });
  };
  return (
    <div
      class="explorer-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Explorer height"
      title="Drag to resize the explorer; double-click for the default"
      tabIndex={0}
      onPointerDown={(e) => {
        const box = props.box.current;
        if (!box || e.button !== 0) return;
        e.preventDefault();
        const grip = e.currentTarget;
        grip.setPointerCapture(e.pointerId);
        grip.classList.add('dragging');
        const y0 = e.clientY;
        const h0 = box.getBoundingClientRect().height;
        const max = maxHeight(box);
        let h = h0;
        const move = (m: PointerEvent) => {
          h = Math.min(max, Math.max(MIN_HEIGHT, h0 + y0 - m.clientY));
          box.style.setProperty('--ex-height', `${h}px`);
        };
        const up = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
          grip.classList.remove('dragging');
          if (h !== h0) setPrefs({ height: Math.round(h) });
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', up);
      }}
      onDblClick={() => setPrefs({ height: 0 })}
      onKeyDown={(e) => {
        const box = props.box.current;
        if (!box || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        set(box.getBoundingClientRect().height + (e.key === 'ArrowUp' ? STEP : -STEP));
      }}
    />
  );
}

function Bar(props: { white: number; draws: number; black: number; class?: string; title?: string }) {
  const n = props.white + props.draws + props.black;
  if (!n) return <span class="ex-bar" />;
  const parts = [
    ['white', props.white / n],
    ['draw', props.draws / n],
    ['black', props.black / n],
  ] as const;
  return (
    <span class={`ex-bar${props.class ? ` ${props.class}` : ''}`} title={props.title}>
      {parts.map(([k, f]) => (
        <span key={k} class={`ex-${k}`} style={{ width: `${f * 100}%` }}>
          {barLabel(f)}
        </span>
      ))}
    </span>
  );
}

interface Prepared {
  split: Split;
  muted: boolean;
  best: boolean;
  title: string;
}

interface MaiaCells {
  elo: number;
  /** Qchess's Ms: the mover's expected score, or 'asking'. */
  ms: number | 'asking' | undefined;
  turn: 'w' | 'b';
}

function Row(props: { row: TableRow; games: boolean; others: Occurrence[]; path: Path; practical?: preact.JSX.Element; prepared?: Prepared; faded?: boolean; maia?: MaiaCells }) {
  const r = props.row;
  const title = r.novelty ? 'Engine suggested move (novelty)' : r.maiaOnly ? 'Maia suggested move' : r.rating ? `Average rating: ${Math.round(r.rating)}` : undefined;
  const m = props.maia;
  const maiaCells = m && (
    <>
      <span class="ex-ml" title={r.maia !== undefined ? `Maia predicts a ${m.elo} player chooses this move ${formatProb(r.maia)} of the time` : undefined}>
        {r.maia !== undefined ? formatProb(r.maia) : ''}
      </span>
      <span class="ex-ms" title={typeof m.ms === 'number' ? `Maia's expected score for ${m.turn === 'w' ? 'White' : 'Black'} after ${r.san}` : undefined}>
        {typeof m.ms === 'number' ? `${Math.round(m.ms * 100)}%` : m.ms === 'asking' ? '…' : ''}
      </span>
    </>
  );
  return (
    <div
      class={`ex-row${r.covered ? ' covered' : ''}${r.novelty ? ' novelty' : ''}${r.maiaOnly ? ' maia-only' : ''}`}
      role="listitem"
      title={title}
      tabIndex={0}
      onClick={() => play(r.san)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), play(r.san))}
    >
      <span class="ex-move">
        <span class="ex-san">{r.san}</span>
        {props.others.length > 0 && (
          <button
            type="button"
            class="ex-rep"
            title={`Played here in ${props.others.length} other repertoire chapter${props.others.length === 1 ? '' : 's'}`}
            aria-label={`${r.san}: in ${props.others.length} other chapter${props.others.length === 1 ? '' : 's'}`}
            onClick={(e) => {
              e.stopPropagation();
              openTranspositions([...props.path, r.san], { orders: [], chapters: props.others }, e.currentTarget);
            }}
          >
            {props.others.length}
          </button>
        )}
      </span>
      <span class={`ex-eval${r.eval ? ` ${evalTone(r.eval)}` : ''}`}>{r.eval ? formatEval(r.eval) : r.novelty || r.maiaOnly ? '' : '?'}</span>
      {props.practical}
      {props.games && <span class="ex-share">{r.novelty || r.maiaOnly ? '' : formatShare(r.share)}</span>}
      {props.games && <span class="ex-count">{r.novelty || r.maiaOnly ? '' : fmtCount(r.games)}</span>}
      {maiaCells}
      {!props.games && r.maiaOnly && <span class="ex-bar ex-novelty ex-maia">Maia</span>}
      {props.games &&
        (r.maiaOnly ? (
          <span class="ex-bar ex-novelty ex-maia">Maia</span>
        ) : r.novelty ? (
          <span class="ex-bar ex-novelty">novelty</span>
        ) : props.prepared ? (
          <Bar
            white={props.prepared.split.w}
            draws={props.prepared.split.d}
            black={props.prepared.split.b}
            class={`prep${props.prepared.muted ? ' prep-muted' : ''}${props.prepared.best ? ' prep-best' : ''}`}
            title={props.prepared.title}
          />
        ) : (
          <Bar white={r.white} draws={r.draws} black={r.black} {...(props.faded ? { class: 'prep-raw', title: 'No prepared split for this move: the games’ own results.' } : {})} />
        ))}
    </div>
  );
}

/** A cell in Maia's view (§5.34): the preview's value in purple italics, q_extension's `peRenderMaia`. */
function MaiaCell(props: { fen: string; san: string; cell: CellState; mine: boolean; best: number | null; detail: DetailOptions; onCompute: () => void; onExclude: () => void }) {
  const { cell } = props;
  const m = cell.maia;
  const r = cell.result;
  let cls = 'ex-prac maia maia-view';
  let text = '';
  let title = '';
  let depth = '';
  if (!props.mine) {
    cls = 'ex-prac';
    title = 'Practical: computed on your moves only.';
  } else if (!m) {
    if (r || cell.queued) {
      cls += ' queued';
      text = '·';
      title = 'Computing…';
    } else {
      cls = 'ex-prac empty';
      title = 'Click to compute the practical score for this move.';
    }
  } else if (m.state === 'value') {
    text = String(Math.round(m.value!)) + (m.final === false ? '' : '%');
    if (m.final === false) depth = `d${m.depth}`;
    if (props.best != null && Math.round(m.value!) === props.best) cls += ' best';
    title = previewDetails(m, r, props.detail).join('\n');
  } else {
    if (m.state === 'error') cls = 'ex-prac failed';
    text = m.state === 'error' ? '?' : '–';
    title = previewDetails(m, r, props.detail).join('\n');
  }
  return (
    <span
      class={cls}
      title={title}
      data-d={depth || undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!props.mine || cell.excluded) return;
        if ((!m && !r && !cell.queued) || m?.state === 'error') return props.onCompute();
        if (m) details.value = { fen: props.fen, san: props.san, lines: previewDetails(m, r, props.detail) };
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (props.mine) props.onExclude();
      }}
    >
      {text}
      {depth && <small class="ex-depth">{depth}</small>}
    </span>
  );
}

/** Asks Maia for Qchess's Ms of the first rows, once its policy is in. */
function MaiaScores(props: { fen: string; sans: string[] }) {
  const key = props.sans.join(' ');
  useEffect(() => requestScores(props.fen, props.sans), [props.fen, key]);
  return null;
}

/** Asks the worker for the rows the column computes without a click, as the table changes. */
function PracticalDriver(props: { fen: string; mine: boolean; rows: readonly TableRow[]; turn: 'w' | 'b'; shares: ReadonlyMap<string, number>; excludedKey: string }) {
  const p = prefs.value;
  const auto = props.mine ? autoRows(props.rows, props.turn, excludedAt(props.fen), { margin: p.ownMargin, maxCandidates: p.ownMaxCandidates, minShare: 0.02 }) : [];
  const key = auto.join(' ');
  useEffect(() => practicalAt(props.fen, props.mine, auto, props.shares), [props.fen, props.mine, key]);
  useEffect(() => () => practicalOff(), []);
  return null;
}

/** The details of the cell tapped (the phone has no hover), under the table, for its position. */
const details = signal<{ fen: string; san: string; lines: string[] } | undefined>(undefined);

function Details(props: { fen: string }) {
  const d = details.value;
  if (!d || d.fen !== props.fen) return null;
  return (
    <div class="ex-details" role="status" aria-label={`Practical: ${d.san}`}>
      <button type="button" class="icon" aria-label="Close" onClick={() => (details.value = undefined)}>
        ×
      </button>
      <strong>{d.san}</strong>
      {d.lines.map((line, i) => (
        <div key={i} class="ex-details-line">
          {line}
        </div>
      ))}
    </div>
  );
}

function PracCell(props: { fen: string; san: string; cell: CellState; mine: boolean; viewMaia: boolean; best: number | null; detail: DetailOptions; onCompute: () => void; onExclude: () => void }) {
  const { cell } = props;
  if (props.viewMaia) return <MaiaCell {...props} />;
  const r: RowResult | undefined = cell.result;
  let text = '';
  let cls = 'ex-prac';
  let title = '';
  let depth = '';
  if (!props.mine) {
    title = 'Practical: computed on your moves only.';
  } else if (cell.excluded) {
    cls += ' excluded';
    text = '×';
    title = 'Left out of Practical. Right-click (long-press) to include it again.';
  } else if (!r) {
    if (cell.queued) {
      cls += ' queued';
      text = '·';
      title = 'Computing…';
    } else {
      cls += ' empty';
      title = 'Click to compute the practical score for this move.';
    }
  } else if (r.state === 'value') {
    text = String(Math.round(r.value!)) + (r.final === false ? '' : '%');
    if (r.final === false) depth = `d${r.depth}`;
    if (props.best != null && Math.round(r.value!) === props.best) cls += ' best';
    // Mostly Maia's predictions rather than games: purple (q_extension's qx-maia).
    if ((r.maia ?? 0) >= 0.5) cls += ' maia';
    title = practicalDetails(r, props.detail, cell.maia).join('\n');
  } else if (r.state === 'few' || r.state === 'none') {
    text = '–';
    title = practicalDetails(r, props.detail).join('\n');
  } else {
    cls += ' failed';
    text = '?';
    title = practicalDetails(r, props.detail).join('\n');
  }
  return (
    <span
      class={cls}
      title={title}
      data-d={depth || undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!props.mine) return;
        if (cell.excluded) return;
        if (!r && !cell.queued) return props.onCompute();
        if (r?.state === 'error') return props.onCompute();
        if (r) details.value = { fen: props.fen, san: props.san, lines: practicalDetails(r, props.detail, cell.maia) };
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (props.mine) props.onExclude();
      }}
    >
      {text}
      {depth && <small class="ex-depth">{depth}</small>}
    </span>
  );
}

// The explorer panel (PLAN.md §5.23, D21), laid out as Qchess's: tabs per database with a ⚙ for
// the settings, a header row (Move, Eval, Games, Score, ⇅ sort), a row per move with ChessDB's eval,
// the move's share and count of games and its results as a bar, ChessDB's other moves as novelty
// rows, and Σ. A click on a row plays the move. A move the chapter plays here is on a lighter
// band; a move other repertoire chapters play here carries their count, which lists them.
import { signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { localAddress } from '../core/explorer/providers.ts';
import type { ExplorerTab } from '../core/explorer/service.ts';
import { barLabel, buildTable, evalTone, formatEval, formatShare, SORT_LABELS, type SortMode, type TableRow } from '../core/explorer/table.ts';
import { filterLabel, practicalDetails, preparedDetails, type DetailOptions } from '../core/explorer/details.ts';
import { autoRows, bestOf } from '../core/explorer/rows.ts';
import { expectedScore, type RowResult, type Split } from '../core/explorer/search.ts';
import { cellOf, computeRow, excludedAt, practicalAt, practicalOff, practicalVersion, toggleExclude, type CellState } from '../app/practical.ts';
import type { Occurrence } from '../core/repertoire/index.ts';
import type { Chapter } from '../core/study/model.ts';
import { nodeAt, positionAt, type Path } from '../core/study/tree.ts';
import { play, side as chapterSide, study } from '../app/editor.ts';
import { lookAt, lookup, pausedUntil, prefs, retryLookup, setPrefs } from '../app/explorer.ts';
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
  { tab: 'chessdb', label: 'ChessDB' },
];

const fmtCount = (n: number) => n.toLocaleString('en-US');

export function Explorer(props: { chapter: Chapter; path: Path }) {
  const p = prefs.value;
  const pos = useMemo(() => positionAt(props.chapter, props.path), [props.chapter, props.path]);
  const fen = pos ? makeFen(pos.toSetup()) : undefined;
  const filter = `${p.speeds.join()}|${p.ratings.join()}|${p.recent}|${p.local}`;
  useEffect(() => lookAt(p.on ? fen : undefined), [fen, p.on, p.tab, filter]);
  useEffect(() => () => lookAt(undefined), []);

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
  const table = buildTable({
    turn: pos.turn === 'white' ? 'w' : 'b',
    ...(p.tab !== 'chessdb' && l?.games ? { games: l.games } : {}),
    ...(l?.evals ? { evals: l.evals } : {}),
    sort: p.sort,
    side,
    covered,
    repertoire: new Map([...repertoire].map(([san, o]) => [san, o.length])),
  });
  const games = p.tab !== 'chessdb';
  const waitingGames = games && !l?.games && !l?.gamesError;
  const turn = pos.turn === 'white' ? 'w' : 'b';
  // The Practical column: on the games tabs, computed on the chapter's side's moves only.
  const prac = games && p.practical;
  const mine = turn === side;
  const shares = new Map(table.rows.filter((r) => !r.novelty).map((r) => [r.san, r.share] as const));
  practicalVersion.value; // redraw as values come
  const cells = new Map<string, CellState>(table.rows.map((r) => [r.san, cellOf(fen, r.san)] as const));
  const values = [...cells.values()].filter((c) => !c.excluded && c.result?.state === 'value').map((c) => c.result!);
  const best = bestOf(values);
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

  const message = (() => {
    if (games && l?.gamesError?.login) {
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
    if (!l || waitingGames || (!games && !l.evals)) return <p class="explorer-note muted">Asking…</p>;
    if (!table.rows.length) return <p class="explorer-note muted">{games ? 'No games here.' : 'ChessDB doesn’t know this position.'}</p>;
    return null;
  })();

  return (
    <section class="explorer" aria-label="Explorer">
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
      <div class={`explorer-head${games ? '' : ' no-games'}${prac ? ' with-prac' : ''}`}>
        <span class="ex-move">Move</span>
        <span class="ex-eval">Eval</span>
        {prac && (
          <span class="ex-prac" title={`Practical: your expected score when each opponent reply is weighted by how often Lichess players (${detail.filter}) play it. Green: the highest among rows searched to the same depth. A small d3: still searching, 3 plies deep so far.${p.tab === 'lichess' ? '' : ' Lichess data, whatever the tab.'}`}>
            Prac
          </span>
        )}
        {games && <span class="ex-games">Games</span>}
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
            <span class="ex-score">Score</span>
          ))}
        <label class="ex-sort" title="Sort order">
          <span aria-hidden="true">⇅</span>
          <select aria-label="Sort" value={p.sort} onChange={(e) => setPrefs({ sort: e.currentTarget.value as SortMode })}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message}
      <Details fen={fen} />
      {table.rows.length > 0 && (
        <div class={`explorer-rows${games ? '' : ' no-games'}${prac ? ' with-prac' : ''}`} role="list">
          {table.rows.map((r) => {
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
                          best={res && best.cmp.has(res) ? best.best : null}
                          detail={detail}
                          onCompute={() => computeRow(fen, r.san, shares)}
                          onExclude={() => toggleExclude(fen, r.san, shares)}
                        />
                      ),
                    }
                  : {})}
                {...(usable ? { prepared: { split: usable.prep!, muted: (usable.prior ?? 0) >= 0.5, best: bestPrep != null && best.cmp.has(usable) && Math.round(expectedScore(usable.prep, turn)! * 100) === bestPrep, title: preparedDetails(usable, turn, detail).join('\n') } } : {})}
                faded={preparedOn && !usable && !r.novelty}
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
              <Bar white={table.total.white} draws={table.total.draws} black={table.total.black} />
            </div>
          )}
        </div>
      )}
    </section>
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

function Row(props: { row: TableRow; games: boolean; others: Occurrence[]; path: Path; practical?: preact.JSX.Element; prepared?: Prepared; faded?: boolean }) {
  const r = props.row;
  const title = r.novelty ? 'Engine suggested move (novelty)' : r.rating ? `Average rating: ${Math.round(r.rating)}` : undefined;
  return (
    <div
      class={`ex-row${r.covered ? ' covered' : ''}${r.novelty ? ' novelty' : ''}`}
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
      <span class={`ex-eval${r.eval ? ` ${evalTone(r.eval)}` : ''}`}>{r.eval ? formatEval(r.eval) : r.novelty ? '' : '?'}</span>
      {props.practical}
      {props.games && <span class="ex-share">{r.novelty ? '' : formatShare(r.share)}</span>}
      {props.games && <span class="ex-count">{r.novelty ? '' : fmtCount(r.games)}</span>}
      {props.games &&
        (r.novelty ? (
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

function PracCell(props: { fen: string; san: string; cell: CellState; mine: boolean; best: number | null; detail: DetailOptions; onCompute: () => void; onExclude: () => void }) {
  const { cell } = props;
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
    title = practicalDetails(r, props.detail).join('\n');
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
        if (r) details.value = { fen: props.fen, san: props.san, lines: practicalDetails(r, props.detail) };
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

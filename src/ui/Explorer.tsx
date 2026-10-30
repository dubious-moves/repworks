// The explorer panel (PLAN.md §5.23, D21), laid out as Qchess's: tabs per database with a ⚙ for
// the settings, a header row (Move, Eval, Games, Score, ⇅ sort), a row per move with ChessDB's eval,
// the move's share and count of games and its results as a bar, ChessDB's other moves as novelty
// rows, and Σ. A click on a row plays the move. A move the chapter plays here is on a lighter
// band; so is a move whose position the chapter reaches by another order, with a ⇄ mark listing
// those orders; a move whose position other repertoire chapters reach (played here or by
// transposition) carries their count, which lists them.
// As Qchess's, the panel keeps its height between positions (§5.23, the owner's notes): a handle
// on its top edge drags it, saved per device, and the last position's rows stay, faded, until the
// next answer.
import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { localAddress } from '../core/explorer/providers.ts';
import type { ExplorerTab } from '../core/explorer/service.ts';
import { barLabel, buildTable, evalNote, evalTone, formatCount, formatEval, formatShare, SORT_LABELS, type Eval, type SortMode, type Table, type TableInput, type TableRow } from '../core/explorer/table.ts';
import { filterLabel, practicalDetails, preparedDetails, previewDetails, type DetailOptions } from '../core/explorer/details.ts';
import { equalDetails, equalPrepared, equalPreparedLine, equalScore, type EqualScore } from '../core/explorer/equal.ts';
import { autoRows, bestOf } from '../core/explorer/rows.ts';
import { expectedScore, moveKey, type RowResult, type Split } from '../core/explorer/search.ts';
import { cellOf, computeRow, excludedAt, practicalAt, practicalOff, practicalVersion, practicalView, previewOn, showsMaia, toggleExclude, type CellState } from '../app/practical.ts';
import type { PositionKey } from '../core/chess/positionKey.ts';
import type { Occurrence } from '../core/repertoire/index.ts';
import type { Chapter } from '../core/study/model.ts';
import { nodeAt, positionAt, type Path } from '../core/study/tree.ts';
import { movesFrom, transposedFrom, transpositions } from '../core/study/transpositions.ts';
import { play, side as chapterSide, study } from '../app/editor.ts';
import { askChildren, childAnswers, childKey, lookAt, lookup, pausedUntil, prefs, retryLookup, setPrefs, type ScoreView } from '../app/explorer.ts';
import { maiaElo, maiaKey, maiaPrefs, maiaSeen, maiaState, requestPolicy, requestScores } from '../app/maia.ts';
import { logInWithLichess } from '../app/lichess.ts';
import { trainData } from '../app/train.ts';
import { openExplorerSettings } from './ExplorerSettings.tsx';
import { openTranspositions } from './Transpositions.tsx';

const TABS: { tab: ExplorerTab; label: string }[] = [
  { tab: 'lichess', label: 'Lichess' },
  { tab: 'masters', label: 'Masters' },
];

/** The width of the longest short count, in rem at the rows' size: a digit about 0.48rem, a point half that, a letter 0.62rem. */
function countWidth(counts: readonly number[]): number {
  const width = (t: string) => [...t].reduce((w, ch) => w + (ch === '.' ? 0.24 : /\d/.test(ch) ? 0.48 : 0.62), 0);
  return Math.max(1.6, ...counts.map((n) => width(formatCount(n)) + 0.1));
}

/** The columns shown (the owner's notes, 2026-10-11: each can be hidden in the settings). */
interface Cols {
  eval: boolean;
  prac: boolean;
  share: boolean;
  count: boolean;
  ml: boolean;
  ms: boolean;
  bar: boolean;
}

/** The rows' grid: Move, then the columns shown; the last takes the rest (the bar, or room for the header's sort). */
function template(c: Cols): string {
  return ['var(--ex-move-w)', c.eval && 'var(--ex-eval-w)', c.prac && '44px', c.share && '34px', c.count && 'var(--ex-count-w)', c.ml && '36px', c.ms && '36px', c.bar ? 'minmax(60px, 1fr)' : 'minmax(0, 1fr)']
    .filter(Boolean)
    .join(' ');
}

/** Qchess's Maia: likelihoods for its top 20 moves; its top four added as rows, scored (Ms). */
const MAIA_SHOWN = 20;
const MAIA_ROWS = 4;

/** Qchess's `fmtProb`: one decimal under 10%. */
export const formatProb = (p: number): string => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

/** Scores at equal ratings (§5.126) for the rows over this share of the games, at most this many, and the chapter's own moves. */
const EQUAL_SHARE = 0.02;
const EQUAL_ROWS = 8;

const SCORE_LABELS: Record<ScoreView, string> = { games: 'Score', equal: 'Equal Elo', prepared: 'Prepared' };

const NEXT_TEXT: Record<ScoreView, string> = { games: 'the games’ own results', equal: 'the results at equal ratings', prepared: 'the prepared results (following the Practical choices at your moves)' };

/** The Score header's next view: the games, at equal ratings, then prepared when the Practical column is on. */
const nextView = (v: ScoreView, prac: boolean): ScoreView => (v === 'games' ? 'equal' : v === 'equal' && prac ? 'prepared' : 'games');

/** The FEN after `san` at `pos` (the panel's position, `fen`), memoized: the panel asks the games there (§5.126). */
const afterMemo = new Map<string, string | undefined>();
function fenAfter(pos: Position, fen: string, san: string): string | undefined {
  const k = `${fen}|${san}`;
  if (afterMemo.has(k)) return afterMemo.get(k);
  const move = parseSan(pos, san);
  let out: string | undefined;
  if (move) {
    const next = pos.clone();
    next.play(move);
    out = makeFen(next.toSetup());
  }
  afterMemo.set(k, out);
  if (afterMemo.size > 2000) afterMemo.delete(afterMemo.keys().next().value!);
  return out;
}

/** Why a row's bar isn't at equal ratings (§5.126): its title over the games' own bar, faded. */
function equalMissing(r: TableRow, state: 'asking' | 'failed' | 'none' | undefined): string {
  if (typeof r.rating !== 'number') return 'Not at equal ratings: this database gives no ratings. The games’ own results.';
  if (state === 'asking') return 'Asking for the games after this move, for its opponents’ ratings… The games’ own results until then.';
  if (state === 'failed') return 'Not at equal ratings: the games after this move didn’t come. The games’ own results.';
  if (state === 'none') return 'Not at equal ratings: no rated games after this move. The games’ own results.';
  return `Not at equal ratings: under ${EQUAL_SHARE * 100}% of the games here. The games’ own results.`;
}

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
  // Maia's policy here (§5.33), once Maia is ready, a moment after the position is shown. Its
  // columns stay while its worker is ended for being unused (`idle`): the ask starts it again,
  // and the policy is asked once it is ready.
  const maiaKind = maiaState.value.kind;
  const maiaOn = p.on && maiaPrefs.value.on && (maiaKind === 'ready' || maiaKind === 'idle');
  const maiaReady = maiaKind === 'ready';
  const elo = maiaElo.value;
  useEffect(() => {
    if (!maiaOn || !fen) return;
    const t = setTimeout(() => requestPolicy(fen), 120);
    return () => clearTimeout(t);
  }, [fen, maiaOn, maiaReady, elo]);

  const s = study.value;
  const data = trainData.value;
  // Each legal move's position, so a move counts wherever its position is reached (the owner,
  // 2026-10-12: transpositions included).
  const moves = useMemo(() => (pos ? movesFrom(pos) : new Map<string, PositionKey>()), [pos]);
  // The other repertoire chapters reaching each move's position, by `moveKey`: one place each.
  const repertoire = useMemo(() => {
    const out = new Map<string, Occurrence[]>();
    if (!data) return out;
    for (const [san, key] of moves) {
      const seen = new Set<string>();
      const places: Occurrence[] = [];
      for (const o of data.index.reached.get(key) ?? []) {
        const where = `${o.sid}/${o.cid}`;
        if ((o.sid === s?.sid && o.cid === s?.cid) || seen.has(where)) continue;
        seen.add(where);
        places.push(o);
      }
      if (places.length) out.set(moveKey(san), places);
    }
    return out;
  }, [moves, data, s?.sid, s?.cid]);
  // The moves the chapter doesn't play here whose position it reaches by another order, by `moveKey`.
  const chapterOrders = useMemo(() => transpositions(props.chapter), [props.chapter]);
  const transposed = useMemo(() => {
    const out = new Map<string, Path[]>();
    if (!pos) return out;
    const played = nodeAt(props.chapter, props.path)?.children.map((c) => c.san) ?? [];
    for (const [san, paths] of transposedFrom(chapterOrders, pos, props.path, played)) out.set(moveKey(san), paths);
    return out;
  }, [chapterOrders, pos, props.chapter, props.path]);

  if (!p.on || !pos || !fen) return null;
  const node = nodeAt(props.chapter, props.path);
  const covered = new Set([...(node?.children.map((c) => c.san) ?? []), ...transposed.keys()]);
  const l = lookup.value?.fen === fen && lookup.value.tab === p.tab ? lookup.value : undefined;
  const side = chapterSide.value === 'black' ? 'b' : 'w';
  const input: TableInput = {
    turn: pos.turn === 'white' ? 'w' : 'b',
    ...(l?.games ? { games: l.games } : {}),
    ...(l?.evals ? { evals: l.evals } : {}),
    ...(l?.line ? { line: l.line } : {}),
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
  // The Score header's switch: the games' own results, at equal ratings (§5.126), or the prepared
  // split on the chapter's side's rows that have one. Prepared without the Practical column is the games.
  const view: ScoreView = p.scoreView === 'prepared' && !prac ? 'games' : p.scoreView;
  const preparedOn = view === 'prepared' && mine;
  const equalOn = games && view === 'equal';
  // At equal ratings each row needs the games after its move, whose replies' ratings are its
  // opponents'. Prepared splits are Lichess's: the Masters tab's ratings can't correct them, and
  // their rows' positions are the search's own, already asked.
  const prepEqual = preparedOn && p.preparedEqual && p.tab === 'lichess';
  const rated = table.rows.filter((r) => !r.novelty && !r.maiaOnly && r.games > 0 && typeof r.rating === 'number');
  const wanted = new Set<string>();
  if (equalOn) {
    for (const r of rated.filter((r) => r.share >= EQUAL_SHARE).sort((a, b) => b.games - a.games).slice(0, EQUAL_ROWS)) wanted.add(r.san);
    for (const r of rated) if (r.covered) wanted.add(r.san);
  }
  if (prepEqual) for (const r of rated) if (cells.get(r.san)?.result?.prep) wanted.add(r.san);
  const kids = childAnswers.value;
  const equalOf = new Map<string, EqualScore>();
  const childState = new Map<string, 'asking' | 'failed' | 'none'>();
  const wantedFens: string[] = [];
  for (const r of rated) {
    if (!wanted.has(r.san)) continue;
    const at = fenAfter(pos, fen, r.san);
    if (!at) continue;
    wantedFens.push(at);
    const answer = kids.get(childKey(p.tab, at));
    const eq = answer && answer !== 'failed' ? equalScore(r, answer, turn) : undefined;
    if (eq) equalOf.set(r.san, eq);
    else childState.set(r.san, answer === 'failed' ? 'failed' : answer ? 'none' : 'asking');
  }
  if (equalOn && p.sort === 'score' && equalOf.size) {
    table = buildTable({ ...input, scores: new Map([...equalOf].map(([san, eq]) => [san, eq.score] as const)) });
    cells = cellsOf(table);
  }
  const prepSplit = (res: RowResult, san: string): Split => {
    const eq = prepEqual ? equalOf.get(san) : undefined;
    return eq ? equalPrepared(res.prep!, res.prior ?? 0, eq, turn) : res.prep!;
  };
  let bestPrep: number | null = null;
  if (preparedOn) {
    const scores = table.rows.flatMap((r) => {
      const res = cells.get(r.san)?.result;
      return res?.prep && best.cmp.has(res) ? [Math.round(expectedScore(prepSplit(res, r.san), turn)! * 100)] : [];
    });
    if (scores.length >= 2) bestPrep = Math.max(...scores);
  }
  const paused = pausedUntil.value > Date.now();
  const lichessLabel = localAddress(p.local) ? 'Local' : 'Lichess';

  // While this position is asked, the last one's rows stay, faded and inert, so nothing jumps.
  const asking = !l || (waitingGames && !paused);
  if (!asking && table.rows.length) shown.current = { fen, table, games, prac, maia: maiaOn };
  const stale = asking && shown.current && shown.current.fen !== fen ? shown.current : undefined;
  // On a phone, with Maia's two columns, the games' count gives way (its share stays).
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 480px)').matches;
  const hidden = new Set(p.hidden);
  const colsOf = (g: boolean, pr: boolean, m: boolean): Cols => ({
    eval: !hidden.has('eval'),
    prac: pr,
    share: g && !hidden.has('share'),
    count: g && !hidden.has('games') && !(narrow && m),
    ml: m && !hidden.has('ml'),
    ms: m && !hidden.has('ms'),
    bar: g && !hidden.has('score'),
  });
  const cols = colsOf(games, prac, maiaOn);

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
    // No games: ChessDB's moves and Maia's are the rows (the owner's request, 2026-10-08), so say
    // which are still coming, or that there are none.
    const noGames = games && !!l.games && !l.games.moves.some((m) => m.games > 0);
    const waitingEvals = !l.evals && !l.evalsError;
    const waitingMaia = maiaOn && !seen?.policy && !seen?.error;
    const coming = [waitingEvals ? 'ChessDB' : '', waitingMaia ? 'Maia' : ''].filter(Boolean).join(' and ');
    if (!table.rows.length) {
      if (coming) return <p class="explorer-note muted">{games ? `No games here: asking ${coming}…` : `Asking ${coming}…`}</p>;
      if (pos.isCheckmate() || pos.isStalemate()) return <p class="explorer-note muted">{pos.isCheckmate() ? 'Checkmate.' : 'Stalemate.'}</p>;
      const unknown = l.evals?.status !== 'ok' || !l.evals.moves?.length;
      return <p class="explorer-note muted">{games ? (unknown ? 'No games here, and ChessDB doesn’t know this position.' : 'No games here.') : 'ChessDB doesn’t know this position.'}</p>;
    }
    if (noGames) {
      const from = [table.rows.some((r) => r.novelty) ? 'ChessDB’s' : '', table.rows.some((r) => r.maiaOnly) ? 'Maia’s' : ''].filter(Boolean).join(' and ');
      return (
        <p class="explorer-note muted">
          No games here: {from} moves{coming ? `; asking ${coming}…` : '.'}
        </p>
      );
    }
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
  const style: Record<string, string> = { '--ex-count-w': `${countWidth([...counted.rows.map((r) => r.games), counted.total?.games ?? 0]).toFixed(2)}rem`, '--ex-cols': template(cols) };
  const gamesSpan = (cols.share ? 1 : 0) + (cols.count ? 1 : 0);
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
      {wantedFens.length > 0 && <ChildDriver tab={p.tab} fens={wantedFens} filter={filter} />}
      <div class="explorer-head">
        <span class="ex-move">Move</span>
        {cols.eval && sortBy('eval', 'Eval', 'ex-eval', 'Sort by eval')}
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
        {gamesSpan > 0 && (
          <button
            type="button"
            class={`ex-games ex-sortable${p.sort === 'popularity' ? ' on' : ''}`}
            style={{ gridColumn: `span ${gamesSpan}` }}
            aria-pressed={p.sort === 'popularity'}
            title="Sort by popularity"
            onClick={() => setPrefs({ sort: 'popularity' })}
          >
            Games
            {p.sort === 'popularity' && <span aria-hidden="true"> ▾</span>}
          </button>
        )}
        {cols.ml && sortBy('maia', 'Ml', 'ex-ml', `Maia likelihood: how likely a ${elo} player is to choose the move. Click to sort by it.`)}
        {cols.ms && (
          <span class="ex-ms" title={`Maia score: the expected score of the side to move after the move, as Maia (${elo}) sees it; for the first ${MAIA_ROWS} rows.`}>
            Ms
          </span>
        )}
        <span class="ex-last">
          {cols.bar && (
            <button
              type="button"
              class={`ex-score link-like${view !== 'games' ? ' on' : ''}`}
              title={
                (view === 'prepared'
                  ? `Prepared: the results if you follow the Practical choices at your moves while opponents play their real replies${p.preparedEqual ? ', at equal ratings' : ''}.`
                  : view === 'equal'
                    ? `Equal Elo: the results with the rating gap between each move’s players and their opponents taken out. The opponents’ ratings come from the position after the move, asked for the moves over ${EQUAL_SHARE * 100}% of the games and the chapter’s own.`
                    : 'Score: the games’ own results.') + ` Click for ${NEXT_TEXT[nextView(view, prac)]}.`
              }
              onClick={() => setPrefs({ scoreView: nextView(view, prac) })}
            >
              {SCORE_LABELS[view]}
            </button>
          )}
          {/* Qchess's "⇅ Sort", as ⇅ alone to leave the bar its room: the select lies over it. */}
          <label class="ex-sort" title={`Sort order: ${SORT_LABELS[p.sort]}`}>
            <span aria-hidden="true">⇅</span>
            <select aria-label="Sort" value={p.sort} onChange={(e) => setPrefs({ sort: e.currentTarget.value as SortMode })}>
              {(Object.keys(SORT_LABELS) as SortMode[]).filter((k) => k !== 'maia' || maiaOn).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </span>
      </div>
      {message}
      <Details fen={fen} />
      {stale && <StaleRows shown={stale} cols={colsOf(stale.games, stale.prac, stale.maia)} />}
      {!stale && table.rows.length > 0 && (
        <div class="explorer-rows" role="list">
          {maiaOn && seen?.policy && <MaiaScores fen={fen} sans={table.rows.slice(0, MAIA_ROWS).map((r) => r.san)} ready={maiaReady} />}
          {table.rows.map((r, i) => {
            const cell = cells.get(r.san)!;
            const res = cell.result;
            const usable = preparedOn && !cell.excluded && res?.state === 'value' && res.prep ? res : undefined;
            let bar: BarView | undefined;
            let faded: string | undefined;
            if (usable) {
              const split = prepSplit(usable, r.san);
              const eq = prepEqual ? equalOf.get(r.san) : undefined;
              const lines = preparedDetails(usable, turn, detail);
              if (eq) lines.splice(2, 0, equalPreparedLine(usable.prep!, split, usable.prior ?? 0, eq, turn));
              else if (preparedOn && p.preparedEqual) lines.splice(2, 0, p.tab === 'lichess' ? equalMissing(r, childState.get(r.san)) : 'Not at equal ratings: the prepared split is Lichess’s, and these ratings are Masters’.');
              const top = bestPrep != null && best.cmp.has(usable) && Math.round(expectedScore(split, turn)! * 100) === bestPrep;
              bar = { split, class: `prep${(usable.prior ?? 0) >= 0.5 ? ' prep-muted' : ''}${top ? ' prep-best' : ''}`, title: lines.join('\n') };
            } else if (preparedOn && !r.novelty) {
              faded = 'No prepared split for this move: the games’ own results.';
            } else if (equalOn && !r.novelty && !r.maiaOnly) {
              const eq = equalOf.get(r.san);
              if (eq) bar = { split: eq.split, class: 'equal', title: equalDetails(eq, turn).join('\n') };
              else faded = equalMissing(r, childState.get(r.san));
            }
            return (
              <Row
                key={r.san}
                row={r}
                games={games}
                cols={cols}
                others={repertoire.get(moveKey(r.san)) ?? []}
                orders={transposed.get(moveKey(r.san)) ?? []}
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
                {...(bar ? { bar } : {})}
                {...(faded ? { faded } : {})}
                {...(maiaOn ? { maia: { elo, ms: i < MAIA_ROWS ? (seen?.scores[r.san] ?? (seen?.asked.has(r.san) ? 'asking' : undefined)) : undefined, turn } } : {})}
              />
            );
          })}
          {games && table.total && (
            <div class="ex-row ex-total" role="listitem">
              <span class="ex-move">Σ</span>
              {cols.eval && <span class="ex-eval" />}
              {cols.prac && <span class="ex-prac" />}
              {cols.share && <span class="ex-share">100%</span>}
              {cols.count && <span class="ex-count">{formatCount(table.total.games)}</span>}
              {cols.ml && <span class="ex-ml" />}
              {cols.ms && <span class="ex-ms" />}
              {cols.bar && <Bar white={table.total.white} draws={table.total.draws} black={table.total.black} />}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** ChessDB's eval of a move; a shallow one (§5.139) light and italic, with why in its title. */
function EvalCell(props: { value: Eval | undefined; missing?: string }) {
  const e = props.value;
  if (!e) return <span class="ex-eval">{props.missing ?? ''}</span>;
  return (
    <span class={`ex-eval ${evalTone(e)}${e.shallow ? ' shallow' : ''}`} title={evalNote(e)}>
      {formatEval(e)}
    </span>
  );
}

/** The last position's rows, faded and inert, while this one is asked. */
function StaleRows(props: { shown: Shown; cols: Cols }) {
  const { table } = props.shown;
  const c = props.cols;
  return (
    <div class="explorer-rows stale" style={{ '--ex-cols': template(c) }} aria-hidden="true" inert>
      {table.rows.map((r) => (
        <div key={r.san} class={`ex-row${r.covered ? ' covered' : ''}${r.novelty ? ' novelty' : ''}`}>
          <span class="ex-move">
            <span class="ex-san">{r.san}</span>
          </span>
          {c.eval && <EvalCell value={r.eval} />}
          {c.prac && <span class="ex-prac" />}
          {c.share && <span class="ex-share">{r.novelty ? '' : formatShare(r.share)}</span>}
          {c.count && <span class="ex-count">{r.novelty || r.maiaOnly ? '' : formatCount(r.games)}</span>}
          {c.ml && <span class="ex-ml">{r.maia !== undefined ? formatProb(r.maia) : ''}</span>}
          {c.ms && <span class="ex-ms" />}
          {c.bar && (r.novelty || r.maiaOnly ? <span class="ex-bar ex-novelty">{r.maiaOnly ? 'Maia' : 'novelty'}</span> : <Bar white={r.white} draws={r.draws} black={r.black} />)}
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

/** A bar in place of the games' own: the prepared split (§5.24) or the split at equal ratings (§5.126). */
interface BarView {
  split: Split;
  class: string;
  title: string;
}

interface MaiaCells {
  elo: number;
  /** Qchess's Ms: the mover's expected score, or 'asking'. */
  ms: number | 'asking' | undefined;
  turn: 'w' | 'b';
}

/** `faded`: the games' own bar shown faded, with this title (no prepared split, or not at equal ratings). */
function Row(props: { row: TableRow; games: boolean; cols: Cols; others: Occurrence[]; orders: Path[]; path: Path; practical?: preact.JSX.Element; bar?: BarView; faded?: string; maia?: MaiaCells }) {
  const r = props.row;
  const title = r.novelty ? 'Engine suggested move (novelty)' : r.maiaOnly ? 'Maia suggested move' : r.rating ? `Average rating: ${Math.round(r.rating)}` : undefined;
  const m = props.maia;
  const c = props.cols;
  const maiaCells = m && (
    <>
      {c.ml && (
      <span class="ex-ml" title={r.maia !== undefined ? `Maia predicts a ${m.elo} player chooses this move ${formatProb(r.maia)} of the time` : undefined}>
        {r.maia !== undefined ? formatProb(r.maia) : ''}
      </span>
      )}
      {c.ms && (
      <span class="ex-ms" title={typeof m.ms === 'number' ? `Maia's expected score for ${m.turn === 'w' ? 'White' : 'Black'} after ${r.san}` : undefined}>
        {typeof m.ms === 'number' ? `${Math.round(m.ms * 100)}%` : m.ms === 'asking' ? '…' : ''}
      </span>
      )}
    </>
  );
  return (
    <div
      class={`ex-row${r.covered ? ' covered' : ''}${props.orders.length ? ' transposed' : ''}${r.novelty ? ' novelty' : ''}${r.maiaOnly ? ' maia-only' : ''}`}
      role="listitem"
      title={title}
      tabIndex={0}
      onClick={() => play(r.san)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), play(r.san))}
    >
      <span class="ex-move">
        <span class="ex-san">{r.san}</span>
        {props.orders.length > 0 && (
          <button
            type="button"
            class="ex-tr"
            title={`Not played here, but the chapter reaches this position by ${props.orders.length === 1 ? 'another move order' : `${props.orders.length} other move orders`}`}
            aria-label={`${r.san}: transposes, ${props.orders.length} move order${props.orders.length === 1 ? '' : 's'}`}
            onClick={(e) => {
              e.stopPropagation();
              openTranspositions([...props.path, r.san], { orders: props.orders, chapters: [] }, e.currentTarget);
            }}
          >
            ⇄
          </button>
        )}
        {props.others.length > 0 && (
          <button
            type="button"
            class="ex-rep"
            title={`Its position is reached in ${props.others.length} other repertoire chapter${props.others.length === 1 ? '' : 's'}`}
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
      {c.eval && <EvalCell value={r.eval} missing={r.novelty || r.maiaOnly ? '' : '?'} />}
      {props.practical}
      {c.share && <span class="ex-share">{r.novelty || r.maiaOnly ? '' : formatShare(r.share)}</span>}
      {c.count && <span class="ex-count">{r.novelty || r.maiaOnly ? '' : formatCount(r.games)}</span>}
      {maiaCells}
      {!props.games && r.maiaOnly && <span class="ex-bar ex-novelty ex-maia">Maia</span>}
      {c.bar &&
        (r.maiaOnly ? (
          <span class="ex-bar ex-novelty ex-maia">Maia</span>
        ) : r.novelty ? (
          <span class="ex-bar ex-novelty">novelty</span>
        ) : props.bar ? (
          <Bar white={props.bar.split.w} draws={props.bar.split.d} black={props.bar.split.b} class={props.bar.class} title={props.bar.title} />
        ) : (
          <Bar white={r.white} draws={r.draws} black={r.black} {...(props.faded ? { class: 'prep-raw', title: props.faded } : {})} />
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
function MaiaScores(props: { fen: string; sans: string[]; ready: boolean }) {
  const key = props.sans.join(' ');
  useEffect(() => requestScores(props.fen, props.sans), [props.fen, key, props.ready]);
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

/** Asks the worker for the games after the rows' moves, for the scores at equal ratings (§5.126); those not come are dropped when it goes. */
function ChildDriver(props: { tab: ExplorerTab; fens: readonly string[]; filter: string }) {
  const key = props.fens.join('|');
  useEffect(() => askChildren(props.tab, props.fens), [props.tab, key, props.filter]);
  useEffect(() => () => askChildren(props.tab, []), []);
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

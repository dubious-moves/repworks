// The explorer panel (PLAN.md §5.23, D21), laid out as Qchess's: tabs per database with a ⚙ for
// the settings, a header row (Move, Eval, Games, Score, ⇅ sort), a row per move with ChessDB's eval,
// the move's share and count of games and its results as a bar, ChessDB's other moves as novelty
// rows, and Σ. A click on a row plays the move. A move the chapter plays here is on a lighter
// band; a move other repertoire chapters play here carries their count, which lists them.
import { useEffect, useMemo } from 'preact/hooks';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { localAddress } from '../core/explorer/providers.ts';
import type { ExplorerTab } from '../core/explorer/service.ts';
import { barLabel, buildTable, evalTone, formatEval, formatShare, SORT_LABELS, type SortMode, type TableRow } from '../core/explorer/table.ts';
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
      <div class={`explorer-head${games ? '' : ' no-games'}`}>
        <span class="ex-move">Move</span>
        <span class="ex-eval">Eval</span>
        {games && <span class="ex-games">Games</span>}
        {games && <span class="ex-score">Score</span>}
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
      {table.rows.length > 0 && (
        <div class={`explorer-rows${games ? '' : ' no-games'}`} role="list">
          {table.rows.map((r) => (
            <Row key={r.san} row={r} games={games} others={repertoire.get(r.san) ?? []} path={props.path} />
          ))}
          {games && table.total && (
            <div class="ex-row ex-total" role="listitem">
              <span class="ex-move">Σ</span>
              <span class="ex-eval" />
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

function Bar(props: { white: number; draws: number; black: number }) {
  const n = props.white + props.draws + props.black;
  if (!n) return <span class="ex-bar" />;
  const parts = [
    ['white', props.white / n],
    ['draw', props.draws / n],
    ['black', props.black / n],
  ] as const;
  return (
    <span class="ex-bar">
      {parts.map(([k, f]) => (
        <span key={k} class={`ex-${k}`} style={{ width: `${f * 100}%` }}>
          {barLabel(f)}
        </span>
      ))}
    </span>
  );
}

function Row(props: { row: TableRow; games: boolean; others: Occurrence[]; path: Path }) {
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
      {props.games && <span class="ex-share">{r.novelty ? '' : formatShare(r.share)}</span>}
      {props.games && <span class="ex-count">{r.novelty ? '' : fmtCount(r.games)}</span>}
      {props.games && (r.novelty ? <span class="ex-bar ex-novelty">novelty</span> : <Bar white={r.white} draws={r.draws} black={r.black} />)}
    </div>
  );
}

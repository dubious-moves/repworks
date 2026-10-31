// The variation checklist (PLAN.md §5.62, §5.130): every repertoire study's lines that matter most,
// each side of a study a block of its own, folded, with its progress (the most recently drilled
// first); unfolded, its lines, each with its opening name, its moves (hovered or tapped, the
// position on a small board), its share and its three difficulties (Easy, Medium, Hard: the
// opponent's strength), checked off by a win, the last five attempts' score on each chip; a line
// taken out (✕) is replaced from the reserve. The drill: the line's lead-up played from the start
// (your moves asked, the opponent's played; a move off your prep is refused), then a game from its
// end against the level's opponent, won by mate or Claim victory. Lines added by hand (§5.142, from
// the study's ☰ menu or a line's ⋯ in the line list) follow the made list's, marked "added", and
// stay when the list is made again; their ✕ takes them off.
import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseSquare } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import { analyseFrom, entryKey, open } from '../app/mode.ts';
import { chapterNameAt, checklistMaia, checklistViews, excludeLine, generating, makeChecklist, MAIA_MAX, MAIA_MIN, restoreExcluded, setChecklistMaia, stopChecklist, touch, unpickLine, type ChecklistView } from '../app/checklist.ts';
import { openingNameOf } from '../app/games.ts';
import { lichessToken } from '../app/lichess.ts';
import { leavePractice, parkPractice, practice, startPractice, takeUpPractice } from '../app/practice.ts';
import { practiceResults } from '../app/repertoireCheck.ts';
import { trainData } from '../app/train.ts';
import { completedPresets, linesOf, PRESET_ORDER, PRESETS, presetOpen, presetStats, RANK_SPEEDS, type ChecklistGap, type Preset, type ShownLine } from '../core/games/checklist.ts';
import type { Color } from '../core/games/record.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { keyFen, positionKeyOf } from '../core/chess/positionKey.ts';
import { positionOf } from '../core/storm/walk.ts';
import { MiniBoard } from './CommentOffer.tsx';
import { MoveBoard, PracticeBoard } from './Practice.tsx';
import { winRateColor } from './RepertoireCheck.tsx';
import { isoDay } from './day.ts';
import { Back, Stuck } from './Back.tsx';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The lead-up left for the analysis board: its entry and the move it was at. */
let leadLeft: { entry: string; k: number } | undefined;

/** "1. e4 e5 2. Nf3 Nc6", from the start. */
function lineText(sans: readonly string[]): string {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ');
}

/* ------------------------------------------------------------------ the page */

const OPEN_KEY = 'repworks-checklist-open';
/** The blocks unfolded, kept for this tab. */
const unfolded = signal<Set<string>>(
  (() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? '[]') as string[]);
    } catch {
      return new Set<string>();
    }
  })(),
);
function setUnfolded(k: string, on: boolean): void {
  const next = new Set(unfolded.peek());
  if (on) next.add(k);
  else next.delete(k);
  unfolded.value = next;
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
  } catch {
    // this page only
  }
}

/** The line previewed: its block and line, and the move (its index in the line) shown. */
const previewed = signal<{ id: string; ply: number } | undefined>(undefined);

/** `#/checklist`: every study's checklist; `sid` (and `side`) unfolded on arrival. */
export function ChecklistScreen(props: { sid?: string; side?: Color }) {
  const views = checklistViews.value;
  useEffect(() => {
    if (!props.sid) return;
    const v = views.filter((x) => x.sid === props.sid && (!props.side || x.color === props.side));
    for (const x of v) setUnfolded(`${x.sid}|${x.color}`, true);
    requestAnimationFrame(() => document.querySelector(`[data-study="${props.sid}"]`)?.scrollIntoView({ block: 'nearest' }));
  }, [props.sid, props.side, views.length > 0]);
  // A tap anywhere but a line's move ends the preview (a phone has no hover to leave).
  useEffect(() => {
    const off = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.checklist-move')) previewed.value = undefined;
    };
    document.addEventListener('click', off);
    return () => {
      document.removeEventListener('click', off);
      previewed.value = undefined;
    };
  }, []);
  return (
    <div class="games checklists">
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Variation checklist</span>
        </div>
      </div>
      <p class="muted">Each study’s most likely lines, by the explorer’s games at 1600–2500. Win a line at Easy, then Medium, then Hard, to check it off.</p>
      <p class="muted">Add a line of your own from a study’s ☰ menu (the line to the move shown) or a line’s ⋯ in the line list: it stays when the list is made again.</p>
      {!lichessToken() && <p class="muted">The explorer needs the Lichess login: without it every line is weighted the same.</p>}
      <MaiaSettings />
      {!trainData.value ? (
        <p class="muted">Reading the repertoire…</p>
      ) : views.length === 0 ? (
        <p class="muted">No repertoire study yet.</p>
      ) : (
        views.map((v) => <StudyBlock key={`${v.sid}|${v.color}`} view={v} />)
      )}
    </div>
  );
}

function MaiaSettings() {
  const maia = checklistMaia.value;
  return (
    <div class="games-filters checklist-maia" role="group" aria-label="Opponent strength">
      <span class="muted">Maia’s rating:</span>
      {PRESET_ORDER.map((p) => (
        <label key={p}>
          {PRESETS[p].label}{' '}
          <input type="number" min={MAIA_MIN} max={MAIA_MAX} step={25} value={maia[p]} onChange={(e) => setChecklistMaia(p, Number((e.target as HTMLInputElement).value))} />
        </label>
      ))}
    </div>
  );
}

function StudyBlock(props: { view: ChecklistView }) {
  const v = props.view;
  const k = `${v.sid}|${v.color}`;
  const gen = generating.value;
  const mine = gen?.sid === v.sid && gen.color === v.color;
  const isOpen = mine || unfolded.value.has(k);
  const pct = v.progress && v.progress.total ? Math.round((v.progress.done / v.progress.total) * 100) : v.progress ? 0 : undefined;
  return (
    <section class="card checklist-block" data-testid="checklist-study" data-study={v.sid} data-side={v.color}>
      <button type="button" class="checklist-head" aria-expanded={isOpen} onClick={() => setUnfolded(k, !isOpen)}>
        <span class="checklist-fold" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span class="checklist-study">
          {v.name} <span class="muted">({v.color})</span>
        </span>
        {pct === undefined ? (
          <span class="muted">not made</span>
        ) : (
          <span class="checklist-progress" title={`${v.progress!.done}/${v.progress!.total} wins: every line at Easy, Medium and Hard is 100%`} data-testid="checklist-progress">
            <span class="checklist-bar">
              <span style={{ width: `${pct}%`, background: winRateColor(pct / 100) }} />
            </span>
            {pct}%
          </span>
        )}
      </button>
      {isOpen && <StudyBody view={v} />}
    </section>
  );
}

function StudyBody(props: { view: ChecklistView }) {
  const v = props.view;
  const list = v.list;
  const [ply, setPly] = useState(list?.ply ?? 10);
  const [count, setCount] = useState(list?.count ?? 10);
  const gen = generating.value;
  const mine = gen?.sid === v.sid && gen.color === v.color;
  const results = practiceResults.value;
  return (
    <div class="checklist-body">
      <div class="games-filters">
        <label>
          Lines{' '}
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, Number((e.target as HTMLInputElement).value) || 10)))} />
        </label>
        <label>
          Plies{' '}
          <select value={ply} onChange={(e) => setPly(Number((e.target as HTMLSelectElement).value))}>
            {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((p) => (
              <option key={p} value={p}>
                {p === 0 ? 'full' : p}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!!gen} onClick={() => void makeChecklist(v.sid, v.color, ply, count)}>
          {mine ? `Asking the explorer… ${gen.calls}` : list ? 'Make again' : 'Make'}
        </button>
        {mine && (
          <button type="button" class="secondary" onClick={stopChecklist}>
            Stop
          </button>
        )}
      </div>
      {list && (
        <p class="muted">
          {v.lines.length} line{v.lines.length === 1 ? '' : 's'}
          {v.picked.length ? ` (${v.picked.length} added by you)` : ''}, made {isoDay(list.made)}
          {list.calls !== undefined ? ` (${list.calls} positions asked${list.cut ? ', cut short' : ''})` : ''}.
        </p>
      )}
      {!list && v.picked.length > 0 && (
        <p class="muted">
          {v.picked.length} line{v.picked.length === 1 ? '' : 's'} added by you; Make adds the most likely lines to {v.picked.length === 1 ? 'it' : 'them'}.
        </p>
      )}
      {v.lines.length > 0 && (
        <ol class="checklist-lines">
          {v.lines.map((l) => (
            <Line key={l.v.leafKey} line={l} view={v} results={results.filter((r) => r.key === l.v.leafKey)} />
          ))}
        </ol>
      )}
      {v.paused > 0 && (
        <p class="muted" data-testid="checklist-paused">
          {v.paused} paused line{v.paused === 1 ? '' : 's'} hidden: unpause {v.paused === 1 ? 'it' : 'them'} to bring {v.paused === 1 ? 'it' : 'them'} back.
        </p>
      )}
      {list && (
        <>
          <Excluded view={v} />
          {list.gaps.length > 0 && (
            <details>
              <summary>Replies the study doesn’t cover ({list.gaps.length})</summary>
              <ul class="repcheck-list">
                {list.gaps.map((g) => (
                  <GapRow key={g.lineUci.join(' ')} gap={g} view={v} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** The lines of this list taken out, and Restore all: back in their places at once (the list keeps them). */
function Excluded(props: { view: ChecklistView }) {
  const n = props.view.excluded.length;
  if (!n) return null;
  return (
    <p class="muted">
      {n} line{n === 1 ? '' : 's'} taken out.{' '}
      <button type="button" class="link" onClick={() => restoreExcluded(props.view.excluded)}>
        Restore all
      </button>
    </p>
  );
}

/** A line's moves, each shown on the small board when hovered or tapped. */
function Moves(props: { id: string; lineUci: readonly string[]; lineSan: readonly string[]; color: Color }) {
  const positions = useMemo(() => {
    const pos = positionOf(START)!;
    const out: Position[] = [];
    for (const uci of props.lineUci) {
      const m = parseUciMove(pos, uci);
      if (!m) break;
      pos.play(m);
      out.push(pos.clone());
    }
    return out;
  }, [props.lineUci.join(' ')]);
  const p = previewed.value?.id === props.id ? previewed.value.ply : undefined;
  const shown = p !== undefined ? positions[p] : undefined;
  const uci = p !== undefined ? props.lineUci[p] : undefined;
  return (
    <span class="checklist-moves" onMouseLeave={() => previewed.value?.id === props.id && (previewed.value = undefined)}>
      {props.lineSan.map((san, i) => (
        <span key={i}>
          {i % 2 === 0 && <span class="muted">{i / 2 + 1}. </span>}
          <span
            class={`checklist-move${p === i ? ' shown' : ''}`}
            data-ply={i}
            onMouseEnter={() => (previewed.value = { id: props.id, ply: i })}
            onClick={() => (previewed.value = { id: props.id, ply: i })}
          >
            {san}
          </span>{' '}
        </span>
      ))}
      {shown && uci && (
        <span class="checklist-preview" data-testid="checklist-preview" data-fen={makeFen(shown.toSetup())}>
          <MiniBoard position={shown} orientation={props.color} lastMove={squares(uci)} />
        </span>
      )}
    </span>
  );
}

function squares(uci: string): [Key, Key] | undefined {
  return parseSquare(uci.slice(0, 2)) === undefined || parseSquare(uci.slice(2, 4)) === undefined ? undefined : [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
}

function Line(props: { line: ShownLine; view: ChecklistView; results: { res: string; preset?: string }[] }) {
  const { v, gone, added } = props.line;
  const view = props.view;
  const done = completedPresets(props.results);
  const stats = presetStats(props.results);
  const name = openingNameOf(v.leafFen) || chapterNameAt(view.sid, v.leafKey);
  const id = `${view.sid}|${view.color}|${v.leafKey}`;
  return (
    <li data-testid="checklist-line" class={gone ? 'gone' : undefined}>
      <div class="checklist-line-head">
        {name && <strong class="checklist-name">{name}</strong>} {added !== 'only' && <span class="muted">{(v.cumProb * 100).toFixed(1)}%</span>}{' '}
        {added && (
          <span class="checklist-added" data-testid="checklist-added" title="Added by you: it stays when the list is made again">
            added
          </span>
        )}
      </div>
      <div class="checklist-line">{gone ? <s>{lineText(v.lineSan)}</s> : <Moves id={id} lineUci={v.lineUci} lineSan={v.lineSan} color={view.color} />}</div>
      {gone ? (
        added ? (
          <p class="muted">
            No longer in the study ·{' '}
            <button type="button" class="link" onClick={() => unpickLine(view, props.line)}>
              Take it out
            </button>
          </p>
        ) : (
          <p class="muted">No longer in the study · Make again</p>
        )
      ) : (
        <div class="actions">
          {PRESET_ORDER.map((p) => {
            const st = stats[p];
            const isOpen = presetOpen(p, done);
            return (
              <button
                key={p}
                type="button"
                class={`preset-chip${done.has(p) ? ' done' : ''}`}
                disabled={!isOpen}
                style={st.n ? { background: winRateColor(st.rate), color: '#fff' } : undefined}
                title={st.n ? `${st.wins}/${st.n} of the last ${st.n}` : isOpen ? 'Not tried yet' : `Win ${PRESETS[PRESET_ORDER[PRESET_ORDER.indexOf(p) - 1]!].label} first`}
                onClick={() => {
                  touch(view.sid, view.color);
                  open({ name: 'checklist', sid: view.sid, side: view.color, line: v.lineUci, preset: p });
                }}
              >
                {done.has(p) ? '✓ ' : ''}
                {PRESETS[p].label}
                {st.n ? ` ${st.wins}/${st.n}` : ''}
              </button>
            );
          })}
          <button
            type="button"
            class="link"
            aria-label="Take this line out"
            title={added ? 'Take this line out of the checklist' : 'Take this line out: the next line takes its place'}
            onClick={() => {
              if (added) {
                if (confirm(`Take this line out of the checklist?\n\n${lineText(v.lineSan)}\n\nYou added it; add it again from the study.`)) unpickLine(view, props.line);
              } else if (confirm(`Take this line out?\n\n${lineText(v.lineSan)}\n\nThe next line takes its place.`)) excludeLine(v);
            }}
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}

/** Where the study reaches the position a reply is played from: its chapter and move path ([] its start). */
function chapterBefore(sid: string, color: Color, lineUci: readonly string[]): { cid: string; at: string[] } | undefined {
  const data = trainData.peek();
  if (!data) return undefined;
  const side = (cid: string) => data.chapters.get(`${sid}/${cid}`)?.headers.find(([h]) => h === 'Orientation')?.[1];
  if (lineUci.length <= 1) {
    for (const k of data.chapters.keys()) {
      const [s, cid] = k.split('/') as [string, string];
      if (s === sid && side(cid) === color) return { cid, at: [] };
    }
    return undefined;
  }
  const pos = positionOf(START)!;
  for (const uci of lineUci.slice(0, -1)) pos.play(parseUciMove(pos, uci)!);
  const at = data.index.reached.get(positionKeyOf(pos))?.find((o) => o.sid === sid && side(o.cid) === color);
  return at ? { cid: at.cid, at: [...at.path] } : undefined;
}

function GapRow(props: { gap: ChecklistGap; view: ChecklistView }) {
  const g = props.gap;
  const v = props.view;
  const where = chapterBefore(v.sid, v.color, g.lineUci);
  return (
    <li>
      <span class="checklist-line">
        <Moves id={`${v.sid}|${v.color}|gap|${g.lineUci.join(' ')}`} lineUci={g.lineUci} lineSan={g.lineSan} color={v.color} />
      </span>{' '}
      <span class="muted">· {Math.round(g.reachProb * 100)}%</span>{' '}
      <span class="actions">
        {where && (
          <button type="button" class="link" title="The chapter at the position, to add a move against this reply" onClick={() => open({ name: 'chapter', sid: v.sid, cid: where.cid, at: where.at })}>
            Open the chapter
          </button>
        )}{' '}
        <button type="button" class="link" onClick={() => open({ name: 'playOn', fen: g.afterFen, side: v.color })}>
          Practise
        </button>
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ the drill */

/** `#/checklist/<sid>?side=…&line=…&preset=…`: the line's lead-up, then the game from its end. */
export function ChecklistDrill(props: { sid: string; side: Color; line: string[]; preset: Preset }) {
  const v = useMemo(() => linesOf([{ m: props.line.join(' '), p: 0 }])[0], [props.line.join(' ')]);
  // Come back to from the analysis board (the owner's request, 2026-10-16): the game played on, or
  // the lead-up at the move it was left at.
  const [entry] = useState(entryKey);
  const [resumed] = useState(() => !!v && takeUpPractice(entry));
  const [k, setK] = useState(() => {
    const was = leadLeft;
    leadLeft = undefined;
    return resumed && v ? v.lineUci.length : was?.entry === entry ? was.k : 0;
  });
  const [note, setNote] = useState<string | undefined>(undefined);
  const color = props.side;
  const maiaElo = checklistMaia.value[props.preset];
  const fenAt = (n: number) => {
    const pos = positionOf(START)!;
    for (const uci of v!.lineUci.slice(0, n)) pos.play(parseUciMove(pos, uci)!);
    return makeFen(pos.toSetup());
  };
  const inLeadUp = !!v && k < v.lineUci.length;
  const fen = v ? fenAt(Math.min(k, v.lineUci.length)) : START;
  const turn = positionOf(fen)?.turn;
  // The opponent's moves of the lead-up, played after 0.4 s; at the end, the game starts.
  useEffect(() => {
    if (!v) return;
    if (!inLeadUp) {
      if (resumed && practice.peek()) return;
      const p = PRESETS[props.preset];
      startPractice({ kind: 'checklist', fen: v.leafFen, color, silent: true, title: lineText(v.lineSan), opponent: { ratings: [...p.ratings], speeds: [...RANK_SPEEDS], maiaElo, precision: p.precision }, preset: props.preset, leaf: v.leafKey, before: v.lineUci.map((_, n) => keyFen(fenAt(n))!.key) });
      return;
    }
    if (turn !== color) {
      const t = setTimeout(() => setK(k + 1), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [k, v]);
  const leading = useRef({ on: inLeadUp, k });
  leading.current = { on: inLeadUp, k };
  // Left for another page (the analysis board, say): the lead-up's move, or the game, kept for this entry.
  useEffect(
    () => () => {
      if (!leading.current.on) return parkPractice(entry);
      leavePractice();
      leadLeft = { entry, k: leading.current.k };
    },
    [],
  );
  if (!v) return <Stuck parent={{ name: 'checklists', sid: props.sid }}>That checklist line can’t be played from the start.</Stuck>;
  const back = (
    <div class="chapter-head">
      <Back parent={{ name: 'checklists', sid: props.sid, side: props.side }} />
      <div class="titles">
        <span class="study-title">Checklist · {PRESETS[props.preset].label}</span>
      </div>
    </div>
  );
  if (!inLeadUp && practice.value)
    return (
      <div class="games">
        {back}
        <PracticeBoard />
      </div>
    );
  const onMove = (uci: string) => {
    if (turn !== color) return;
    if (uci !== v.lineUci[k]) {
      const pos = positionOf(fen);
      const move = pos && parseUciMove(pos, uci);
      setNote(`${pos && move ? makeSanAndPlay(pos.clone(), move) : uci} isn’t your prep here: try again.`);
      return;
    }
    setNote(undefined);
    setK(k + 1);
  };
  const p = PRESETS[props.preset];
  return (
    <div class="games">
      {back}
      <div class="train-grid checklist-drill" data-step={k} data-testid="checklist-drill">
        <MoveBoard fen={fen} orientation={color} movable={turn === color} lastUci={k ? v.lineUci[k - 1] : undefined} onMove={onMove} />
        <div class="train-panel">
          <p class="train-counters">{lineText(v.lineSan)}</p>
          <p class="feedback train-feedback" role="status" data-testid="checklist-feedback">
            {note ?? (turn === color ? 'Your move: play your prep' : 'The opponent plays the line…')}
          </p>
          <p class="muted" data-testid="checklist-opponent">
            Then a game from the line’s end: the explorer’s games at {p.ratings[0]}–{p.ratings[p.ratings.length - 1]}, then Maia {maiaElo}.
          </p>
          <div class="actions train-actions">
            <button
              type="button"
              class="secondary"
              title="The analysis board at this position; ← comes back to the drill"
              onClick={() => analyseFrom({ fen: START, ...(k ? { line: v.lineSan.slice(0, k), show: k } : {}), side: color })}
            >
              Analyse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

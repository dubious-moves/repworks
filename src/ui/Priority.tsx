// The Prioritize panel (PLAN.md §5.70): a study's (or a chapter's) lines ranked by reach and by
// how hard their moves are to find, the number of lines to keep with the share of games they
// reach, the table, the uncovered replies, and Apply, which pauses the rest. Opened from the line
// list (a chapter's ⋯, or the list's own Prioritize button).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { mode, open } from '../app/mode.ts';
import { applyChanges, applyPriority, closePriority, linesOf, priorityPanel, priorityPrefs, priorityRun, rankingOf, RATINGS, runPriority, setPriorityPrefs, sidesOf, SPEEDS, stopPriority, type PriorityScope } from '../app/priority.ts';
import { trainData, type TrainData } from '../app/train.ts';
import type { Color } from '../core/games/record.ts';
import { coverageOf, keptLines } from '../core/repertoire/priority.ts';
import type { Line } from '../core/repertoire/index.ts';
import { header } from '../core/study/model.ts';
import { startPosition } from '../core/study/tree.ts';
import { movesFrom } from './LineList.tsx';

export function PriorityDialog() {
  const name = mode.value.name;
  useEffect(() => closePriority, [name]);
  const at = priorityPanel.value;
  const data = trainData.value;
  return at && data ? <Panel sid={at.sid} {...(at.cid === undefined ? {} : { cid: at.cid })} data={data} /> : null;
}

const pct = (x: number) => (x >= 0.1 ? `${Math.round(x * 100)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : '<0.1%');
const minutes = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);

function chapterName(data: TrainData, sid: string, cid: string): string {
  const c = data.chapters.get(`${sid}/${cid}`);
  return c ? (header(c, 'ChapterName') ?? cid) : cid;
}

function Panel(props: { sid: string; cid?: string; data: TrainData }) {
  const { sid, data } = props;
  const [whole, setWhole] = useState(props.cid === undefined);
  const cid = whole ? undefined : props.cid;
  const sides = sidesOf(data, sid, cid);
  const [chosen, setSide] = useState<Color>(sides[0] ?? 'white');
  const side = sides.includes(chosen) ? chosen : (sides[0] ?? chosen);
  const scope: PriorityScope = cid === undefined ? { sid, side } : { sid, cid, side };
  const lines = linesOf(data, scope);
  const prefs = priorityPrefs.value;
  const run = priorityRun.value;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
  }, []);
  const title = cid === undefined ? (data.studyNames.get(sid) ?? sid) : chapterName(data, sid, cid);
  const sameScope = run && run.scope.sid === sid && run.scope.cid === cid && run.scope.side === side;
  const toggle = <T,>(list: readonly T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  return (
    <dialog ref={ref} class="study-dialog priority-dialog" aria-labelledby="dialog-priority" onCancel={(e) => (e.preventDefault(), closePriority())}>
      <div class="form">
        <h2 id="dialog-priority">Prioritize: {title}</h2>
        <p class="muted">
          Lines ranked by how often you'll face them (the Lichess explorer) and how hard their moves are to find. The lines you don't keep are paused: still in the study, out of learning and review.
        </p>
        {props.cid !== undefined && (
          <div class="priority-row" role="radiogroup" aria-label="Scope">
            <label class="check">
              <input type="radio" name="priority-scope" checked={whole} onChange={() => setWhole(true)} /> The whole study
            </label>
            <label class="check">
              <input type="radio" name="priority-scope" checked={!whole} onChange={() => setWhole(false)} /> This chapter
            </label>
          </div>
        )}
        {sides.length > 1 && (
          <div class="priority-row" role="radiogroup" aria-label="Side">
            {sides.map((c) => (
              <label class="check" key={c}>
                <input type="radio" name="priority-side" checked={side === c} onChange={() => setSide(c)} /> {c === 'white' ? 'White' : 'Black'} lines
              </label>
            ))}
          </div>
        )}
        <fieldset class="priority-filter">
          <legend>Opponents</legend>
          <div class="priority-chips" aria-label="Ratings">
            {RATINGS.map((r) => (
              <label class="chip-check" key={r}>
                <input type="checkbox" checked={prefs.ratings.includes(r)} onChange={() => setPriorityPrefs({ ratings: toggle(prefs.ratings, r).sort((a, b) => a - b) })} /> {r}
              </label>
            ))}
          </div>
          <div class="priority-chips" aria-label="Speeds">
            {SPEEDS.map((s) => (
              <label class="chip-check" key={s}>
                <input type="checkbox" checked={prefs.speeds.includes(s)} onChange={() => setPriorityPrefs({ speeds: SPEEDS.filter((x) => (x === s ? !prefs.speeds.includes(s) : prefs.speeds.includes(x))) })} /> {s}
              </label>
            ))}
          </div>
        </fieldset>
        <label class="check">
          <input type="checkbox" checked={prefs.natural} onChange={(e) => setPriorityPrefs({ natural: e.currentTarget.checked })} /> Natural moves count less{' '}
          <span class="muted">(a move most players find anyway needs less study)</span>
        </label>
        {(!sameScope || run?.phase === 'error') && (
          <div class="actions">
            <button type="button" disabled={lines.length === 0 || prefs.ratings.length === 0 || prefs.speeds.length === 0} onClick={() => void runPriority(scope)}>
              Rank {lines.length} line{lines.length === 1 ? '' : 's'}
            </button>
            <button type="button" class="secondary" onClick={closePriority}>
              Close
            </button>
          </div>
        )}
        {sameScope && run.phase === 'error' && (
          <p class="error" role="alert">
            {run.login ? 'The Lichess explorer needs your Lichess login (Settings → Lichess).' : `The explorer couldn't answer: ${run.error}`}
          </p>
        )}
        {sameScope && run.phase === 'scoring' && <Scoring run={run} />}
        {sameScope && run.phase === 'ranked' && <Ranked run={run} data={data} />}
      </div>
    </dialog>
  );
}

function Scoring(props: { run: Extract<NonNullable<typeof priorityRun.value>, { phase: 'scoring' }> }) {
  const { done, total, started } = props.run;
  const left = done > 0 && total > done ? ((Date.now() - started) / done) * (total - done) : undefined;
  return (
    <div class="priority-scoring" role="status">
      <p>
        Scoring: {done}/{total || '…'} positions{left !== undefined && `, about ${minutes(left)} left`}
      </p>
      <progress max={total || 1} value={done} />
      <div class="actions">
        <button type="button" class="secondary" onClick={stopPriority}>
          Stop
        </button>
      </div>
    </div>
  );
}

function Ranked(props: { run: Extract<NonNullable<typeof priorityRun.value>, { phase: 'ranked' }>; data: TrainData }) {
  const { run, data } = props;
  const { numbers } = run;
  const prefs = priorityPrefs.value;
  // Ordered here, from the run's lookups: the checkboxes re-order at once.
  const ranking = useMemo(() => rankingOf(run, prefs), [run, prefs.natural, prefs.keepLearned]);
  const others = ranking.lines.filter((r) => !(prefs.keepLearned && r.learned)).length;
  const musts = ranking.lines.filter((r) => r.first).length;
  const active = ranking.lines.filter((r) => !r.line.paused && !(prefs.keepLearned && r.learned)).length;
  const [wanted, setCount] = useState(Math.max(musts, Math.min(others, active === ranking.lines.length ? Math.min(20, others) : active)));
  const count = Math.max(Math.min(musts, others), Math.min(wanted, others));
  const kept = useMemo(() => keptLines(ranking, count, prefs.keepLearned), [ranking, count, prefs.keepLearned]);
  const changes = useMemo(() => applyChanges(ranking, count, prefs.keepLearned), [ranking, count, prefs.keepLearned]);
  const pausing = changes.filter((c) => c.mark === 'paused').length;
  const unpausing = changes.length - pausing;
  const [applied, setApplied] = useState<number | undefined>(undefined);
  const starts = useMemo(() => new Map([...data.chapters].map(([k, c]) => [k, startPosition(c)])), [data]);
  const apply = async () => setApplied(await applyPriority(ranking, count, prefs.keepLearned));
  return (
    <>
      <label class="priority-count">
        Lines to keep: <strong>{count}</strong> · {pct(coverageOf(ranking, kept))} of your games here
        <input type="range" min={Math.min(musts, others)} max={others} value={count} onInput={(e) => setCount(Number(e.currentTarget.value))} aria-label="Lines to keep" />
      </label>
      <label class="check">
        <input type="checkbox" checked={prefs.keepLearned} onChange={(e) => setPriorityPrefs({ keepLearned: e.currentTarget.checked })} /> Keep lines already learned{' '}
        <span class="muted">(they don't use the number)</span>
      </label>
      {applied === undefined ? (
        <div class="actions">
          <button type="button" disabled={changes.length === 0} onClick={() => void apply()}>
            {changes.length === 0 ? 'Nothing to change' : `Apply: pause ${pausing}${unpausing ? `, unpause ${unpausing}` : ''}`}
          </button>
          <button type="button" class="secondary" onClick={closePriority}>
            Close
          </button>
        </div>
      ) : (
        <div class="actions">
          <p class="muted" role="status">
            Applied: {applied} line{applied === 1 ? '' : 's'} changed. Paused lines stay in the study; Unpause all lines (a chapter's ⋯) undoes it.
          </p>
          <button type="button" onClick={closePriority}>
            Done
          </button>
        </div>
      )}
      <div class="priority-table-wrap">
        <table class="priority-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Line</th>
              <th scope="col">Reach</th>
              <th scope="col" title="Moves played by fewer than 3 in 10 players at these ratings">Hard</th>
              <th scope="col">Now</th>
            </tr>
          </thead>
          <tbody>
            {ranking.lines.map((r) => {
              const keep = kept.has(r.line);
              const k = `${r.line.sid}/${r.line.cid}`;
              return (
                <tr key={r.rank} class={keep ? 'kept' : 'dropped'}>
                  <td>{r.rank}</td>
                  <td>
                    <button type="button" class="link" onClick={() => (closePriority(), open({ name: 'train', sid: r.line.sid, cid: r.line.cid, at: [...r.line.path] }))}>
                      {chapterName(data, r.line.sid, r.line.cid)} · Line {numbers.get(r.line) ?? '?'}
                    </button>
                    {r.line.must && <span class="line-list-must" title="Must learn"> ★</span>}
                    <span class="muted priority-moves">{movesFrom(starts.get(k), r.line.path, 0)}</span>
                  </td>
                  <td>{r.ownStart ? `${pct(r.reach)}*` : pct(r.reach)}</td>
                  <td>{r.hard}</td>
                  <td>
                    {r.learned ? 'learned' : r.line.paused ? 'paused' : 'active'}
                    {!keep && !r.line.paused && <span class="priority-will"> → paused</span>}
                    {keep && r.line.paused && <span class="priority-will"> → active</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ranking.lines.some((r) => r.ownStart) && <p class="muted">* A chapter starting from a position no other line reaches: its reach is counted from its own start.</p>}
      {ranking.gaps.length > 0 && (
        <section class="priority-gaps" aria-label="Replies not covered">
          <h3>Replies the study doesn't answer</h3>
          <ul>
            {ranking.gaps.map((g) => (
              <li key={`${g.cid}/${g.path.join(' ')}/${g.san}`}>
                <button type="button" class="link" onClick={() => (closePriority(), open({ name: 'chapter', sid: g.sid, cid: g.cid, at: g.path }))}>
                  {movesFrom(starts.get(`${g.sid}/${g.cid}`), [...g.path, g.san], 0)}
                </button>{' '}
                <span class="muted">
                  {pct(g.share)} there · {pct(g.reach)} of games
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

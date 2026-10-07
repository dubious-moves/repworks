// The variation checklist (PLAN.md §5.62), on the repertoire check: a study's lines that matter
// most, made from the explorer's answers, each with its three difficulties (Easy, Medium, Hard:
// the opponent's strength), checked off by a win, the last five attempts' score on each chip;
// a line taken out (✕) is replaced from the reserve. The drill: the line's lead-up played from the
// start (your moves asked, the opponent's played; a move off your prep is refused), then a game
// from its end against the preset's opponent, won by mate or Claim victory.
import { useEffect, useState } from 'preact/hooks';
import { open } from '../app/mode.ts';
import { checklists, checklistStudies, excludedLeaves, excludeLine, generating, makeChecklist, restoreExcluded } from '../app/checklist.ts';
import { lichessToken } from '../app/lichess.ts';
import { leavePractice, practice, startPractice } from '../app/practice.ts';
import { practiceResults } from '../app/repertoireCheck.ts';
import { completedPresets, PRESET_ORDER, PRESETS, presetOpen, presetStats, RANK_SPEEDS, type Preset, type Variation } from '../core/games/checklist.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { positionOf } from '../core/storm/walk.ts';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { MoveBoard, PracticeBoard } from './Practice.tsx';
import { winRateColor } from './RepertoireCheck.tsx';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** "1. e4 e5 2. Nf3 Nc6", from the start. */
function lineText(sans: readonly string[]): string {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ');
}

export function ChecklistSection() {
  const studies = checklistStudies.value;
  const [sid, setSid] = useState('');
  const [ply, setPly] = useState(10);
  const [count, setCount] = useState(10);
  const chosen = studies.find((s) => s.sid === sid) ?? studies[0];
  const list = chosen ? checklists.value[chosen.sid] : undefined;
  const gen = generating.value;
  const results = practiceResults.value;
  const excluded = excludedLeaves.value;
  return (
    <section class="card" data-testid="checklist">
      <div class="card-head">
        <h2>Variation checklist</h2>
      </div>
      {!studies.length ? (
        <p class="muted">No repertoire study yet.</p>
      ) : (
        <>
          <div class="games-filters">
            <select aria-label="Study" value={chosen?.sid} onChange={(e) => setSid((e.target as HTMLSelectElement).value)}>
              {studies.map((s) => (
                <option key={s.sid} value={s.sid}>
                  {s.name} ({s.color})
                </option>
              ))}
            </select>
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
            <button type="button" disabled={!!gen || !chosen} onClick={() => chosen && void makeChecklist(chosen.sid, chosen.color, ply, count)}>
              {gen ? `Asking the explorer… ${gen.calls}` : list ? 'Make again' : 'Make'}
            </button>
          </div>
          {!lichessToken() && <p class="muted">The explorer needs the Lichess login: without it every line is weighted the same.</p>}
          {list && (
            <>
              <p class="muted">
                {list.variations.length} line{list.variations.length === 1 ? '' : 's'}, made {new Date(list.createdAt).toISOString().slice(0, 10)} ({list.calls} positions asked{list.truncated ? ', cut short' : ''}). Win a line at each difficulty to check it off.
              </p>
              <ol class="checklist-lines">
                {list.variations.map((v, i) => (
                  <Line key={v.leafKey} v={v} i={i} sid={list.sid} results={results.filter((r) => r.key === v.leafKey)} />
                ))}
              </ol>
              {excluded.size > 0 && (
                <p class="muted">
                  {excluded.size} line{excluded.size === 1 ? '' : 's'} taken out.{' '}
                  <button type="button" class="link" onClick={restoreExcluded}>
                    Restore all
                  </button>{' '}
                  (they come back at the next Make)
                </p>
              )}
              {list.gaps.length > 0 && (
                <details>
                  <summary>Replies the study doesn’t cover ({list.gaps.length})</summary>
                  <ul class="repcheck-list">
                    {list.gaps.map((g) => (
                      <li key={g.lineSan.join(' ')}>
                        {lineText(g.lineSan)} <span class="muted">· {Math.round(g.reachProb * 100)}%</span>{' '}
                        <button type="button" class="link" onClick={() => open({ name: 'playOn', fen: g.afterFen, side: list.color })}>
                          Practise
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Line(props: { v: Variation; i: number; sid: string; results: { res: string; preset?: string }[] }) {
  const { v } = props;
  const done = completedPresets(props.results);
  const stats = presetStats(props.results);
  return (
    <li data-testid="checklist-line">
      <span class="checklist-line">{lineText(v.lineSan)}</span> <span class="muted">· {(v.cumProb * 100).toFixed(1)}%</span>
      <span class="actions">
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
              onClick={() => open({ name: 'checklist', sid: props.sid, i: props.i, preset: p })}
            >
              {done.has(p) ? '✓ ' : ''}
              {PRESETS[p].label}
              {st.n ? ` ${st.wins}/${st.n}` : ''}
            </button>
          );
        })}
        <button type="button" class="link" title="Take this line out: the next line takes its place" onClick={() => excludeLine(props.sid, v)}>
          ✕
        </button>
      </span>
    </li>
  );
}

/** `#/checklist/<sid>/<i>?preset=…`: the line's lead-up, then the game from its end. */
export function ChecklistDrill(props: { sid: string; i: number; preset: Preset }) {
  const list = checklists.value[props.sid];
  const v = list?.variations[props.i];
  const [k, setK] = useState(0);
  const [note, setNote] = useState<string | undefined>(undefined);
  const color = list?.color ?? 'white';
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
      const p = PRESETS[props.preset];
      startPractice({ kind: 'checklist', fen: v.leafFen, color, silent: true, title: lineText(v.lineSan), opponent: { ratings: [...p.ratings], speeds: [...RANK_SPEEDS], maiaElo: p.maiaElo, precision: p.precision }, preset: props.preset, leaf: v.leafKey });
      return;
    }
    if (turn !== color) {
      const t = setTimeout(() => setK(k + 1), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [k, v]);
  useEffect(() => () => leavePractice(), []);
  if (!list || !v) return <p class="warn">That checklist line isn’t on this device: make the checklist again.</p>;
  const back = (
    <div class="chapter-head">
      <a href="#/repertoire-check" class="back">
        ←
      </a>
      <div class="titles">
        <span class="study-title">Checklist · {PRESETS[props.preset].label}</span>
      </div>
    </div>
  );
  if (!inLeadUp && practice.value) return (
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
        </div>
      </div>
    </div>
  );
}

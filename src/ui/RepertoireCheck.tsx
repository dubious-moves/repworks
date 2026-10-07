// What the games say about the repertoire (PLAN.md §5.58–§5.60), mistake-lab's Repertoire tab:
// the weak spots (the real games' and the practice results'), the deviations (the first move off
// the repertoire in a game, grouped by position: open its chapter, train the line, pin the
// repertoire's move, dismiss) and the gaps (an opponent's reply the repertoire doesn't cover).
import { useEffect, useState } from 'preact/hooks';
import { open } from '../app/mode.ts';
import { recordEvent } from '../app/state.ts';
import { startGames } from '../app/games.ts';
import { botSpots, dismissed, humanSpots, repertoireCheck, setDismissed } from '../app/repertoireCheck.ts';
import { trainData } from '../app/train.ts';
import { ChecklistSection } from './Checklist.tsx';
import { checklists } from '../app/checklist.ts';
import { deviationPasses, type Deviation, type Gap } from '../core/games/deviations.ts';
import type { PositionKey } from '../core/chess/positionKey.ts';
import { repertoireCard } from '../core/progress/cards.ts';
import { positionOf } from '../core/storm/walk.ts';
import { makeFen } from 'chessops/fen';
import { parseUciMove } from '../core/chess/uci.ts';

const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

/** "12. Bc4" or "12… Bc4", from the position before the move. */
function moveLabel(fen: string, san: string): string {
  const [, turn, , , , n] = fen.split(' ');
  return `${n ?? '1'}${turn === 'b' ? '…' : '.'} ${san}`;
}

function fenAfter(fen: string, uci: string): string | undefined {
  const pos = positionOf(fen);
  const move = pos && parseUciMove(pos, uci);
  if (!pos || !move) return undefined;
  pos.play(move);
  return makeFen(pos.toSetup());
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** mistake-lab's `winRateColor`: red at 0, orange at ½, yellow-green at ¾, green at 1. */
export function winRateColor(rate: number): string {
  const stops: [number, number][] = [
    [0, 0],
    [0.5, 30],
    [0.75, 78],
    [1, 122],
  ];
  let hue = 0;
  for (let i = 1; i < stops.length; i++) {
    const [r0, h0] = stops[i - 1]!;
    const [r1, h1] = stops[i]!;
    if (rate <= r1) {
      hue = h0 + ((h1 - h0) * (rate - r0)) / (r1 - r0);
      break;
    }
  }
  return `hsl(${Math.round(hue)}, 55%, 45%)`;
}

export function RepertoireCheckScreen() {
  useEffect(() => startGames(), []);
  return (
    <div class="games repcheck">
      <div class="chapter-head">
        <a href="#/games" class="back">
          ←
        </a>
        <div class="titles">
          <span class="study-title">Repertoire check</span>
        </div>
      </div>
      <WeakSpots />
      <Deviations />
      <Gaps />
      <ChecklistSection />
    </div>
  );
}

function WeakSpots() {
  const [lens, setLens] = useState<'human' | 'bot'>('human');
  const rows = lens === 'human' ? humanSpots.value : botSpots.value;
  return (
    <section class="card" data-testid="weak-spots">
      <div class="card-head">
        <h2>Weak spots</h2>
        <div class="actions">
          <button type="button" class={lens === 'human' ? '' : 'secondary'} aria-pressed={lens === 'human'} onClick={() => setLens('human')}>
            Your games
          </button>
          <button type="button" class={lens === 'bot' ? '' : 'secondary'} aria-pressed={lens === 'bot'} onClick={() => setLens('bot')}>
            Practice
          </button>
        </div>
      </div>
      <p class="muted">{lens === 'human' ? 'Opponent replies you score under 50% against, over 5 games at least (the most common ones, a whole opening, left out).' : 'Positions you practised 5 times at least, by difficulty, scoring under 50%.'}</p>
      {rows.length === 0 ? (
        <p class="muted">None found.</p>
      ) : (
        <ul class="repcheck-list">
          {lens === 'human'
            ? humanSpots.value.map((r) => (
                <li key={`${r.key}|${r.san}`}>
                  <span class="score-pill" style={{ background: winRateColor(r.score) }}>
                    {pct(r.score)}
                  </span>{' '}
                  They play <strong>{moveLabel(r.fen, r.san)}</strong>{' '}
                  <span class="muted">
                    · {r.w}–{r.l}–{r.d} over {r.total} · you play {r.userColor}
                  </span>
                  <span class="actions">
                    <button type="button" class="link" onClick={() => open({ name: 'analysis', fen: r.fen })}>
                      Analyse
                    </button>{' '}
                    <button
                      type="button"
                      class="link"
                      onClick={() => {
                        const f = fenAfter(r.fen, r.uci);
                        if (f) open({ name: 'playOn', fen: f, side: r.userColor });
                      }}
                    >
                      Practise
                    </button>
                  </span>
                </li>
              ))
            : botSpots.value.map((r) => (
                <li key={`${r.key}|${r.preset}`}>
                  <span class="score-pill" style={{ background: winRateColor(r.score) }}>
                    {pct(r.score)}
                  </span>{' '}
                  <strong>{r.preset === 'practice' ? 'Practice' : r.preset}</strong>{' '}
                  <span class="muted">
                    · {r.w}–{r.l}–{r.d} over {r.total}
                  </span>
                  <span class="actions">
                    {(() => {
                      // A checklist line's leaf: its drill at that difficulty (mistake-lab's Drill).
                      for (const list of Object.values(checklists.value)) {
                        const i = list.variations.findIndex((v) => v.leafKey === r.key);
                        if (i >= 0 && (r.preset === 'easy' || r.preset === 'medium' || r.preset === 'hard'))
                          return (
                            <>
                              <button type="button" class="link" onClick={() => open({ name: 'checklist', sid: list.sid, i, preset: r.preset as 'easy' })}>
                                Drill
                              </button>{' '}
                            </>
                          );
                      }
                      return null;
                    })()}
                    <button type="button" class="link" onClick={() => open({ name: 'analysis', fen: `${r.key} 0 1` })}>
                      Analyse
                    </button>{' '}
                    <button type="button" class="link" onClick={() => open({ name: 'playOn', fen: `${r.key} 0 1` })}>
                      Practise
                    </button>
                  </span>
                </li>
              ))}
        </ul>
      )}
    </section>
  );
}

function Deviations() {
  const check = repertoireCheck.value;
  const [color, setColor] = useState<'' | 'white' | 'black'>('');
  const [speeds, setSpeeds] = useState<string[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const shown = (check?.deviations ?? []).filter((d) => deviationPasses(d, { color, speeds }));
  const present = new Set((check?.deviations ?? []).flatMap((d) => d.games.map((g) => g.speed)));
  return (
    <section class="card" data-testid="deviations">
      <div class="card-head">
        <h2>Deviations</h2>
        <span class="muted">{check ? `${shown.length} position${shown.length === 1 ? '' : 's'}` : 'Reading…'}</span>
      </div>
      <p class="muted">The first move in each game where you left your repertoire, grouped by position, the most games first.</p>
      <div class="games-filters">
        <select aria-label="Colour" value={color} onChange={(e) => setColor((e.target as HTMLSelectElement).value as typeof color)}>
          <option value="">Both colours</option>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
        {SPEEDS.filter((s) => present.has(s)).map((sp) => (
          <label key={sp} class="chip">
            <input type="checkbox" checked={speeds.includes(sp)} onChange={(e) => setSpeeds((e.target as HTMLInputElement).checked ? [...speeds, sp] : speeds.filter((x) => x !== sp))} /> {sp}
          </label>
        ))}
      </div>
      <ul class="repcheck-list">
        {shown.map((d) => (
          <DeviationRow key={d.key} d={d} />
        ))}
      </ul>
      {dismissed.value.size > 0 && (
        <p class="muted">
          {dismissed.value.size} position{dismissed.value.size === 1 ? '' : 's'} dismissed.{' '}
          <button type="button" class="link" onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide' : 'Show'}
          </button>
        </p>
      )}
      {showDismissed && (
        <ul class="repcheck-list" data-testid="dismissed">
          {[...dismissed.value].map((k) => (
            <li key={k}>
              <code>{k}</code>{' '}
              <button type="button" class="link" onClick={() => setDismissed(k, false)}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeviationRow(props: { d: Deviation }) {
  const d = props.d;
  const g = d.games[0]!;
  const at = d.repertoire.at;
  const data = trainData.value;
  const card = repertoireCard(d.key, d.repertoire.uci);
  const pinned = !!data?.pins.get(card)?.pinned;
  return (
    <li data-testid="deviation">
      <strong>{moveLabel(d.fenBefore, g.played.san)}</strong> <span class="muted">({d.games.length} game{d.games.length === 1 ? '' : 's'}, the last {new Date(g.createdAt).toISOString().slice(0, 10)})</span> · your repertoire: <strong>{d.repertoire.san}</strong>
      <span class="muted"> · as {d.color}</span>
      <span class="actions">
        <button type="button" class="link" onClick={() => open({ name: 'chapter', sid: at.sid, cid: at.cid, at: [...at.path.slice(0, -1)] })}>
          Open the chapter
        </button>{' '}
        <button type="button" class="link" onClick={() => open({ name: 'train', sid: at.sid, cid: at.cid, at: [...at.path] })}>
          Train the line
        </button>{' '}
        <button type="button" class="link" disabled={pinned} onClick={() => void recordEvent({ t: new Date().toISOString(), k: 'pin', card })}>
          {pinned ? 'Pinned' : 'Pin'}
        </button>{' '}
        <a class="link" href={`#/games/${g.gameId}?ply=${g.ply - 1}`}>
          The game
        </a>{' '}
        <button type="button" class="link" onClick={() => setDismissed(d.key, true)}>
          Dismiss
        </button>
      </span>
    </li>
  );
}

function Gaps() {
  const check = repertoireCheck.value;
  const index = trainData.value?.index;
  const gaps = check?.gaps ?? [];
  return (
    <section class="card" data-testid="gaps">
      <div class="card-head">
        <h2>Gaps</h2>
        <span class="muted">{check ? `${gaps.length}` : 'Reading…'}</span>
      </div>
      <p class="muted">Replies your opponents played that your repertoire doesn’t answer.</p>
      <ul class="repcheck-list">
        {gaps.slice(0, 50).map((g) => (
          <GapRow key={`${g.key}|${g.move.san}`} g={g} reachedAt={index?.reached.get(g.key as PositionKey)?.[0]} />
        ))}
      </ul>
    </section>
  );
}

function GapRow(props: { g: Gap; reachedAt: { sid: string; cid: string; path: readonly string[] } | undefined }) {
  const g = props.g;
  const r = props.reachedAt;
  return (
    <li data-testid="gap">
      They played <strong>{moveLabel(g.fen, g.move.san)}</strong> <span class="muted">({g.games.length} game{g.games.length === 1 ? '' : 's'}) · as {g.color}</span>
      <span class="actions">
        {r && (
          <>
            <button type="button" class="link" onClick={() => open({ name: 'chapter', sid: r.sid, cid: r.cid, at: [...r.path] })}>
              Open the chapter
            </button>{' '}
          </>
        )}
        <button
          type="button"
          class="link"
          onClick={() => {
            const f = fenAfter(g.fen, g.move.uci);
            if (f) open({ name: 'playOn', fen: f, side: g.color });
          }}
        >
          Practise
        </button>
      </span>
    </li>
  );
}

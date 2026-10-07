// mistake-lab's engine line panel (PLAN.md §6, item 1), shared by the game cards and the practice
// game's review: the moves as PGN with the alternatives in brackets, each a click away; ‹ › step it.
import { Fragment, type ComponentChildren } from 'preact';
import { lineScore, type EngineLine } from '../core/games/engineLine.ts';

/** A White-relative score in pawns (a mate ±10,000 as ±M). */
export function formatCp(cp: number): string {
  if (Math.abs(cp) >= 10000) return cp > 0 ? '+M' : '−M';
  return `${cp >= 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(1)}`;
}

export function EngineLinePanel(props: {
  line: EngineLine;
  busy: boolean;
  /** The panel's heading, before the score. */
  title: ComponentChildren;
  hint: string;
  onMain(idx: number): void;
  onAlt(alt: number, idx: number): void;
  onStep(delta: number): void;
  /** More buttons after ‹ ›. */
  children?: ComponentChildren;
}) {
  const l = props.line;
  const [, turn, , , , full] = l.baseFen.split(' ');
  const startNum = Number(full) || 1;
  const startWhite = turn === 'w';
  const byBranch = new Map<number, number[]>();
  l.alternatives.forEach((a, i) => byBranch.set(a.branchIdx, [...(byBranch.get(a.branchIdx) ?? []), i]));
  // Move numbers by the index on the path: index i is the (i+1)-th ply after the start.
  const numbered = (idx: number, first: boolean) => {
    const ply = idx + (startWhite ? 0 : 1);
    const num = startNum + Math.floor(ply / 2);
    const white = ply % 2 === 0;
    return white ? `${num}. ` : first ? `${num}… ` : '';
  };
  const alt = (ai: number) => {
    const a = l.alternatives[ai]!;
    return (
      <span key={`alt${ai}`} class="line-alt" data-alt={ai}>
        (
        {a.moves.map((m, j) => {
          const idx = a.branchIdx + 1 + j;
          const active = l.activeAlt === ai && l.currentIdx === idx;
          return (
            <span key={j} class={`game-move${active ? ' current' : ''}`}>
              <span class="muted">{numbered(idx, j === 0)}</span>
              <button type="button" class="link" data-idx={idx} onClick={() => props.onAlt(ai, idx)}>
                {m.san}
              </button>{' '}
            </span>
          );
        })}
        ){' '}
      </span>
    );
  };
  const score = lineScore(l);
  return (
    <div class="engine-line-box" data-testid="engine-line" data-idx={l.currentIdx} data-alt={l.activeAlt}>
      <p class="muted">
        {props.title}
        {score != null ? ` · ${formatCp(score)}` : ''}
        {props.busy ? ' · Stockfish is thinking…' : ''}
      </p>
      <div class="game-moves">
        {(byBranch.get(-1) ?? []).map(alt)}
        {l.moves.map((m, i) => (
          <Fragment key={i}>
            <span class={`game-move${l.activeAlt === -1 && l.currentIdx === i ? ' current' : ''}${m.isUser ? ' line-user' : ''}`}>
              <span class="muted">{numbered(i, i === 0)}</span>
              <button type="button" class="link" data-idx={i} onClick={() => props.onMain(i)}>
                {m.san}
              </button>{' '}
            </span>
            {(byBranch.get(i) ?? []).map(alt)}
          </Fragment>
        ))}
      </div>
      <div class="actions">
        <button type="button" class="secondary" aria-label="Back a move" onClick={() => props.onStep(-1)}>
          ‹
        </button>
        <button type="button" class="secondary" aria-label="On a move" onClick={() => props.onStep(1)}>
          ›
        </button>
        {props.children}
        <span class="muted line-hint">{props.hint}</span>
      </div>
    </div>
  );
}

// The engine panel on the study page (PLAN.md §5.31), as Qchess's engine bar: the switch, the
// engine's name, the depth (with the speed while it computes), "+" to go deeper, the threat and
// the settings; under it one row per line, its eval from White's side and its moves, each move a
// line to preview on the board (◀ ▶ Back), which the preview bar's Add puts in the chapter. The
// eval bar sits by the board, and the arrows go to the board as auto shapes.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { analysis, enginePrefs, engineStatus, goDeeper, retryEngine, runningThreads, setThreat, threat, updateEnginePrefs } from '../app/engine.ts';
import { previewOf, showLine } from '../app/preview.ts';
import type { Analysis, EngineLine } from '../core/engine/search.ts';
import { engineArrows, type EngineArrow } from '../core/engine/shapes.ts';
import { formatScore } from '../core/engine/uci.ts';
import { whiteShare } from '../core/engine/winning.ts';
import { makeSanAndPlay } from 'chessops/san';
import { parseUciMove } from '../core/chess/uci.ts';
import type { PlayedLine } from '../core/repertoire/lines.ts';
import { openEngineSettings } from './EngineSettings.tsx';
import { maiaPrefs, maiaState, setMaiaOn } from '../app/maia.ts';

/** Moves shown in a row (the row is cut to its width on a narrow screen). */
const SHOWN_MOVES = 16;

const formatNps = (nps: number): string => (nps >= 1e6 ? `${(nps / 1e6).toFixed(1)} Mn/s` : nps >= 1000 ? `${Math.round(nps / 1000)} kn/s` : `${nps} n/s`);

/** A line played from the analysed position, as the preview takes it. */
function playPv(start: Position, pv: readonly string[]): PlayedLine {
  const pos = start.clone();
  const out: PlayedLine = { line: { from: 0, to: 0, number: pos.fullmoves, turn: pos.turn, moves: [] }, placed: true, positions: [pos.clone()], ucis: [], sans: [] };
  for (const uci of pv.slice(0, SHOWN_MOVES)) {
    const move = parseUciMove(pos, uci);
    if (!move) break;
    out.sans.push(makeSanAndPlay(pos, move));
    out.ucis.push(uci);
    out.positions.push(pos.clone());
  }
  return out;
}

/** The analysis shown, and its position, when it is for the board (or its threat). */
function useShown(): { a: Analysis; start: Position } | undefined {
  const a = analysis.value;
  return useMemo(() => {
    if (!a) return undefined;
    const setup = parseFen(a.fen);
    if (setup.isErr) return undefined;
    const pos = Chess.fromSetup(setup.value);
    return pos.isOk ? { a, start: pos.value } : undefined;
  }, [a]);
}

function statusText(board: Position | undefined, shown: { a: Analysis } | undefined): string {
  const s = engineStatus.value;
  if (s.kind === 'loading') return s.received < s.total ? `Loading ${(s.total / 1e6).toFixed(1)} MB… ${Math.floor((100 * s.received) / s.total)}%` : 'Starting…';
  if (s.kind === 'failed') return s.reason;
  if (board?.isCheckmate()) return 'Checkmate';
  if (board?.isStalemate()) return 'Stalemate';
  if (board?.isEnd()) return 'Draw';
  if (threat.value && board?.isCheck()) return 'No threat while in check';
  if (!shown) return s.kind === 'ready' ? 'Computing…' : '';
  const a = shown.a;
  return `Depth ${a.depth}${a.nps ? ` · ${formatNps(a.nps)}` : ''}`;
}

export function EnginePanel(props: { board: Position | undefined }) {
  const prefs = enginePrefs.value;
  const shown = useShown();
  const on = prefs.on;
  const status = engineStatus.value;
  const canDeeper = on && !threat.value && !!shown && shown.a.done && !shown.a.noMove;
  // Its height, for the explorer's room below it (app.css: --engine-h on the panel).
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    const parent = el?.parentElement;
    if (!el || !parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => parent.style.setProperty('--engine-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      parent.style.removeProperty('--engine-h');
    };
  }, []);
  return (
    <section class="engine" aria-label="Engine" ref={box}>
      <div class="engine-bar">
        <MaiaSwitch />
        <label class="switch" title="Stockfish on or off">
          <input type="checkbox" role="switch" aria-label="Engine" checked={on} onChange={(e) => updateEnginePrefs({ on: e.currentTarget.checked })} />
          <span class="slider" />
        </label>
        <span class="engine-name">SF{enginePrefs.value.version}{on && runningThreads() > 1 ? ` ×${runningThreads()}` : ''}</span>
        <span class="engine-depth" aria-live="polite">
          {on ? statusText(props.board, shown) : ''}
        </span>
        {status.kind === 'failed' && on && (
          <button type="button" class="link" onClick={retryEngine}>
            Retry
          </button>
        )}
        {canDeeper && (
          <button type="button" class="icon engine-deeper" aria-label="Go deeper" title="Go deeper" onClick={goDeeper}>
            +
          </button>
        )}
        <span class="spacer" />
        <button type="button" class={`icon engine-threat${threat.value ? ' on' : ''}`} aria-pressed={threat.value} aria-label="Show threat" title="Show threat (W)" onClick={() => setThreat(!threat.value)}>
          ⌖
        </button>
        <button type="button" class="icon" aria-label="Engine settings" title="Engine settings" onClick={openEngineSettings}>
          ⚙
        </button>
      </div>
      {on && shown && shown.a.lines.length > 0 && (
        <ol class="engine-lines">
          {shown.a.lines.map((l) => (
            <LineRow key={l.multipv} line={l} start={shown.start} threat={threat.value} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Qchess's "Maia3" switch, beside the engine's: Maia's columns in the explorer (§5.33). */
function MaiaSwitch() {
  const on = maiaPrefs.value.on;
  const s = maiaState.value;
  const note = !on ? '' : s.kind === 'loading' ? '…' : s.kind === 'downloading' ? ` ${Math.floor((100 * s.received) / s.total)}%` : s.kind === 'failed' ? ' !' : '';
  return (
    <span class="maia-switch" title={s.kind === 'failed' ? s.reason : 'Maia: human move predictions in the explorer'}>
      <label class="switch">
        <input type="checkbox" role="switch" aria-label="Maia" checked={on} onChange={(e) => setMaiaOn(e.currentTarget.checked)} />
        <span class="slider" />
      </label>
      <span class="maia-name">
        Maia3{note}
      </span>
    </span>
  );
}

function LineRow(props: { line: EngineLine; start: Position; threat: boolean }) {
  const played = useMemo(() => playPv(props.start, props.line.pv), [props.start, props.line.pv]);
  const key = `engine#${props.line.multipv}`;
  const p = previewOf('chapter');
  const current = p?.source === 'engine' && p.key === key ? p.cursor.ply : 0;
  const white = props.line.score.mate !== undefined ? props.line.score.mate > 0 : props.line.score.cp > 0;
  const even = props.line.score.cp === 0;
  const open = (ply: number) => () => {
    // The threat's moves start from a position not on the board: shown, not previewed.
    if (props.threat) return;
    showLine('chapter', key, [played], { line: 0, ply }, 'engine');
  };
  return (
    <li class={`engine-line${props.threat ? ' threat' : ''}`}>
      <span class={`engine-eval ${even ? 'even' : white ? 'white' : 'black'}`}>{props.threat ? 'Threat' : formatScore(props.line.score)}</span>
      <span class="engine-moves">
        {played.sans.map((san, i) => {
          const pos = played.positions[i]!;
          const number = pos.turn === 'white' ? `${pos.fullmoves}. ` : i === 0 ? `${pos.fullmoves}… ` : '';
          return (
            <span key={i} class="engine-move-wrap">
              {number && <span class="engine-number">{number}</span>}
              <span
                class={`engine-move${current === i + 1 ? ' current' : ''}`}
                role={props.threat ? undefined : 'button'}
                tabIndex={props.threat ? undefined : 0}
                onClick={open(i + 1)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(i + 1)())}
              >
                {san}
              </span>{' '}
            </span>
          );
        })}
      </span>
    </li>
  );
}

/** Qchess's eval bar by the board: White's share from the best line's score, turned with the board. */
export function EvalBar(props: { orientation: 'white' | 'black' }) {
  const shown = useShown();
  if (!enginePrefs.value.on || threat.value || !shown || !shown.a.lines[0]) return null;
  const share = whiteShare(shown.a.lines[0].score);
  return (
    <div class={`eval-bar${props.orientation === 'black' ? ' flipped' : ''}`} role="img" aria-label={`Eval ${formatScore(shown.a.lines[0].score)}`} data-white={share.toFixed(1)}>
      <div class="eval-white" style={{ flexBasis: `${share}%` }} />
    </div>
  );
}

/** The arrows for the board, while the engine shows lines and no line is previewed. */
export function useEngineArrows(): EngineArrow[] {
  const shown = useShown();
  const p = previewOf('chapter');
  if (!enginePrefs.value.on || !enginePrefs.value.arrows || !shown || p) return [];
  return engineArrows(shown.a.lines, shown.start.turn, threat.value);
}

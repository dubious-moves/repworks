// The engine panel on the study page (PLAN.md §5.31), as Qchess's engine bar: the switch, the
// engine's name, the depth, "+" to go deeper and the settings (the threat stays on W, with no
// button: the owner's notes of 2026-10-11); under it one row per line, its eval from White's side and its moves, each move a
// line to preview on the board (◀ ▶ Back), which the preview bar's Add puts in the chapter. The
// eval bar sits by the board, and the arrows go to the board as auto shapes. With Lc0 on (§5.143):
// its policy share beside each line's first move, its pick marked where two or more lines are
// close, and a row of its own: its eval (White's side), W/D/L for the board's side, its likeliest moves.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { analysis, enginePrefs, engineStatus, goDeeper, retryEngine, runningThreads, threat, updateEnginePrefs } from '../app/engine.ts';
import { previewOf, showLine } from '../app/preview.ts';
import type { Analysis, EngineLine } from '../core/engine/search.ts';
import { engineArrows, type EngineArrow } from '../core/engine/shapes.ts';
import { barScore, formatScore } from '../core/engine/uci.ts';
import { whiteShare } from '../core/engine/winning.ts';
import { makeSanAndPlay } from 'chessops/san';
import { parseUciMove } from '../core/chess/uci.ts';
import type { PlayedLine } from '../core/repertoire/lines.ts';
import { openEngineSettings } from './EngineSettings.tsx';
import { maiaPrefs, maiaState, setMaiaOn } from '../app/maia.ts';
import { side } from '../app/editor.ts';
import { lc0Answer, lc0Prefs, lc0State, setLc0On, type Lc0Answer } from '../app/lc0.ts';
import { lc0Centipawns } from '../core/lc0/encode.ts';
import { lc0Pick, shareOf } from '../core/lc0/pick.ts';

/** Moves shown in a row (the row is cut to its width on a narrow screen). */
const SHOWN_MOVES = 16;

/** A line played from the analysed position, as the preview takes it. */
function playPv(start: Position, pv: readonly string[]): PlayedLine {
  const pos = start.clone();
  const out: PlayedLine = { line: { from: 0, to: 0, number: pos.fullmoves, turn: pos.turn, moves: [], words: [] }, placed: true, positions: [pos.clone()], ucis: [], sans: [] };
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
  return `Depth ${shown.a.depth}`;
}

export function EnginePanel(props: { board: Position | undefined }) {
  const prefs = enginePrefs.value;
  const shown = useShown();
  const on = prefs.on;
  const status = engineStatus.value;
  const canDeeper = on && !threat.value && !!shown && shown.a.done && !shown.a.noMove;
  // Lc0's answer for the board's position; beside the lines only when they are the board's (no threat).
  const answer = lc0Answer.value;
  const lc0 = lc0Prefs.value.on && answer && props.board && answer.fen === makeFen(props.board.toSetup()) ? answer : undefined;
  const beside = lc0 && shown && !threat.value && shown.a.fen.split(' ').slice(0, 4).join(' ') === lc0.fen.split(' ').slice(0, 4).join(' ') ? lc0 : undefined;
  const pick = beside && shown ? lc0Pick(shown.a.lines, beside.policy, shown.start.turn) : undefined;
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
        <Lc0Switch />
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
        <button type="button" class="icon" aria-label="Engine settings" title="Engine settings" onClick={openEngineSettings}>
          ⚙
        </button>
      </div>
      {on && shown && shown.a.lines.length > 0 && (
        <ol class="engine-lines">
          {shown.a.lines.map((l) => (
            <LineRow key={l.multipv} line={l} start={shown.start} threat={threat.value} lc0={lc0} pick={pick} />
          ))}
        </ol>
      )}
      {lc0Prefs.value.on && <Lc0Row answer={lc0} board={props.board} />}
    </section>
  );
}

/** Qchess's "Maia3" switch, beside the engine's: Maia's columns in the explorer (§5.33). */
function MaiaSwitch() {
  const on = maiaPrefs.value.on;
  const s = maiaState.value;
  const note = !on ? '' : s.kind === 'loading' ? '…' : s.kind === 'downloading' ? ` ${Math.floor((100 * s.received) / s.total)}%` : s.kind === 'failed' ? ' !' : '';
  return (
    <span class="maia-switch" data-state={s.kind} title={s.kind === 'failed' ? s.reason : 'Maia: human move predictions in the explorer'}>
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

/** A share as the explorer shows Maia's: one decimal under 10%. */
const percent = (p: number): string => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

/** Lc0's switch, beside Maia's (§5.143). */
function Lc0Switch() {
  const on = lc0Prefs.value.on;
  const s = lc0State.value;
  const note = !on ? '' : s.kind === 'loading' ? '…' : s.kind === 'downloading' ? ` ${Math.floor((100 * s.received) / s.total)}%` : s.kind === 'failed' ? ' !' : '';
  return (
    <span class="lc0-switch" data-state={s.kind} title={s.kind === 'failed' ? s.reason : 'Lc0: its pick among close moves, and its own view of the position'}>
      <label class="switch">
        <input type="checkbox" role="switch" aria-label="Lc0" checked={on} onChange={(e) => setLc0On(e.currentTarget.checked)} />
        <span class="slider" />
      </label>
      <span class="lc0-name">Lc0{note}</span>
    </span>
  );
}

/**
 * Lc0's view of the board's position: its eval from White's side, as the lines', and its win / draw
 * / loss for the side at the bottom of the board (the owner, 2026-10-31: the percentages "in the
 * perspective of the board", the eval staying White's), its three likeliest moves.
 */
function Lc0Row(props: { answer: Lc0Answer | undefined; board: Position | undefined }) {
  const a = props.answer;
  if (!props.board || props.board.isEnd()) return null;
  if (!a) {
    const s = lc0State.value;
    return (
      <div class="lc0-row muted" aria-label="Lc0">
        <span class="lc0-tag">Lc0</span> {s.kind === 'failed' ? s.reason : s.kind === 'missing' ? 'Not downloaded' : '…'}
      </div>
    );
  }
  const bottom = side.value;
  // Lc0's W/D/L is the mover's: turned to a side when the other side is to move.
  const forSide = (color: 'white' | 'black') => (props.board!.turn === color ? a.wdl : { win: a.wdl.loss, draw: a.wdl.draw, loss: a.wdl.win });
  const cp = lc0Centipawns(forSide('white'));
  const w = forSide(bottom);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div class="lc0-row" aria-label="Lc0">
      <span class="lc0-tag">Lc0</span>
      <span class={`engine-eval ${cp === 0 ? 'even' : cp > 0 ? 'white' : 'black'}`}>{formatScore({ cp })}</span>
      <span class="lc0-wdl" title={`Lc0’s chances for ${bottom === 'white' ? 'White' : 'Black'}: win, draw, loss`}>
        {pct(w.win)} / {pct(w.draw)} / {pct(w.loss)}
      </span>
      <span class="lc0-moves">
        {a.policy.slice(0, 3).map((m) => (
          <span key={m.uci} class="lc0-move">
            {m.san} <span class="muted">{percent(m.prob)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function LineRow(props: { line: EngineLine; start: Position; threat: boolean; lc0: Lc0Answer | undefined; pick: string | undefined }) {
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
    <li class={`engine-line${props.threat ? ' threat' : ''}${props.pick && props.pick === props.line.pv[0] ? ' lc0-pick' : ''}`}>
      <span class={`engine-eval ${even ? 'even' : white ? 'white' : 'black'}`}>{props.threat ? 'Threat' : formatScore(props.line.score)}</span>
      {props.lc0 && !props.threat && props.line.pv[0] && (
        <span class="lc0-share" title={props.pick === props.line.pv[0] ? 'Lc0’s pick among the close lines: its policy’s share of this move' : 'Lc0’s policy: its share of this move'}>
          {percent(shareOf(props.lc0.policy, props.line.pv[0]))}
        </span>
      )}
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
  const score = shown.a.lines[0].score;
  const share = whiteShare(score);
  // The number at the leader's end, inside its colour (Chess.com's); White's at an even score.
  const whiteLeads = score.mate !== undefined ? score.mate > 0 : score.cp >= 0;
  return (
    <div class={`eval-bar${props.orientation === 'black' ? ' flipped' : ''}`} role="img" aria-label={`Eval ${formatScore(score)}`} data-white={share.toFixed(1)}>
      <div class="eval-white" style={{ flexBasis: `${share}%` }} />
      <span class={`eval-num ${whiteLeads ? 'lead-white' : 'lead-black'}`} aria-hidden="true">
        {barScore(score)}
      </span>
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

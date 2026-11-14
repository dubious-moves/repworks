// The Chessnut Move's chip and dialog (CHESSNUT.md §5.1). The chip sits beside the sync status (in
// the head on a phone, in the footer on a desktop), where the browser has Web Bluetooth or is Brave
// (to say how to turn it on): "♞ Board" connects; connected, it shows the battery and a dot (green
// in step, amber setting up, red stuck or differing) and opens the dialog: the board's name and
// battery, the link in words, the board as it reports, Check the pieces, the settings (on this
// device), Set up again, Reset the pieces, Lights off and Disconnect.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import { boardLink, boardOffered, LOW_PIECE_BATTERY, type BoardStatus, type PieceCheck } from '../app/boardLink.ts';
import { boardPrefs, PUT_BACK_RANGE, setBoardPrefs, SETTLE_RANGE, type BoardPrefs } from '../app/boardPrefs.ts';

const shown = signal(false);
export const openBoardDialog = () => (shown.value = true);
const close = () => (shown.value = false);

type Dot = 'ok' | 'busy' | 'bad';

/** The dot's colour for a linked board. */
export function dotOf(s: Extract<BoardStatus, { state: 'on' }>): Dot {
  if (s.phase === 'stuck' || s.phase === 'unmakeable' || s.wrong?.length) return 'bad';
  return s.phase === 'driving' ? 'busy' : 'ok';
}

const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const pieceName = (letter: string) => `${letter === letter.toUpperCase() ? 'White' : 'Black'} ${PIECE_NAME[letter.toLowerCase()] ?? letter}`;

/** The link's state in words (the dialog, the chip's title). */
export function linkWords(s: BoardStatus): string {
  switch (s.state) {
    case 'off':
      return s.error ?? 'Not connected.';
    case 'connecting':
      return 'Connecting…';
    case 'lost':
      return s.trying ? 'The link dropped: reconnecting…' : 'The link dropped and the board didn’t answer: is it on and near?';
    case 'on':
      switch (s.phase) {
        case 'idle':
          return 'Connected. No screen is using the board now.';
        case 'driving':
          return 'Setting up the position…';
        case 'synced':
          return s.wrong?.length ? `The board differs from the screen at ${list(s.wrong)}.` : 'In step with the screen.';
        case 'stuck':
          return `The pieces didn’t get there${s.wrong?.length ? `: put right ${list(s.wrong)}` : ''}, or Set up again.`;
        case 'unmakeable':
          return `This position needs pieces the set doesn’t have (${list((s.missing ?? []).map(pieceName))}): it goes on on the screen.`;
      }
  }
}

export function BoardChip() {
  if (!boardOffered()) return null;
  const s = boardLink.status.value;
  const click = async () => {
    if (s.state === 'connecting') return;
    if (s.state === 'off') {
      await boardLink.connect();
      // A connect that failed in words (no Web Bluetooth, Brave's flag, Bluetooth off) says so in the dialog.
      const after = boardLink.status.peek();
      if (after.state === 'off' && after.error) openBoardDialog();
      return;
    }
    openBoardDialog();
  };
  const text = s.state === 'off' ? 'Board' : s.state === 'connecting' ? 'Connecting…' : s.state === 'lost' ? (s.trying ? 'Reconnecting' : 'Reconnect') : s.battery ? `${s.battery.percent}%` : 'On';
  const dot = s.state === 'on' ? dotOf(s) : undefined;
  return (
    <button type="button" class={`chip board-chip${s.state === 'lost' || (s.state === 'off' && s.error) ? ' chip-warn' : ''}`} data-testid="board-chip" data-state={s.state} title={s.state === 'off' && !s.error ? 'Connect the Chessnut Move' : linkWords(s)} onClick={() => void click()} disabled={s.state === 'connecting'}>
      <span aria-hidden="true">♞ </span>
      {text}
      {dot && <span class={`board-dot board-dot-${dot}`} data-dot={dot} aria-label={dot === 'ok' ? 'in step' : dot === 'busy' ? 'setting up' : 'needs a hand'} role="img" />}
    </button>
  );
}

export function BoardDialog() {
  return shown.value ? <Dialog /> : null;
}

function Dialog() {
  const s = boardLink.status.value;
  const fen = boardLink.seen.value;
  const ref = useRef<HTMLDialogElement>(null);
  const [pieces, setPieces] = useState<PieceCheck | 'asking' | 'none' | undefined>(undefined);
  useEffect(() => {
    if (!ref.current!.open) ref.current!.showModal();
    // The battery read again each time the dialog opens.
    if (boardLink.status.peek().state === 'on') void boardLink.battery();
  }, []);
  const check = async () => {
    setPieces('asking');
    setPieces((await boardLink.checkPieces()) ?? 'none');
  };
  const on = s.state === 'on';
  return (
    <dialog ref={ref} class="study-dialog board-dialog" aria-labelledby="dialog-board" data-testid="board-dialog" onCancel={(e) => (e.preventDefault(), close())} onClick={(e) => e.target === ref.current && close()}>
      <div class="form">
        <h2 id="dialog-board">{s.state === 'on' || s.state === 'lost' ? s.name : 'The Chessnut Move'}</h2>
        {s.state === 'on' && (
          <p data-testid="board-battery">{s.battery ? `Battery ${s.battery.percent}%${s.battery.charging ? ', charging' : ''}.` : 'Battery: no answer yet.'}</p>
        )}
        <p class={s.state === 'off' && s.error ? 'warn' : ''} role={s.state === 'off' && s.error ? 'alert' : 'status'} data-testid="board-state">
          {on && <span class={`board-dot board-dot-${dotOf(s)}`} aria-hidden="true" />}
          {linkWords(s)}
        </p>
        {on && fen && (
          <figure class="board-seen">
            <SeenBoard fen={fen} />
            <figcaption class="muted">The board as it reports, from White’s side.</figcaption>
          </figure>
        )}
        {on && (
          <div class="board-pieces">
            <button type="button" class="secondary" onClick={() => void check()} disabled={pieces === 'asking'}>
              Check the pieces
            </button>
            <PiecesAnswer pieces={pieces} />
          </div>
        )}
        <Settings />
        <div class="dialog-buttons">
          {s.state === 'off' && (
            <button type="button" class="primary" onClick={() => void boardLink.connect()}>
              Connect
            </button>
          )}
          {s.state === 'lost' && (
            <button type="button" class="primary" onClick={() => void boardLink.reconnectNow()} disabled={s.trying}>
              Reconnect now
            </button>
          )}
          {on && (
            <>
              <button type="button" class="secondary" onClick={() => boardLink.resend()} title="Drive the screen's position again">
                Set up again
              </button>
              <button type="button" class="secondary" onClick={() => boardLink.resetPieces()} title="Every piece to the start position">
                Reset the pieces
              </button>
              <button type="button" class="secondary" onClick={() => boardLink.lightsOff()}>
                Lights off
              </button>
            </>
          )}
          {(on || s.state === 'lost') && (
            <button type="button" class="secondary" onClick={() => void boardLink.disconnect()}>
              Disconnect
            </button>
          )}
          <span class="spacer" />
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

function PiecesAnswer(props: { pieces: PieceCheck | 'asking' | 'none' | undefined }) {
  const p = props.pieces;
  if (p === undefined) return null;
  if (p === 'asking') return <p class="muted">Asking the pieces…</p>;
  if (p === 'none') return <p class="warn">The board didn’t answer in 3 s.</p>;
  const lowest = Math.min(...p.all.map((x) => x.battery));
  return (
    <div data-testid="board-pieces">
      <p>
        {p.all.length} pieces; the lowest battery {lowest}%.
      </p>
      {p.low.length > 0 && (
        <p class="warn">
          Under {LOW_PIECE_BATTERY}%: {list(p.low.map((x) => `${pieceName(x.piece)} ${x.battery}%`))}. Put {p.low.length === 1 ? 'it' : 'them'} on the charging pad.
        </p>
      )}
      {p.off.length > 0 && <p>Not on the board: {list(p.off.map((x) => pieceName(x.piece)))}.</p>}
      {p.low.length === 0 && p.off.length === 0 && <p class="muted">All charged and on the board.</p>}
    </div>
  );
}

const SWITCHES: readonly [keyof BoardPrefs, string][] = [
  ['lights', 'Lights on the squares'],
  ['basicColours', 'Only red, green and blue lights'],
  ['turnForBlack', 'Playing Black, Black nearest you (the board turned)'],
  ['autoNext', 'A set’s next card by itself after a verdict'],
  ['autoRetry', 'A held card’s move taken back by itself'],
  ['playArrival', 'A card set up one move early, then that move played'],
  ['speak', 'Say verdicts and the opponent’s moves'],
];

const steps = (r: { min: number; max: number; step: number }) => Array.from({ length: Math.round((r.max - r.min) / r.step) + 1 }, (_, i) => r.min + i * r.step);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Settings() {
  const p = boardPrefs.value;
  return (
    <fieldset class="board-settings">
      <legend>On this device</legend>
      {SWITCHES.map(([key, words]) => (
        <label key={key} class="check">
          <input type="checkbox" name={key} checked={p[key] as boolean} onChange={(e) => setBoardPrefs({ [key]: e.currentTarget.checked })} />
          {words}
        </label>
      ))}
      <label>
        A move is read after the board holds it
        <select name="settleMs" value={p.settleMs} onChange={(e) => setBoardPrefs({ settleMs: Number(e.currentTarget.value) })}>
          {steps(SETTLE_RANGE).map((ms) => (
            <option key={ms} value={ms}>
              {seconds(ms)}
            </option>
          ))}
        </select>
      </label>
      <label>
        A wrong position is put back after
        <select name="putBackMs" value={p.putBackMs} onChange={(e) => setBoardPrefs({ putBackMs: Number(e.currentTarget.value) })}>
          {steps(PUT_BACK_RANGE).map((ms) => (
            <option key={ms} value={ms}>
              {seconds(ms)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

/** The board as it reports, only shown: any squares, legal or not (a board FEN). */
function SeenBoard(props: { fen: string }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  useEffect(() => {
    api.current = Chessground(el.current!, { fen: props.fen, orientation: 'white', viewOnly: true, coordinates: false, animation: { enabled: false }, drawable: { enabled: false, visible: false } });
    return () => api.current?.destroy();
  }, []);
  useLayoutEffect(() => {
    api.current?.set({ fen: props.fen });
  }, [props.fen]);
  return (
    <div class="mini-board" data-testid="board-seen" data-fen={props.fen}>
      <div class="cg-host" ref={el} />
    </div>
  );
}

// The board spike (CHESSNUT.md part (a), §7): checks on the day the Chessnut Move arrives what the
// plan takes from documentation (reports during a drive, the 35-byte write and its kind, the setup
// time, which light codes light, the pieces' batteries). Plain DOM; everything goes to a log the
// owner copies to a session.
import { boardFenOf, LIGHT, readReport, squaresOf, type Light, type Squares } from '../core/board/chessnut.ts';
import type { PhysicalBoard } from '../core/board/port.ts';
import { bluetoothMissing, pickBoard, type WriteKind } from '../platform/chessnut.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
/** The Drive step's samples: a small change, the board turned (a Black player's card), pieces off. */
const SAMPLES: [string, string][] = [
  ['Start', START],
  ['1.e4 e5', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR'],
  ['The start turned', 'RNBKQBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbkqbnr'],
  ['Kings and pawns', '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3'],
];
/** Five real middlegames (a QGD, a Najdorf, a closed Spanish, a King's Indian, a Caro-Kann). */
const SETUPS: [string, string][] = [
  ['QGD', 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1'],
  ['Najdorf', 'rn1qkb1r/1p3ppp/p2pbn2/4p3/4P3/1NN1B3/PPP2PPP/R2QKB1R'],
  ['Closed Spanish', 'r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1'],
  ["King's Indian", 'r1bq1rk1/pppnn1bp/3p2p1/3Ppp2/2P1P3/2N2P2/PP2B1PP/R1BQNRK1'],
  ['Caro-Kann', 'rn1qkbnr/pp3ppp/4p3/2ppPb2/3P4/5N2/PPP1BPPP/RNBQK2R'],
];
const REACH_MS = 30_000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
const t0 = performance.now();
const stamp = () => `+${((performance.now() - t0) / 1000).toFixed(3)} s`;
const lines: string[] = [];
function log(line: string): void {
  lines.push(`${stamp()} ${line}`);
  const el = $('log');
  el.textContent = lines.join('\n');
  el.scrollTop = el.scrollHeight;
}

let board: PhysicalBoard | undefined;
let seen: Squares | undefined;
/** A drive under way: its position, when it was written, the reports seen on the way. */
let watching: { target: Squares; label: string; at: number; onTheWay: number; done(ms: number | undefined): void } | undefined;

const same = (a: Squares, b: Squares) => a.every((c, s) => c === b[s]);

function showBoard(s: Squares): void {
  $('fen-now').textContent = boardFenOf(s);
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) rows.push(`${r + 1}  ${Array.from({ length: 8 }, (_, f) => s[r * 8 + f] || '.').join(' ')}`);
  rows.push('   a b c d e f g h');
  $('grid').textContent = rows.join('\n');
}

function onFrame(kind: 'report' | 'answer', bytes: Uint8Array): void {
  if (kind === 'answer') return log(`answer ${hex(bytes)}`);
  const s = readReport(bytes);
  log(`report ${hex(bytes)}${s ? ` = ${boardFenOf(s)}` : ' (unreadable)'}`);
  if (!s) return;
  seen = s;
  showBoard(s);
  const w = watching;
  if (!w) return;
  const ms = Math.round(performance.now() - w.at);
  if (same(s, w.target)) w.done(ms);
  else {
    w.onTheWay++;
    log(`  ${w.label}: report on the way #${w.onTheWay} at ${ms} ms`);
  }
}

function onWrite(bytes: Uint8Array, kind: WriteKind, errors: string[]): void {
  log(`write ${bytes.length} bytes ${kind === 'failed' ? '✗ failed' : `✓ ${kind}`}${errors.length ? ` (${errors.join('; ')})` : ''}: ${hex(bytes)}`);
}

/** Drives to `target` and resolves with the ms to the first report showing it (undefined: not in 30 s). */
async function driveAndTime(target: Squares, label: string, force = true): Promise<number | undefined> {
  if (!board) return undefined;
  watching?.done(undefined);
  if (seen && same(seen, target)) {
    log(`${label}: the board shows it already`);
    return 0;
  }
  const at = performance.now();
  const result = new Promise<number | undefined>((resolve) => {
    const timer = setTimeout(() => w.done(undefined), REACH_MS);
    const w = {
      target,
      label,
      at,
      onTheWay: 0,
      done(ms: number | undefined) {
        if (watching !== w) return;
        watching = undefined;
        clearTimeout(timer);
        log(ms === undefined ? `${label}: ✗ not reached in ${REACH_MS / 1000} s (${w.onTheWay} reports on the way)` : `${label}: ✓ reached in ${ms} ms (${w.onTheWay} reports on the way)`);
        resolve(ms);
      },
    };
    watching = w;
  });
  log(`${label}: drive (${force ? 'force' : 'a hand stops it'}) to ${boardFenOf(target)}`);
  if (!(await board.drive(target, force))) {
    watching?.done(undefined);
    log(`${label}: ✗ the write failed`);
  }
  return result;
}

const BOARD_BUTTONS = ['drive-force', 'drive-hand', 'stop', 'setups', 'lights-each', 'lights-off', 'battery', 'pieces', 'disconnect'];
function linked(on: boolean): void {
  for (const id of BOARD_BUTTONS) $<HTMLButtonElement>(id).disabled = !on;
}

async function canThisBrowser(): Promise<void> {
  log(`browser: ${navigator.userAgent}`);
  const missing = await bluetoothMissing();
  const brave = 'brave' in navigator;
  let text: string;
  if (missing === 'api') {
    text = brave
      ? 'No: Brave has Web Bluetooth off. Open brave://flags/#brave-web-bluetooth-api, set it to Enabled and relaunch Brave (or use Chrome).'
      : 'No: this browser has no Web Bluetooth. Use Chrome (Android, Windows, macOS) or Edge. No iPhone or iPad browser has it.';
    $<HTMLButtonElement>('connect').disabled = true;
  } else if (missing === 'adapter') text = 'Not now: Bluetooth is off. Turn it on (and, on Android 10, Location), then reload.';
  else text = 'Yes: this browser has Web Bluetooth.';
  $('can').textContent = text;
  $('can').className = missing ? 'bad' : 'ok';
  log(`can this browser: ${text}${brave ? ' (Brave)' : ''}`);
}

async function connect(): Promise<void> {
  $<HTMLButtonElement>('connect').disabled = true;
  $('link').textContent = 'Connecting… (pick "Chessnut Move" in the list)';
  const t = performance.now();
  try {
    board = await pickBoard({ onFrame, onWrite });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : 'Error';
    const message = e instanceof Error ? e.message : String(e);
    log(`connect: ✗ ${name}: ${message}`);
    $('link').textContent = /cancel/i.test(message) ? 'Nothing picked.' : `Not connected: ${message}. Is Chessnut's app still connected to the board?`;
    $<HTMLButtonElement>('connect').disabled = false;
    return;
  }
  log(`connect: ✓ ${board.name} in ${Math.round(performance.now() - t)} ms`);
  $('link').textContent = `Connected to ${board.name}.`;
  board.onGone(() => {
    log('link: ✗ dropped (gattserverdisconnected)');
    $('link').textContent = 'The link dropped.';
    $('reconnect').hidden = false;
    linked(false);
  });
  linked(true);
  void battery();
}

async function reconnect(): Promise<void> {
  if (!board) return;
  const t = performance.now();
  const ok = await board.reconnect();
  log(`reconnect: ${ok ? '✓' : '✗'} in ${Math.round(performance.now() - t)} ms`);
  if (!ok) return;
  $('reconnect').hidden = true;
  $('link').textContent = `Connected to ${board.name} again.`;
  linked(true);
}

async function battery(): Promise<void> {
  const b = await board?.battery();
  const text = b ? `Battery ${b.percent}%${b.charging ? ', charging' : ''}.` : 'No battery answer in 3 s.';
  $('battery-now').textContent = text;
  log(`battery: ${text}`);
}

async function pieces(): Promise<void> {
  const p = await board?.pieces();
  const table = $<HTMLTableElement>('pieces-table');
  table.replaceChildren();
  if (!p) return log('pieces: no answer in 3 s');
  const head = table.insertRow();
  for (const h of ['Piece', 'On the board', 'x', 'y', 'Battery']) head.appendChild(document.createElement('th')).textContent = h;
  for (const x of p) {
    const row = table.insertRow();
    for (const v of [x.piece, x.onBoard ? 'yes' : 'no', x.x, x.y, `${x.battery}%`]) row.insertCell().textContent = String(v);
  }
  const low = p.filter((x) => x.battery < 20).map((x) => `${x.piece} ${x.battery}%`);
  const off = p.filter((x) => !x.onBoard).map((x) => x.piece);
  log(`pieces: ${p.length}; under 20%: ${low.join(', ') || 'none'}; not on the board: ${off.join('') || 'none'}`);
  log(`pieces raw: ${p.map((x) => `${x.piece}(${x.x},${x.y},${x.battery})`).join(' ')}`);
}

async function setups(): Promise<void> {
  const button = $<HTMLButtonElement>('setups');
  button.disabled = true;
  const times: number[] = [];
  await driveAndTime(squaresOf(START)!, 'setup 0/5 (the start)');
  for (const [i, [name, fen]] of SETUPS.entries()) {
    const ms = await driveAndTime(squaresOf(fen)!, `setup ${i + 1}/5 (${name})`);
    if (ms === undefined) break;
    times.push(ms);
  }
  if (times.length) log(`setups: ${times.map((ms) => (ms / 1000).toFixed(1)).join(', ')} s; mean ${(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1)} s`);
  button.disabled = !board;
}

function drive(force: boolean): void {
  const fen = $<HTMLInputElement>('fen').value.trim();
  const target = squaresOf(fen);
  if (!target) return log(`drive: ✗ not a FEN: ${fen}`);
  void driveAndTime(target, 'drive', force);
}

async function copyLog(): Promise<void> {
  const note = $<HTMLInputElement>('lights-note').value.trim();
  const text = [`Repworks board spike, build ${__BUILD_ID__}`, ...(note ? [`The lights (the owner's note): ${note}`] : []), ...lines].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    log(`✓ Log copied (${text.length} characters).`);
  } catch {
    const area = $<HTMLTextAreaElement>('log-text');
    area.hidden = false;
    area.value = text;
    area.select();
    log('Copy was refused: the log is in the box above; select all and copy it.');
  }
}

function wire(): void {
  $('build').textContent = __BUILD_ID__;
  $<HTMLInputElement>('fen').value = SAMPLES[1]![1];
  for (const [name, fen] of SAMPLES) {
    const b = $('samples').appendChild(document.createElement('button'));
    b.type = 'button';
    b.className = 'small';
    b.textContent = name;
    b.addEventListener('click', () => ($<HTMLInputElement>('fen').value = fen));
  }
  $('connect').addEventListener('click', () => void connect());
  $('reconnect').addEventListener('click', () => void reconnect());
  $('disconnect').addEventListener('click', () => {
    board?.close();
    board = undefined;
    log('link: closed by the page');
    $('link').textContent = 'Disconnected.';
    $<HTMLButtonElement>('connect').disabled = false;
    linked(false);
  });
  $('drive-force').addEventListener('click', () => drive(true));
  $('drive-hand').addEventListener('click', () => drive(false));
  $('stop').addEventListener('click', () => {
    watching?.done(undefined);
    log('stop');
    void board?.stopDrive();
  });
  $('setups').addEventListener('click', () => void setups());
  $('lights-each').addEventListener('click', () => {
    log('lights: each code (rank 1 off … rank 8 code 7)');
    void board?.lights(Array.from({ length: 64 }, (_, s) => (s >> 3) as Light));
  });
  $('lights-off').addEventListener('click', () => {
    log('lights: off');
    void board?.lights(new Array<Light>(64).fill(LIGHT.off));
  });
  $('battery').addEventListener('click', () => void battery());
  $('pieces').addEventListener('click', () => void pieces());
  $('log-copy').addEventListener('click', () => void copyLog());
  $('log-clear').addEventListener('click', () => {
    lines.length = 0;
    $('log').textContent = '';
  });
  // A hidden page can drop the link (a phone's screen locked): log when, to match with a drop.
  document.addEventListener('visibilitychange', () => log(`page: ${document.visibilityState}`));
}

wire();
void canThisBrowser();

// The Chessnut Move over Web Bluetooth (CHESSNUT.md §4.5): the chooser, the two services, the
// reports, and a write queue (one write at a time, 100 ms apart, as Chessnut's own app writes; the
// other write kind tried when one fails). TypeScript's DOM library has no Web Bluetooth, so the
// little used is declared here.
import { ASK_BATTERY, ASK_PIECES, driveTo, isReportsAck, lightsCommand, MOVE_NAME, readBattery, readPieces, readReport, START_REPORTS, STOP_DRIVE, UUIDS, type Battery, type Light, type PieceState, type Squares } from '../core/board/chessnut.ts';
import type { PhysicalBoard } from '../core/board/port.ts';

interface BtCharacteristic extends EventTarget {
  readonly value?: DataView | undefined;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>;
}
interface BtServer {
  readonly connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BtService>;
}
export interface BtDevice extends EventTarget {
  readonly name?: string | undefined;
  readonly gatt?: BtServer | undefined;
}
interface Bluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: { filters: { name: string }[]; optionalServices: string[] }): Promise<BtDevice>;
}

export const bluetooth = (): Bluetooth | undefined => (globalThis.navigator as (Navigator & { bluetooth?: Bluetooth }) | undefined)?.bluetooth;

/** Why the board can't be used here, or undefined when it can be tried. */
export async function bluetoothMissing(): Promise<'api' | 'adapter' | undefined> {
  const bt = bluetooth();
  if (!bt) return 'api';
  try {
    return (await bt.getAvailability()) ? undefined : 'adapter';
  } catch {
    return undefined;
  }
}

/** The chooser (a click must start it), then the board opened. Throws when nothing is picked. */
export async function pickBoard(o: OpenOptions = {}): Promise<PhysicalBoard> {
  const bt = bluetooth();
  if (!bt) throw new Error('No Web Bluetooth in this browser');
  const device = await bt.requestDevice({ filters: [{ name: MOVE_NAME }], optionalServices: [UUIDS.positionService, UUIDS.commandService] });
  return openBoard(device, o);
}

const GAP_MS = 100;
const ANSWER_MS = 3000;

/** How a write went: the kind that went through, or `failed` when both kinds threw. */
export type WriteKind = 'with response' | 'without response' | 'failed';

export interface OpenOptions {
  sleep?: (ms: number) => Promise<void>;
  /** Every frame the board sends, raw (the spike page's log): a position report or an answer. */
  onFrame?: (kind: 'report' | 'answer', bytes: Uint8Array) => void;
  /** Every write, with the kind that went through and the errors of the kinds that didn't (the spike's log). */
  onWrite?: (bytes: Uint8Array, kind: WriteKind, errors: string[]) => void;
}

export async function openBoard(device: BtDevice, o: OpenOptions = {}): Promise<PhysicalBoard> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const reportFns: ((s: Squares) => void)[] = [];
  /** The latest report, handed at once to a subscriber that comes after it (the board reports on start, then only on a change). */
  let lastReport: Squares | undefined;
  const goneFns: (() => void)[] = [];
  const answerFns = new Set<(b: Uint8Array) => void>();
  let write: BtCharacteristic | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let lastWrite = 0;
  let closed = false;

  const bytesOf = (e: Event): Uint8Array | undefined => {
    const v = (e.target as BtCharacteristic).value;
    return v && new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
  };
  const onReport = (e: Event) => {
    const b = bytesOf(e);
    if (b) o.onFrame?.('report', b);
    const squares = b && readReport(b);
    if (!squares) return;
    lastReport = squares;
    for (const f of reportFns) f(squares);
  };
  const onAnswer = (e: Event) => {
    const b = bytesOf(e);
    if (b) o.onFrame?.('answer', b);
    if (b && !isReportsAck(b)) for (const f of answerFns) f(b);
  };

  async function connect(): Promise<void> {
    const server = await device.gatt!.connect();
    const positions = await (await server.getPrimaryService(UUIDS.positionService)).getCharacteristic(UUIDS.position);
    const commands = await server.getPrimaryService(UUIDS.commandService);
    write = await commands.getCharacteristic(UUIDS.write);
    const answers = await commands.getCharacteristic(UUIDS.response);
    // The SDK's order: the reports subscribed, the reports started, then the answers subscribed.
    positions.addEventListener('characteristicvaluechanged', onReport);
    await positions.startNotifications();
    await send(START_REPORTS, true);
    answers.addEventListener('characteristicvaluechanged', onAnswer);
    await answers.startNotifications();
  }

  /** One write at a time, 100 ms after the last; the other kind of write when one fails. */
  function send(bytes: Uint8Array, withResponse = false): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      const wait = lastWrite + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const errors: string[] = [];
      for (const response of withResponse ? [true, false] : [false, true]) {
        try {
          if (!write) break;
          const data = bytes.slice().buffer;
          await (response ? write.writeValueWithResponse(data) : write.writeValueWithoutResponse(data));
          lastWrite = Date.now();
          o.onWrite?.(bytes, response ? 'with response' : 'without response', errors);
          return true;
        } catch (e) {
          // the other kind next
          errors.push(`${response ? 'with' : 'without'} response: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!write) errors.push('not connected');
      o.onWrite?.(bytes, 'failed', errors);
      return false;
    };
    const p = queue.then(run, run);
    queue = p;
    return p;
  }

  /** A query, and the first answer of its type within 3 s. */
  function ask<T>(query: Uint8Array, read: (b: Uint8Array) => T | undefined): Promise<T | undefined> {
    return new Promise((resolve) => {
      const done = (v: T | undefined) => {
        answerFns.delete(f);
        clearTimeout(timer);
        resolve(v);
      };
      const f = (b: Uint8Array) => {
        const v = read(b);
        if (v !== undefined) done(v);
      };
      const timer = setTimeout(() => done(undefined), ANSWER_MS);
      answerFns.add(f);
      void send(query, true).then((ok) => !ok && done(undefined));
    });
  }

  device.addEventListener('gattserverdisconnected', () => {
    write = undefined;
    if (!closed) for (const f of goneFns) f();
  });
  await connect();

  return {
    name: device.name ?? MOVE_NAME,
    onReport: (f) => {
      reportFns.push(f);
      if (lastReport) f(lastReport);
    },
    onGone: (f) => void goneFns.push(f),
    async reconnect() {
      try {
        await connect();
        return true;
      } catch {
        return false;
      }
    },
    drive: (squares, force = true) => send(driveTo(squares, force)),
    stopDrive: () => send(STOP_DRIVE),
    lights: (l: readonly Light[]) => send(lightsCommand(l)),
    battery: (): Promise<Battery | undefined> => ask(ASK_BATTERY, readBattery),
    pieces: (): Promise<PieceState[] | undefined> => ask(ASK_PIECES, readPieces),
    close() {
      closed = true;
      device.gatt?.disconnect();
    },
  };
}

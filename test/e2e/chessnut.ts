// A simulated Chessnut Move for the browser tests (CHESSNUT.md §4.5, §6 part (a)), put in place of
// `navigator.bluetooth` by `page.addInitScript(installFakeMove, options)`. Self-contained (an init
// script can't import): its own small codec. The test drives it through `window.__move`.
export interface FakeMoveOptions {
  /** The board's position when the page opens (a board FEN). */
  start?: string;
  /** How long the robot takes to reach a position, ms. */
  driveMs?: number;
  /** Report a position half-way through a drive (Chessnut's app says the board does). */
  reportOnTheWay?: boolean;
  /** The chooser finds no board. */
  none?: boolean;
}

export function installFakeMove(o: FakeMoveOptions = {}): void {
  const CODES = ['', 'q', 'k', 'b', 'p', 'n', 'R', 'P', 'r', 'B', 'N', 'Q', 'K'];
  const squaresOf = (fen: string): string[] => {
    const out: string[] = new Array(64).fill('');
    fen.split(' ')[0]!.split('/').forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') f += Number(ch);
        else out[(7 - r) * 8 + f++] = ch;
      }
    });
    return out;
  };
  const fenOf = (sq: string[]): string => {
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let row = '';
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const c = sq[r * 8 + f]!;
        if (!c) e++;
        else {
          row += (e || '') + c;
          e = 0;
        }
      }
      rows.push(row + (e || ''));
    }
    return rows.join('/');
  };
  const pack = (values: number[]): number[] => {
    const out = new Array(32).fill(0);
    for (let s = 0; s < 64; s++) {
      const k = 63 - s;
      out[k >> 1] |= k & 1 ? values[s]! << 4 : values[s]!;
    }
    return out;
  };
  const unpack = (bytes: Uint8Array, at: number): number[] =>
    Array.from({ length: 64 }, (_, s) => {
      const k = 63 - s;
      const b = bytes[at + (k >> 1)]!;
      return k & 1 ? b >> 4 : b & 15;
    });

  let squares = squaresOf(o.start ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  let lights: number[] = new Array(64).fill(0);
  let reporting = false;
  let connected = false;
  let driveTimers: ReturnType<typeof setTimeout>[] = [];
  const writes: string[] = [];
  const drives: string[] = [];

  class Char extends EventTarget {
    value: DataView | undefined;
    onWrite: ((b: Uint8Array) => void) | undefined;
    constructor(onWrite?: (b: Uint8Array) => void) {
      super();
      this.onWrite = onWrite;
    }
    async startNotifications() {
      return this;
    }
    emit(bytes: number[]) {
      this.value = new DataView(Uint8Array.from(bytes).buffer);
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
    async writeValueWithResponse(v: ArrayBuffer) {
      if (!connected) throw new Error('GATT Server is disconnected');
      this.onWrite?.(new Uint8Array(v));
    }
    async writeValueWithoutResponse(v: ArrayBuffer) {
      return this.writeValueWithResponse(v);
    }
  }
  const position = new Char();
  const response = new Char();
  const report = () => reporting && connected && position.emit([0x01, 0x24, ...pack(squares.map((c) => CODES.indexOf(c))), 0, 0, 0, 0]);
  const command = new Char((b) => {
    writes.push(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' '));
    if (b[0] === 0x21) {
      reporting = true;
      response.emit([0x23, 0x01, 0x00]);
      report();
    } else if (b[0] === 0x42) {
      driveTimers.forEach(clearTimeout);
      driveTimers = [];
      const target = unpack(b, 2).map((c) => CODES[c]!);
      if (b.slice(2).every((x) => x === 0)) return;
      drives.push(fenOf(target));
      const ms = o.driveMs ?? 300;
      if (o.reportOnTheWay !== false)
        driveTimers.push(
          setTimeout(() => {
            // Half the squares that differ, as a drive on its way.
            let n = 0;
            squares = squares.map((c, s) => (c !== target[s] && n++ % 2 === 0 ? target[s]! : c));
            report();
          }, ms / 2),
        );
      driveTimers.push(
        setTimeout(() => {
          squares = target;
          report();
        }, ms),
      );
    } else if (b[0] === 0x43) {
      lights = unpack(b, 2);
    } else if (b[0] === 0x41 && b[2] === 0x0c) {
      response.emit([0x41, 0x03, 0x0c, 0x00, 87]);
    } else if (b[0] === 0x41 && b[2] === 0x0b) {
      const kinds = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];
      response.emit([0x41, 0x89, 0x0b, ...kinds.flatMap((k, i) => [k, 10 + i, 10 + i, i === 3 ? 12 : 90])]);
    }
  });
  const service = (uuid: string) => ({
    async getCharacteristic(c: string) {
      if (uuid.startsWith('1b7e8261') && c.startsWith('1b7e8262')) return position;
      if (uuid.startsWith('1b7e8271') && c.startsWith('1b7e8272')) return command;
      if (uuid.startsWith('1b7e8271') && c.startsWith('1b7e8273')) return response;
      throw new Error('NotFoundError: no characteristic ' + c);
    },
  });
  const device = Object.assign(new EventTarget(), { name: 'Chessnut Move', gatt: undefined as unknown });
  const server = {
    get connected() {
      return connected;
    },
    async connect() {
      connected = true;
      return server;
    },
    disconnect() {
      connected = false;
      reporting = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    async getPrimaryService(uuid: string) {
      return service(uuid);
    },
  };
  device.gatt = server;
  const bluetooth = {
    async getAvailability() {
      return true;
    },
    async requestDevice() {
      if (o.none) throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
      return device;
    },
  };
  Object.defineProperty(globalThis.navigator, 'bluetooth', { value: bluetooth, configurable: true });
  (globalThis as unknown as { __move: unknown }).__move = {
    /** A hand puts the board as `fen` shows (a board FEN). */
    hand(fen: string) {
      squares = squaresOf(fen);
      report();
    },
    position: () => fenOf(squares),
    lights: () => lights.slice(),
    writes: () => writes.slice(),
    drives: () => drives.slice(),
    /** The board goes away (off, out of range). */
    drop: () => server.disconnect(),
  };
}

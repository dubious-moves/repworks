// The puzzle dataset over the network (PLAN.md §5.47; D12): puzzle-explorer-data's static files,
// from a base URL that is a setting (GitHub Pages by default; puzzle-explorer's R2 copy or any
// mirror with the same layout). Plain GETs only: nothing about the user is sent. Shards are read
// and dropped; only the entries and bodies wanted are kept (by the caller, in the storm's store).
import { readMeta, SHARD_HEX_LEN, type DatasetMeta } from '../core/puzzles/dataset.ts';

export const DEFAULT_PUZZLE_BASE = 'https://skaeglund.github.io/puzzle-explorer-data/';

export type Fetch = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface PuzzleData {
  base: string;
  /** `meta.json`: its build stamp and the deepest ply indexed; throws when the base answers none. */
  meta(): Promise<DatasetMeta>;
  index(shard: string): Promise<string>;
  bodies(shard: string): Promise<string>;
}

/** The base as typed, with its trailing slash; '' when it isn't an http(s) URL. */
export function normalizeBase(base: string): string {
  const b = base.trim();
  if (!/^https?:\/\/[^/]+/i.test(b)) return '';
  return b.endsWith('/') ? b : b + '/';
}

const SHARD = new RegExp(`^[0-9a-f]{${SHARD_HEX_LEN}}$`);

export function puzzleData(base: string, get: Fetch = (url) => fetch(url)): PuzzleData {
  const root = normalizeBase(base);
  let metaP: Promise<DatasetMeta> | undefined;
  const text = async (path: string) => {
    if (!root) throw new Error('The puzzle data’s address isn’t a web address.');
    const res = await get(root + path);
    if (!res.ok) throw new Error(`The puzzle data answered HTTP ${res.status} for ${path}.`);
    return res.text();
  };
  const shard = (s: string) => {
    if (!SHARD.test(s)) throw new Error('not a shard name: ' + s);
    return s;
  };
  return {
    base: root,
    meta() {
      metaP ??= text('meta.json').then((t) => {
        let json: unknown;
        try {
          json = JSON.parse(t);
        } catch {
          throw new Error('The puzzle data’s meta.json isn’t JSON.');
        }
        const m = readMeta(json);
        if (!m) throw new Error('The puzzle data’s meta.json has no build stamp.');
        if (m.shardHexLen !== SHARD_HEX_LEN) throw new Error(`The puzzle data uses ${m.shardHexLen}-character shards; this site reads ${SHARD_HEX_LEN}.`);
        return m;
      });
      metaP.catch(() => (metaP = undefined));
      return metaP;
    },
    index: async (s) => text(`index/${shard(s)}.json`),
    bodies: async (s) => text(`puzzles/${shard(s)}.ndjson`),
  };
}

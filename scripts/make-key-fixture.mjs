// Builds test/fixtures/position-keys/dataset-keys.json from a checkout of puzzle-explorer-data
// (the published puzzle index, derived from the Lichess puzzle database, CC0): every key that
// carries an en passant square in 16 shards spread across the index, plus an even sample of the
// rest, about 2,000 keys in all. Only the keys and their shard names are kept.
//
// Usage: node scripts/make-key-fixture.mjs <puzzle-explorer-data checkout>
// The checkout needs index/000.json, 100.json … f00.json (a sparse checkout is enough).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: node scripts/make-key-fixture.mjs <puzzle-explorer-data checkout>');
const shards = [...'0123456789abcdef'].map((h) => `${h}00`);
const TOTAL = 2000;

const all = shards.map((shard) => ({ shard, keys: Object.keys(JSON.parse(readFileSync(join(root, 'index', `${shard}.json`), 'utf8'))).sort() }));
const ep = all.flatMap(({ shard, keys }) => keys.filter((k) => k.split(' ')[3] !== '-').map((key) => ({ shard, key })));
const plain = all.flatMap(({ shard, keys }) => keys.filter((k) => k.split(' ')[3] === '-').map((key) => ({ shard, key })));
const step = plain.length / (TOTAL - ep.length);
const sample = [];
for (let i = 0; i < TOTAL - ep.length; i++) sample.push(plain[Math.floor(i * step)]);

const fixture = {
  source: 'https://github.com/skAeglund/puzzle-explorer-data (index shards), built from the Lichess puzzle database (CC0)',
  shards,
  keysInShards: all.reduce((n, s) => n + s.keys.length, 0),
  enPassantKeys: ep.length,
  keys: [...ep, ...sample].map(({ shard, key }) => [shard, key]),
};
writeFileSync('test/fixtures/position-keys/dataset-keys.json', `${JSON.stringify(fixture, null, 0).replace(/\],\[/g, '],\n[')}\n`);
console.log(`wrote ${fixture.keys.length} keys (${ep.length} with en passant) from ${fixture.keysInShards} in ${shards.length} shards`);

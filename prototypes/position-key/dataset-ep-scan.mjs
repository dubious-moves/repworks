import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { parseFen, makeFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
const dir = '/home/user/puzzle-explorer-data/index/';
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const step = Math.max(1, Math.floor(files.length / 256));       // sample 256 of the 4096 shards evenly
let keys = 0, withEp = 0, fixed = 0, epMismatch = [], castleMismatch = 0, invalid = 0, shardMismatch = 0;
function ckey(k) {
  const setup = parseFen(k + ' 0 1');
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return null;
  return makeFen(pos.value.toSetup()).split(' ').slice(0, 4).join(' ');
}
for (let i = 0; i < files.length; i += step) {
  const shard = files[i].slice(0, 3);
  const idx = JSON.parse(readFileSync(dir + files[i], 'utf8'));
  for (const k of Object.keys(idx)) {
    keys++;
    if (createHash('sha1').update(k).digest('hex').slice(0, 3) !== shard) shardMismatch++;
    const ep = k.split(' ')[3];
    if (ep !== '-') withEp++;
    const c = ckey(k);
    if (c === null) { invalid++; continue; }
    if (c === k) fixed++;
    else if (c.split(' ')[3] !== ep) epMismatch.push(k);
    else castleMismatch++;
  }
}
console.log({ shardsScanned: Math.ceil(files.length / step), keys, withEp, fixedPoints: fixed, epMismatch: epMismatch.length, castleMismatch, invalid, shardMismatch });
console.log('examples of EP keys:', epMismatch.slice(0, 3));

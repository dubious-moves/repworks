// Builds vendor/openings/openings.tsv (PLAN.md §5.181) from Lichess's chess-openings list
// (https://github.com/lichess-org/chess-openings, CC0): its five files a.tsv to e.tsv, each row
// "eco, name, pgn", written as one file of "eco, name, the moves in SAN without their numbers".
// Every line is played through with chessops first: a row that isn't legal from the start stops
// the build.
//
//   node scripts/openings-build.mjs <a checkout of chess-openings> [vendor/openings/openings.tsv]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';

const [dir, out = 'vendor/openings/openings.tsv'] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node scripts/openings-build.mjs <a checkout of chess-openings> [out.tsv]');
  process.exit(2);
}

const rows = [];
for (const volume of ['a', 'b', 'c', 'd', 'e']) {
  const file = join(dir, `${volume}.tsv`);
  const bytes = readFileSync(file);
  console.log(`${volume}.tsv  ${bytes.length} bytes  sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
  const lines = bytes.toString('utf8').split('\n').filter(Boolean);
  if (lines[0] !== 'eco\tname\tpgn') throw new Error(`${file}: an unexpected header: ${lines[0]}`);
  for (const [i, line] of lines.slice(1).entries()) {
    const [eco, name, pgn, ...rest] = line.split('\t');
    if (!eco || !name || !pgn || rest.length) throw new Error(`${file}:${i + 2}: not three fields`);
    if (!/^[A-E]\d\d$/.test(eco)) throw new Error(`${file}:${i + 2}: not an ECO code: ${eco}`);
    const sans = pgn.replace(/\d+\.+/g, ' ').split(/\s+/).filter(Boolean);
    const pos = Chess.default();
    for (const san of sans) {
      const move = parseSan(pos, san);
      if (!move) throw new Error(`${file}:${i + 2}: ${san} isn't legal in ${pgn}`);
      pos.play(move);
    }
    rows.push(`${eco}\t${name.trim()}\t${sans.join(' ')}`);
  }
}
const text = rows.join('\n') + '\n';
writeFileSync(out, text);
console.log(`${out}  ${rows.length} lines  ${Buffer.byteLength(text)} bytes  sha256 ${createHash('sha256').update(text).digest('hex')}`);

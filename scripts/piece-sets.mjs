// The piece sets offered in Settings besides chessground's cburnett (PLAN.md §5.197): each Lichess
// set named below, fetched from lichess-org/lila and written as one stylesheet,
// public/pieces/<set>.css, its twelve SVGs inlined. The app loads only the chosen set's sheet
// (src/app/distance.ts); the service worker precaches them all with the rest of public/.
// Run again only to add a set or refresh one: `node scripts/piece-sets.mjs`.
// Only sets whose licence lets them sit in this public repo, as listed in lila's COPYING.md; their
// authors and licences are in public/pieces/LICENSES.md, which this script also writes.
import { mkdirSync, writeFileSync } from 'node:fs';

export const SETS = [
  { id: 'merida', name: 'Merida', author: 'Armando Hernandez Marroquin', licence: 'GPLv2+' },
  { id: 'staunty', name: 'Staunty', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'california', name: 'California', author: 'Jerry S.', licence: 'CC BY-NC-SA 4.0' },
  { id: 'maestro', name: 'Maestro', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'cardinal', name: 'Cardinal', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'fresca', name: 'Fresca', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'tatiana', name: 'Tatiana', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'gioco', name: 'Gioco', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'icpieces', name: 'IC Pieces', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'dubrovny', name: 'Dubrovny', author: 'sadsnake1', licence: 'CC BY-NC-SA 4.0' },
  { id: 'chessnut', name: 'Chessnut', author: 'Alexis Luengas', licence: 'Apache 2.0' },
  { id: 'mpchess', name: 'MPChess', author: 'Maxime Chupin', licence: 'GPLv3+' },
];

const ROLES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const SOURCE = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece';
const OUT = new URL('../public/pieces/', import.meta.url);

mkdirSync(OUT, { recursive: true });
for (const set of SETS) {
  const rules = [];
  for (const colour of ['w', 'b']) {
    for (const [letter, role] of Object.entries(ROLES)) {
      const response = await fetch(`${SOURCE}/${set.id}/${colour}${letter}.svg`);
      if (!response.ok) throw new Error(`${set.id}/${colour}${letter}.svg: HTTP ${response.status}`);
      const svg = Buffer.from(await response.arrayBuffer()).toString('base64');
      const side = colour === 'w' ? 'white' : 'black';
      rules.push(`:root[data-piece-set='${set.id}'] :is(.cg-wrap, .board-material) piece.${role}.${side} {\n  background-image: url('data:image/svg+xml;base64,${svg}');\n}`);
    }
  }
  const head = `/* ${set.name}, by ${set.author} (${set.licence}), from Lichess (lichess-org/lila, public/piece/${set.id}).\n   Written by scripts/piece-sets.mjs: don't edit. */\n`;
  writeFileSync(new URL(`${set.id}.css`, OUT), head + rules.join('\n') + '\n');
  console.log(set.id);
}

writeFileSync(
  new URL('LICENSES.md', OUT),
  `# Piece sets\n\nThe piece sets offered in Settings besides cburnett (chessground's own, by Colin M.L. Burnett,\nGPLv2+). Each is the Lichess set of the same name, from\n[lichess-org/lila](https://github.com/lichess-org/lila/tree/master/public/piece), unchanged,\nunder its own licence as lila's COPYING.md lists it.\n\n| File | Set | Author | Licence |\n| --- | --- | --- | --- |\n${SETS.map((s) => `| ${s.id}.css | ${s.name} | ${s.author} | ${s.licence} |`).join('\n')}\n`,
);

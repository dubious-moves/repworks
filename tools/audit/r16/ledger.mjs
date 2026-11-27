// node ledger.mjs <chapter file> <depth>: per subtree (the Black move at the given ply), Black-to-move positions with drilled replies, replies, single-move branches, White moves
import { readFileSync } from 'node:fs';
const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js');
const [f, depth = '5'] = process.argv.slice(2); const g = parsePgn(readFileSync(f, 'utf8'))[0];
const num = (i, s) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s);
const stats = (n, ply) => { let pos = 0, rep = 0, single = 0, white = 0; const w = (n, ply) => { const blackToMove = ply % 2 === 1; if (blackToMove && n.children.length) { pos++; rep += n.children.length; for (const c of n.children) if (c.children.length === 1 && c.children[0].children.length === 0) single++; } if (!blackToMove) white += n.children.length; for (const c of n.children) w(c, ply + 1); }; w(n, ply); return { pos, rep, single, white }; };
const out = [];
const walk = (n, path) => { if (path.length === +depth) { const s = stats(n, path.length); out.push(`${path.map((x, i) => num(i, x)).join(' ')} | ${s.pos} positions, ${s.rep} replies, ${s.single} single, ${s.white} White moves`); return; } for (const c of n.children) walk(c, [...path, c.data.san]); };
walk(g.moves, []);
console.log(out.join('\n'));

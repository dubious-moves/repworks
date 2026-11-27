const B = '/home/user/repworks/node_modules/chessops/dist/esm/';
const { parsePgn } = await import(B + 'pgn.js'); import { readFileSync } from 'node:fs';
const g = parsePgn(readFileSync(process.argv[2], 'utf8'))[0]; const C = JSON.parse(readFileSync(process.argv[3], 'utf8'));
for (const c of C) { let n = g.moves; let ok = true; for (const t of c.moves.split(/\s+/)) { const s = t.replace(/^\d+\.+/, ''); if (!s) continue; n = n.children.find((x) => x.data.san === s); if (!n) { ok = false; break; } }
  const rep = ok ? n.children.map((x) => x.data.san) : null; const kids = ok && rep.length ? n.children[0].children.map((x) => x.data.san + ((x.data.comments || [])[0] ? ' ' + x.data.comments[0] : '')) : [];
  console.log(c.id.padStart(2), ok ? (rep.includes(c.ans) && rep.length === 1 ? 'OK ' : 'BAD ' + rep.join(',')) : 'NOT FOUND', c.ans, '| replies after:', kids.slice(0, 5).join(', ')); }

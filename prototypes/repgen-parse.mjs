import { readFileSync } from 'fs';
import { parsePgn, startingPosition, emptyHeaders } from 'chessops/pgn';
import { parseSan, makeSan } from 'chessops/san';
for (const f of ['benoni_dxc5_e5_deep.pgn', 'scandi_gambit.clean.pgn', 'benoni_dxc5_e5_safe.pgn']) {
  const text = readFileSync('/home/user/q_extension/repertoires/' + f, 'utf8');
  const games = parsePgn(text, emptyHeaders);
  let nodes = 0, illegal = 0, noncanon = 0, comments = 0, maxDepth = 0;
  for (const g of games) {
    const pos = startingPosition(g.headers).unwrap();
    (function walk(n, p, d) {
      maxDepth = Math.max(maxDepth, d);
      for (const c of n.children) {
        const q = p.clone(); const mv = parseSan(q, c.data.san);
        nodes++; comments += (c.data.comments || []).length;
        if (!mv) { illegal++; continue; }
        if (makeSan(q, mv) !== c.data.san) noncanon++;
        q.play(mv); walk(c, q, d + 1);
      }
    })(g.moves, pos, 0);
  }
  console.log(f.padEnd(28), { bytes: text.length, games: games.length, nodes, comments, illegal, noncanonicalSan: noncanon, maxDepth });
}

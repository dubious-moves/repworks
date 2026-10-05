import { parsePgn, makePgn, parseComment, emptyHeaders } from 'chessops/pgn';
import { parseFen } from 'chessops/fen';

// Hand-built fixtures in the dialect scalachess renders (Pgn.toString + PgnNodeEncoder + Move.appendSanStr).
// NOT real exports - real ones come from the owner's studies in Phase 0.
const fixtures = {
  standard: `[Event "Rep: Najdorf"]
[Site "https://lichess.org/study/abcdefgh/ijklmnop"]
[Result "*"]
[Variant "Standard"]
[ECO "B90"]
[Opening "Sicilian Defense: Najdorf Variation"]
[StudyName "Rep"]
[ChapterName "Najdorf"]
[ChapterURL "https://lichess.org/study/abcdefgh/ijklmnop"]
[Annotator "https://lichess.org/@/someone"]
[Orientation "black"]

{ Root comment, before the first move } { second root comment }
1. e4 c5 2. Nf3 { A comment } { [%csl Gd4][%cal Gd2d4,Rc5d4] } 2... d6 (2... Nc6 { Old line.
Two lines here } 3. d4 (3. Bb5 g6!? 4. O-O $14) 3... cxd4) 3. d4!! cxd4?! 4. Nxd4 Nf6 5. Nc3 a6 $10 { [%anno "Other", other] by another author } *`,
  customFenBlackToMove: `[Event "Rep: Endgame"]
[Result "*"]
[Variant "Standard"]
[ECO "?"]
[Opening "?"]
[StudyName "Rep"]
[ChapterName "Endgame"]
[FEN "8/8/4k3/8/3PK3/8/8/8 b - - 0 40"]
[SetUp "1"]
[Orientation "white"]

40... Kd6 (40... Kf6 41. Kd5) 41. Kd5?? *`,
};

// Lichess-dialect writer prototype (mirrors scalachess PgnNodeEncoder/Move.appendSanStr).
function writeMove(node, ply, force, out) {
  const white = ply % 2 === 0;           // ply = half-moves played before this move
  const no = Math.floor(ply / 2) + 1;
  if (white) out.push(no + '. '); else if (force) out.push(no + '... ');
  let s = node.data.san;
  for (const n of node.data.nags || []) s += n <= 6 ? ['', '!', '?', '!!', '??', '!?', '?!'][n] : ' $' + n;
  for (const c of node.data.comments || []) s += ' { ' + c + ' }';
  out.push(s);
}
function writeLine(node, ply, force, out) {
  // node: ChildNode at the start of a line; render it, its variations, then continue
  let cur = node, p = ply, f = force;
  for (;;) {
    for (const c of cur.data.startingComments || []) out.push('{ ' + c + ' } ');
    writeMove(cur, p, f, out);
    const parentSidelines = cur._sidelines || [];
    for (const v of parentSidelines) { out.push(' ('); writeLine(v, p, true, out); out.push(')'); }
    const hasComment = (cur.data.comments || []).length > 0;
    const next = cur.children[0];
    if (!next) return;
    // children[1..] are variations of `next`, rendered after next's SAN
    next._sidelines = cur.children.slice(1);
    out.push(' ');
    f = (p % 2 === 1) ? false : (hasComment || parentSidelines.length > 0);
    // scalachess: force turn number for next (black) move if current (white) had comment or variations
    p = p + 1; cur = next;
  }
}
function writeLichess(game) {
  let s = '';
  for (const [k, v] of game.headers) s += `[${k} "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]\n`;
  s += '\n';
  if (game.comments && game.comments.length) s += '{ ' + game.comments.join(' } { ') + ' }\n';
  const fen = game.headers.get('FEN');
  const ply0 = fen ? parseFen(fen).unwrap(st => (st.fullmoves - 1) * 2 + (st.turn === 'white' ? 0 : 1), () => 0) : 0;
  const first = game.moves.children[0];
  if (first) { first._sidelines = game.moves.children.slice(1); const out = []; writeLine(first, ply0, true, out); s += out.join(''); }
  s += ' ' + (game.headers.get('Result') || '*');
  return s;
}

for (const [name, text] of Object.entries(fixtures)) {
  const [g] = parsePgn(text, emptyHeaders);
  const mine = writeLichess(g);
  console.log(`\n== ${name}: byte-identical with our dialect writer: ${mine === text}`);
  if (mine !== text) { console.log('--- expected\n' + text + '\n--- got\n' + mine); }
  console.log('root comments:', JSON.stringify(g.comments));
  const nodes = []; (function walk(n, d){ for (const c of n.children) { nodes.push([d, c.data]); walk(c, d+1); } })(g.moves, 0);
  for (const [d, x] of nodes) if (x.comments || x.nags || x.startingComments) console.log('  node', x.san, JSON.stringify({c: x.comments, n: x.nags, sc: x.startingComments}));
  console.log('chessops makePgn movetext:', makePgn(g).split('\n\n')[1]);
  const shapes = null;
  if (shapes) console.log('parseComment on 2. Nf3 comments:', JSON.stringify(shapes));
}

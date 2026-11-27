// node build.ts <repo chapter file> <id> <base pgn> <mine pgn> <out> [chapter name]
// Carries the owner's changes (repo vs base) over to mine, three-way, node by node, and writes the
// result with the repo file's headers and id, in repworks' own form. Prints every change it carried
// and every conflict (a node both sides changed: the owner's version is kept and reported).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChapterFile, parseGames } from '/home/user/repworks/src/core/pgn/parse.ts';
import { chapterFileText } from '/home/user/repworks/src/core/pgn/write.ts';
import type { Chapter, MoveNode, RootNode } from '/home/user/repworks/src/core/study/model.ts';
const [repoF, id, baseF, mineF, outF, name = 'Jobava simplified'] = process.argv.slice(2) as string[];
const fromFile = (f: string): Chapter => {
  let n = 0; const all = parseGames(readFileSync(f, 'utf8'), () => `x${n++}`);
  const hit = all.filter((p) => p.ok && (all.length === 1 || p.chapter.headers.some(([k, v]) => k === 'ChapterName' && v === name)));
  if (hit.length !== 1 || !hit[0]!.ok) throw new Error(`${f}: ${hit.length} chapters named ${name}`);
  if (hit[0]!.notes.length) console.log(`notes in ${f}:`, JSON.stringify(hit[0]!.notes));
  return hit[0]!.chapter;
};
const rp = parseChapterFile(readFileSync(repoF, 'utf8'), id);
if (!rp.ok) throw new Error(rp.reason);
const R = rp.chapter, B = fromFile(baseF), M = fromFile(mineF);
type N = RootNode | MoveNode;
const index = (root: RootNode) => { const m = new Map<string, N>(); const walk = (n: N, p: string) => { m.set(p, n); for (const c of n.children) walk(c, p ? `${p} ${c.san}` : c.san); }; walk(root, ''); return m; };
const data = (n: N) => JSON.stringify({ c: n.comments, s: n.shapes, g: n.nags, sc: n.startingComments });
const setData = (to: N, from: N) => { to.comments = [...from.comments]; to.shapes = [...from.shapes]; to.nags = [...from.nags]; to.startingComments = [...from.startingComments]; };
const iR = index(R.root), iB = index(B.root), iM = index(M.root);
const log: string[] = [];
// owner edits and additions
for (const [p, r] of iR) {
  const b = iB.get(p), m = iM.get(p);
  if (!b) {
    if (!m) {
      const par = iM.get(p.split(' ').slice(0, -1).join(' '));
      if (!par) continue; // its parent was added too and copied with it
      const copy = structuredClone(r) as MoveNode; par.children.push(copy);
      const sub = index({ ...copy, children: [copy] } as unknown as RootNode); for (const [q, n] of sub) if (q) iM.set(`${p.split(' ').slice(0, -1).join(' ')} ${q}`.trim(), n);
      log.push(`ADDED (owner's node, copied with its subtree): ${p}`);
    } else if (data(m) !== data(r)) log.push(`BOTH ADDED, data differ (mine kept, check that the owner's text is in it): ${p}\n   owner: ${data(r)}\n   mine:  ${data(m)}`);
    continue;
  }
  if (data(r) === data(b)) continue;
  if (!m) { log.push(`OWNER EDITED a node I removed (not restored, check): ${p}`); continue; }
  // field by field: the owner's field wins where he changed it; a field both changed differently is a conflict (his kept)
  for (const k of ['comments', 'shapes', 'nags', 'startingComments'] as const) {
    const rv = JSON.stringify(r[k]), bv = JSON.stringify(b[k]), mv = JSON.stringify(m[k]);
    if (rv === bv) continue;
    if (mv === bv) { (m as any)[k] = structuredClone(r[k]); log.push(`CARRIED owner's ${k}: ${p}`); }
    else if (mv !== rv) { (m as any)[k] = structuredClone(r[k]); log.push(`CONFLICT in ${k} (owner's kept, mine dropped): ${p}\n   owner: ${rv}\n   mine:  ${mv}`); }
  }
}
// owner deletions
for (const [p] of iB) if (p && !iR.has(p) && iM.has(p) && iR.has(p.split(' ').slice(0, -1).join(' '))) {
  const par = iM.get(p.split(' ').slice(0, -1).join(' '))!; const san = p.split(' ').at(-1)!;
  par.children = par.children.filter((c) => c.san !== san); log.push(`DELETED (owner removed it): ${p}`);
}
const out: Chapter = { id, headers: R.headers, root: M.root };
writeFileSync(outF, chapterFileText(out));
console.log(log.length ? log.join('\n') : 'no owner changes to carry');
console.log(`wrote ${outF}`);

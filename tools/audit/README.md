# Repertoire audit tools (hand-over from the reviewing session)

These are the scripts a reviewing session ran to audit the owner's 1.Nc3 repertoire (PLAN.md §5.214 and §5.216 describe the data-repo hand-off they feed). They are copied as they were, in the folder layout they ran in. Nothing from the owner's studies is in this folder.

The rules the audit follows, the ledger of what is audited, and the hand-kept study live in the private data repo, under `notes/<study id>/` (`rules.md`, `ledger.md`).

## Before you run them

- **Hardcoded paths.** Several scripts import chessops from `/home/user/repworks/node_modules/chessops/dist/esm/`, and the `.ts` ones import repworks' own `src/core` by absolute path. `deck/evid.sh` names the session's old scratchpad (`/tmp/claude-0/.../scratchpad/deck`); edit `D=` there.
- **Where to run them from.**
  - Most run from this folder.
  - `audit/sub_inv.mjs` and `deck/shares.mjs` read and write the explorer cache `review/cache.json`. Run `sub_inv` from `review/` (`cd review && node ../audit/sub_inv.mjs …`).
  - `r9/t3.mjs` imports `src/core`, so run it from the repworks root.
- **Node.** 22+. `.ts` files and `planlines.mjs` need `node --experimental-strip-types --no-warnings`.
- **Stockfish.** `apt-get install stockfish` gives `/usr/games/stockfish`; `sf/*.mjs` and `r13/sfscreen.mjs` expect that path.
- **Lichess explorer.** Scripts that fetch from the explorer read a token from `LICHESS_TOKEN`. The explorer allows about 16 requests a minute; a missing cache is slow to rebuild.
- **Chapter.** Several scripts default to the chapter named "Jobava simplified" (`ChapterName`); some take the chapter as an argument.

## The scripts

**Inventory and tags**
- `audit/sub_inv.mjs <study> "<path>" <out.json>` (from `review/`): every Black-to-move position under the path, with each drilled reply's share, games, reach (also over all move orders: `reachAll`), White moves below it, single-move flag and our move. Prints a table; fetches missing explorer data into `cache.json`.
- `audit/owntag.mjs <inv.json> "<prefix>" <owner pgn>...`: the inventory's replies tagged C (common: reach 1 in 2,000+ and 10%+ share), O (the node is in an owner file), S (single-move branch).
- `r12/tree.mjs <pgn> "<chapter>"|- "<path>" <depth>`: prints a subtree with comments.
- `r13/comdump.mjs <study> "<prefix>"`: every comment under the prefix, with its full line.
- `r16/ledger.mjs <chapter file> <depth>`: per subtree (the move at that ply), positions with drilled replies, replies, single-move branches and White moves, for the ledger.
- `r12/getcom_json.mjs <study> <paths.json>`: `{path: comment}` for each path ("" if none, null if the path is missing).

**Screens**
- `r13/sfscreen.mjs <study> "<prefix>" <ms>`: for every White move under the prefix, Stockfish's top 3 and our move's eval; FLAG when ours is 0.50+ behind.
- `sf/pv.mjs "<SAN line with numbers>" <ms> [multipv]`: Stockfish's principal variations after the line, White's view.
- `sf/lineeval.mjs "<SAN line>" <startPly> <ms>`: at each position from startPly, the best 3 moves and the played move's eval.
- `sf/sfcand.mjs <positions.json> <seconds> <threads>`: each candidate's eval (MultiPV over `searchmoves`).
- `pe/summ.mjs <practical report.json> [threshold]`: a `scripts/practical.ts` report sorted, the played (first) candidate against the rest.

**Applying a batch**
- `audit/edit.mjs <in study> <ops.json> <out raw>`: applies ops in order and writes with chessops' writer. The ops format is `{chapter, cut:[{at, mode:"node"|"children"}], lines:[pgn files], comments:[{at, comment}]}`, where `at` is a SAN path from the start.
  - New nodes from lines keep the line's comments.
  - A comment op replaces the node's comment, so prepend the existing comment yourself (`r12/getcom_json.mjs`).
- `fixnotes.mjs <in> <out>`: every leaf's "transposes to" note re-pointed to where its position really continues ("(chapter X)" for another chapter). A note whose position continues nowhere is dropped. Run it after `edit.mjs`.

**Checks** (each batch must pass all of them)
- `whitealts.mjs <study>`: White positions, positions with more than one White move (want 0), illegal moves (want 0).
- `planlines.mjs <study>`: every clickable line in the comments, read by repworks' `src/core/repertoire/lines.ts`: fully, partly or not playable (want all fully).
- `r9/t3.mjs <study>` (from the repworks root): every node's legality, and each comment's lines as `[played/total]` (want no partial).
- `r12/blackleaf.mjs <study>`: lines that end on a Black move without a transposition note (want 0).
- `review/ownercheck_all.mjs <owner pgn> <study> "<chapter>"`: every move and comment of the owner's file still in the study, with the missing ones listed.
- `r12/cardstart.mjs <deck pgn> <old study> <new study>`: idea cards whose start position the old version drilled and the new one doesn't ("LOST").

**The data repo** (write with repworks' own parser and writer)
- `r15/roundtrip.ts <chapter file> <id>`: parses and writes back with repworks; prints IDENTICAL when the writer reproduces the file.
- `r15/build.ts <repo chapter file> <id> <base pgn> <mine pgn> <out> [chapter]`: three-way merge. The owner's changes since base are carried onto mine field by field (comments, arrows, glyphs): his changed field wins, and a field both sides changed is reported as a conflict, his kept. The result is written in the app's form, with the repo file's headers and id.
- `r15/addchapters.ts <source pgn> <study dir> jobava|deck [chapter names...]`: adds chapters to a data-repo study with fresh ids, writes the files and appends them to `study.json`.
  - `jobava` takes the named chapters, with headers like the study's.
  - `deck` takes every game and keeps its headers, adding `StudyName`.
- `r13/mccut.mjs <study> <inv.json>...`: positions whose most common reply (in a before-inventory) is no longer drilled. It was used once; the rule behind it was withdrawn.

**Owner exports, before the data repo** (superseded by `scripts/chapter-diff.ts`)
- `r10/diff.mjs <a> <b> [chapter]`: path diff of a chapter in two studies.
- `r10/pos2.mjs <study> <other> <out>`: new White moves and comment-line moves, with ChessDB.
- `r10/gaps2.mjs <study> <other>`: common replies left uncovered on new nodes.
- `r10/coms.mjs <study> <other> <out>`: comments changed on existing nodes.

**Idea deck checks**
- `deck/merge.mjs <study> <out> <prefix>`: the chapters whose names start with the prefix, merged into one game.
- `deck/shares.mjs <in> <out>`: `{NN%}` share comments on Black's moves from the explorer, for `scripts/ideas/cv.ts check --rep`.
- `deck/ansck.mjs <rep pgn> <cards.json>`: each card's answer is the repertoire's only move at its position.
- `deck/evid.sh`: per card, `cv.ts grade`, `maia` and `look` evidence into `ev/c<id>.txt`.

**Earlier phases** (close calls, the system test, thin positions)
- `review/review.mjs <study> <chapter> <out.json>` and `review/report.mjs <out.json>`: a chapter's White moves against the explorer and ChessDB, uncovered 2%+ replies, line ends by reach; then the flags.
- `review/alldec.mjs <study> <out.json>` and `review/nb.py` (its input file name is hardcoded): every White decision with reach; then neighbours, meaning Black's shares and our answers in near-identical positions.
- `review/thinscan.mjs <study> <out.json> [minNodeReach]` and `review/thinrank.mjs <study>`: positions reached often but with under 100 games; then a blend of games and Maia.
- `review/sharepgn.mjs <study> <chapter> <out> [--fetch]`: a chapter as moves with `{NN%}` shares, the input for cdbexplore (q_extension).

## The batch workflow

One subtree per batch:
1. Inventory, tags and the existing comments.
2. The Stockfish screen of every White move.
3. `scripts/practical.ts` with Maia on the flagged moves and at line ends (`--replies`).
4. Judge each reply by the rules in the data repo's `rules.md`, and write an ops builder (a small script per batch, kept in the data repo since its contents are the owner's lines).
5. `edit.mjs`, then `fixnotes.mjs`, then all the checks.
6. The idea deck check:
   - `deck/merge.mjs`, then `deck/shares.mjs`;
   - `scripts/ideas/cv.ts check <deck> --rep <shares pgn> --cards N --max-cards N --rare 0.5 --depth 18`, with `STOCKFISH`, `STOCKFISH_THREADS=3` and `IDEAS_CACHE` set.
7. Into the data repo with `r15/build.ts` (base = the version the owner last had), `r15/roundtrip.ts`, and `node scripts/validate-data.ts`.
8. Commit, then make the review list (`scripts/chapter-diff.ts --review <name> --notes notes.json`) and commit it.
9. Push to main. Read the owner's answers later with `scripts/review-answers.ts` and `scripts/chapter-diff.ts <checkout>@<your last commit> <checkout>`.

Settings used: `scripts/practical.ts --depth 5 --maia --ort-node <folder> --replies --cache <dir>`, with `--depth 7` when candidates are within 3 points. The `<folder>` is onnxruntime-node installed with `npm i --ignore-scripts onnxruntime-node`. The owner's defaults print at the top of each run:
- blitz, rapid and classical; ratings 1600–2500;
- risk aversion 0.05, reply threshold 3%, minimum 50 games, reach floor 2%;
- own margin 5, own candidates 3, prepared prior 50;
- Maia maia3-23m at 2150.

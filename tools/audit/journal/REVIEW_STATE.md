# 1.Nc3 repertoire: state for the reviewing session (updated 2026-11-24)

The authoritative decisions note is `repertoires/NC3_DECISIONS.md` on the owner's PC. This file is
this session's own working state.

## Owner principles (binding)
- 1.Nc3 with the Jobava as the fallback. Avoid Black's home theory, except in the Jobava. Lure Black
  into lesser-known lines. Balance win rate, low theory and eval, with risk aversion.
- The 2% rule is per move: a Black move played in under 2% of the games at its own position gets no
  manual review and no pins. It is NOT about reach.
- Always name variations as full lines from 1.Nc3. NEVER "…" or a partial line in any list or message to the
  owner (owner reminded 2026-11-26 09:40: partial lines are hard for him to find).
- **Foundation first (2026-11-24).** Review and make the data-backed foundation as good as possible
  before any rare continuations. Slow, chapter by chapter, and everything reviewed.
- Built moves only where the position has 50+ games, except the owner's own lines and decided lines.
  Don't build continuations or plan lines on Black playing ChessDB's best. The deepening rules and the
  base are on hold.
- The database filter is the app's default: blitz, rapid and classical, ratings 1600–2500+. The owner
  says 1600s match 2000s on single positions.
- Future approach, not now: a base PGN at full depth, plus a drilled PGN cut from it by importance,
  with the cut-off parts turned into clickable plan lines.
- When a deepened line runs out of data, Black's move comes from a blend: games alone at 100+ games;
  games plus 20 × Maia's probability (Maia at about 2100) between 10 and 99; Maia alone below 10.
  "Sharp" means only-move spots: after Black's best reply, White's good moves (within 5 win% of the
  best) total under 50% in that blend. Then Black plays ChessDB's best. This is on hold with the
  deepening.

## Review workflow (agreed)
1. For one chapter, list its White decisions with 2–3 candidates each: ours, the best alternative by
   results, and ChessDB's best.
2. Run the Practical eval on all of them FIRST. Depth 5 on every decision, depth 7 on the close ones.
3. Then give the owner only the close calls, with a recommendation, plus a short list of the rest.
   The owner then decides. A chapter is accepted once and frozen.
- **Order:** 1...c5 is ACCEPTED (nc3_c5_reviewed.pgn). Next, by reach: Jobava, 1...Nf6 2.d4, 1...e5, 1...e6, and so on.
- **Explorer checks:** `review/review.mjs <study.pgn> <chapter> <out.json>`, with the cache in
  `review/cache.json` (keys `x16|` at 1600–2500, `c|` for ChessDB). Then
  `review/report.mjs <out.json>` prints the flags: ENGINE, SCORE, WORSE, THIN, uncovered replies and
  line ends.
- **Practical eval:** run from /home/user/repworks after `git pull`:
  `node scripts/practical.ts --positions P.json --cache <scratchpad>/pe/cache --out <scratchpad>/pe/X.json --depth 5 --maia --ort-node <scratchpad>/ort`
  - The input is `[{"moves":"1.Nc3 c5 ...","candidates":["O-O-O","Ng5"]}]`.
  - It takes about 70 s per candidate at depth 5 and about 2.5 min at depth 7 from a cold cache;
    seconds once cached.
  - The spot check at …8.Bh6 O-O gave 9.O-O-O 70.5% and 9.Ng5 71.2%. The owner's app shows 69% and
    60%. The app's tooltip says "ChessDB had no eval for 7 positions or moves" and falls back to the
    eval of the move before.
  - Likely cause: partial ChessDB answers that the app's searches cache for 7 days, while unknown
    positions are cached for 1 day. The script's fresh numbers are probably the better ones.
  - Possible repworks fix: the search asks again when a move it needs has no eval. Offered to the
    owner, not built.

## Owner move decisions (beyond the compact summary)
- **French:** 1.Nc3 Nf6 2.d4 e6 3.e4 d5 4.Bd3 (accepted; not 4.e5 Nfd7 5.Qh5).
  - 4...c5 5.dxc5 Bxc5 6.e5 Nfd7 7.Qg4.
  - 4...Bb4 and 4...Be7: 5.e5 Nfd7 6.Qg4.
  - 4...dxe4 5.Nxe4 Nxe4 6.Bxe4 Nd7 7.Qe2 Nf6? 8.Bxb7.
  - 5...dxe4 6.Nxe4 Nxe4 7.Bxe4 Qxd1+ 8.Kxd1 Bxc5 9.f4 (the owner's line goes on 9...Nd7 10.Nf3 Nf6
    11.Bd3 b6 12.a4 Bb7 13.a5 O-O 14.Ke2).
- **1...c5:**
  - 1.Nc3 c5 2.d4 cxd4 3.Qxd4 Nc6 4.Qh4.
  - 4...d5 5.e4 d4 6.Nd5 Nf6 7.Bc4: an important line, to be made deep later.
  - 3...Nf6 4.Nf3 g6 5.Qh4 (pin).
  - …4.Qh4 Nf6 5.Nf3 g6 6.e4 d6 7.Bc4 Bg7 8.Bh6 O-O 9.O-O-O (keep).
- **Accepted from the overnight review:**
  - …3.Bf4 g6 4.e3 Bg7 5.h4 h5 6.Nf3 Bg4 7.Qd2.
  - 1.Nc3 Nf6 2.d4 e6 3.e4 c5 4.d5 d6 5.Bb5+.
  - 1.Nc3 g6 2.d4 Bg7 3.e4 c6 4.Nf3 (pending 4.h3).
  - 1.Nc3 d6 2.d4 e5 3.e4 (pending the theory check).
- **Pins still to apply in their chapters' reviews:**
  - 1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6 5.h4;
  - 1.Nc3 Nf6 2.d4 c5 3.d5 d6 4.e4 g6 5.f4 (the owner has played this as Black and found it
    uncomfortable);
  - 1.Nc3 e6 2.d4 b6 3.e4 Bb7 4.Bd3 Bb4 5.Nh3 (the owner likes it).
- **Investigations still open** (the deeprep session):
  - 1.Nc3 g6 2.d4 Bg7 3.e4 c6 4.h3 (rare, scores well);
  - 1.Nc3 c6 2.d4 d6 3.e4 g6: 4.h4 vs 4.Nf3. The owner wants 4.h4 unless it means much more theory.
  - 1.Nc3 d6 2.d4 e5: how much theory 3.e4 brings (Black plays 3...Nf6 only about 6%).
- **Study layout:** the early ...g6 lines in the Jobava chapter go to "Jobava: ...g6 setups". These
  are 1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6, …3.Bf4 c6 4.e3 Nbd7 5.Bd3 g6, …3.Bf4 a6 4.e3 g6 and
  1.Nc3 d5 2.d4 c6 3.Bf4 g6.
- **Transpositions:** each continues in one place only (the owner's move order wins), and the others
  end with a "transposes to" note.

## Study assembly (10 chapters)
- **Script:** `gaps/regroup4.mjs <input.pgn> <out.pgn>`. It merges the chapters (the PLAN in the
  script), moves the ...g6 lines (MOVES), merges transpositions (preferring the owner's
  continuation, then the largest subtree) and renames the notes.
- **Input:** the deeprep joins print, plus `gaps/trap_lines.pgn` renamed to ChapterName
  "owner trap: ...g6", plus the owner's ORIGINAL uploads with ChapterName "owner orig: Jobava" and
  "owner orig: e5". The deeprep session's copy of the 1... e5 file has no comments.
  - Uploads: `/root/.claude/uploads/c3c91cac-f0c9-5e7b-af69-21d816dac207/3c493f36-1._Nc3_-_Jobava_simplified6.pgn`
    and `fb40f2fe-1._Nc3__Jobava_-_1..._e5.pgn`.
- **Collecting the print:** move `pgnparts/` aside, run `python3 collect.py <events file>`, then join
  the parts with "\n", because each chunk lacks its final newline. Cut at the "===" marker.
- **Checks:** `whitealts.mjs` (0 illegal), `gaps/kid.mjs`, `ownercheck.mjs <orig> <study> <chapter>`,
  `dups.mjs`, and
  `node --experimental-strip-types --no-warnings planlines.mjs <study>` (every clickable line plays
  in repworks' own parser).
- **Last studies sent:** `nc3_study_rd.pgn` (overnight), `nc3_study_drill.pgn` (transpositions
  merged, ...g6 lines moved).

## Sessions
- **deeprep on the owner's PC:** session_01XshYbDbjsAeNPWV5synGn2. It can't message back; read it
  with list_events, `ev.py` and `collect.py`. It was sent the pruning pass (`_f` set, 50-game rule,
  plan lines cut, notes), then waits.
- **Practical script session:** session_01XshYbCLJu8VK1usNTAUrD5 (done; §5.211 on main).
- **Holdout session** (PC): session_01XshYbEH2m5AZQkWdEVTUYs. It built `held_2610` from 2024-08,
  2024-09 and 2026-10. It is waiting on the owner about recording the months in folder imports.
- **Builds:**
  - the `_rd` set (26 chapters, overnight);
  - `nc3_c5_rv4` (98 positions, the 1...c5 chapter with the pins, Maia blend and only-move rule);
  - `_base` (stage D, paused, on hold).

## Current study: `_f` (2026-11-24 evening)
- The deeprep `_f` print is collected in `gaps/f_joins.pgn`. `collect.py` now also accepts unquoted
  `sed -n A,Bp`. A chunk whose last line is blank loses it, so check that each `[Event` has a blank
  line before it. Input = `gaps/f_joins.pgn` + `gaps/owner_tail.pgn` (the owner's trap and
  originals) → `gaps/f_input.pgn` → regroup4 → `nc3_study_f.pgn`.
- Stats: 1,772 White positions; 590 line ends plus 107 that end in a join note. Median end at
  moves 5–10 by chapter; only 41 ends go past move 12; the deepest are the owner's (Jobava 18,
  1...e5 16). Scripts: `lenstats.mjs`, `mainl.mjs`, `review/mainpath.mjs`,
  `review/leafgames.mjs` (games left at each line end → `review/leaves_f.json`).
- **Plan lines (owner, 2026-11-24): they need the same care as variations.** The builder's plan lines
  start with Black's uncovered 2%+ reply, use ChessDB's top move for White, and the most played
  move for Black, cut under 50 games. There are 336 comments and 805 lines, all unreviewed.
  14 of the 36 times a plan line reaches a position the tree covers, it plays a different White
  move (`planconf.mjs`).
  - `nc3_study_f_noplans.pgn` (`stripplans.mjs`) drops them and keeps the owner's 80 comments with
    138 lines, plus the join notes.
  - Proposal: remove them, make line ends a review item, and later take plan lines only from the
    reviewed base.
- **Line ends by reach** (`review/leafreach.mjs` → `review/reach_f.json`; `review/gaps.mjs` gives
  the replies not continued anywhere). Reach = the product of Black's move shares from 1.Nc3; the
  base is 10.4M 1.Nc3 games. There are 464 ends with 50+ games; none above 0.34%; 3 at 0.2–0.5%, 25 at
  0.1–0.2%, 157 at 0.05–0.1%. Together they reach about 19–20% of our games.
  - The biggest gaps are spread positions (many replies, each under the 0.05% cut):
    1.Nc3 e6 2.d4 d6 3.e4 (0.34%) and 1.Nc3 g6 2.d4 Bg7 3.e4 d6 4.Bg5 c6 5.Qd2 (0.26%).
  - 1...c5 ends at 0.1%+: …4.Qh4 d5 5.e4 d4 6.Nd5 Nf6 7.Bc4 (0.24%, Be6/e6), …4.Qh4 e6 5.Qxd8+
    Nxd8 6.Nb5 Ke7 7.Bf4, …9.Bxe7, and …6.Nd5 e6 7.Qxd8+ Kxd8 8.Nf4.
  - Owner (2026-11-24): the position count = data and familiarity; reach = how much a line matters
    to us. Both are used.
- The pinned …9.O-O-O Qa5 10.Ng5 Ne5 line ends on Black's move: it needs a White answer in the
  1...c5 review.

## Review method (owner, 2026-11-24 evening; supersedes the workflow's step 1)
- Plan lines: the owner agreed. Review from `nc3_study_f_noplans.pgn`. Line ends are review items
  (stop / extend / reviewed plan line). Later, plan lines come only from the reviewed base.
- **cdbexplore runs one chapter ahead** of the review, in its own cloud session. Jobava simplified:
  session_01XshYbBNhEqtVFUXeNp51Qv (smaller model, low effort, default rate 60; q_extension
  read-only; 1.9 h runs up to 30 h; reports eval and best-move changes). The first attempt,
  session_01XshYbEeEi647Vk99g815KJ, was archived because it ran on the default model.
- **Sessions I start:** choose the model and effort for the job. Script runners get a smaller
  model at low effort (owner, 2026-11-24; also in repworks CLAUDE.md). The ChessDB rate: each
  process has its own limiter, and there is no shared limit. 60 a minute is q_extension's polite
  default, and we keep the total near it. Its input is from `review/sharepgn.mjs` (moves only,
  `{NN%}` shares, join ends dropped): `jobava_explore.pgn`, 1438 positions.
- **Close calls come first.** Sources:
  - the builder's own flags: close, engine, limit, trap, learn, thin-lead, holdout, no-eval.
    The deeprep session was asked for exports of nc3_c5_rv4_f and nc3_jobava_rd2_f (every
    decision with every candidate's numbers);
  - the owner's triggers: (a) ChessDB clearly higher with a close or higher win rate; (b) the
    win rate clearly higher (equal-rating / prepared) with a close or higher ChessDB;
  - my additions (proposed): see the reply of 2026-11-24 evening.
- **Settling a close call:** 0. fit with the repertoire (transpositions, familiar ideas, how much
  theory each candidate needs); 1. Practical eval, depth 5 (it decides when the rest is close);
  2. Stockfish in parallel (/usr/games/stockfish, 4 cores); 3. Maia score, lightly weighted.
  - **If 0 or 1 has a clear winner, stop there**: don't run or present the rest (owner).
  - **"Maia score"** is repworks' explorer column: Maia's expected score for the side to move after
    the move (its value head, at the panel's Elo). It is not the chance of finding moves; Practical
    already covers that.
- Agreed triggers: the builder's flags; ChessDB 3+ win% higher with the win rate at most 1 point
  lower; the win rate 3+ points higher (equal ratings, 100+ games each) with ChessDB at most 3 win%
  lower; a critical reply (10%+, we score under 45% or ChessDB ≤ 0.00); the same position with
  different moves; line ends with high reach. Plus cdbexplore on the close-call positions
  before Practical.

## Extending a line (owner, 2026-11-24 late; binding)
- Round 1's extensions were wrong in shape: splitting a line end into two branches with one White
  move each (often the same obvious capture) is not an extension.
- **Sharp line** (forcing; wrong moves are punished): one branch, which may be enough, follows the
  ChessDB continuation, provided ChessDB's eval isn't shallow. This overrides "no continuations
  with Black playing ChessDB's best" for sharp extensions only.
- **Non-sharp line:** built as deeprep builds, limited to a single variation:
  `node tools/deeprep.mjs build lichess --moves "<line>" --side white --coverage 0` follows only
  Black's most-played reply (pickReplies: coverage 0 stops after the first reply) and stops under
  50 games. It runs on the PC (local index) in the deeprep session.
- **Clickable lines** before the line's end can show other branches that don't deserve drilling.
- **Where the line ends** needs care: build 6+ plies, then cut back to where it's best to stop and
  give the rest as a clickable continuation.
- **Shallow ChessDB** (its stored PV under 10 plies, cdbexplore's own test, or Stockfish 30 s
  disagreeing by 0.5+): use Stockfish, or run cdbexplore on it.
- **Past 50 games is the owner's** ("I can take the responsibility of extending lines past the
  <50 games").
- Applied: the owner's 7.Bc4 line (1.Nc3 c5 2.d4 cxd4 3.Qxd4 Nc6 4.Qh4 d5 5.e4 d4 6.Nd5 Nf6 7.Bc4
  Be6 8.Nxf6+ exf6 9.Bxe6 fxe6 (9...Bb4+ 10.Kf1 ...13.h4) 10.Bd2 Qb6 11.Qh5+ g6 12.Qh3 Kf7 13.O-O-O)
  replaces round 1's 7...Be6/7...e6 8.Nxf6+ split: `c5edit2.mjs nc3_study_v2.pgn owner_bc4.pgn`,
  then fixnotes, giving **`nc3_study_v3.pgn`** (1787 White positions; checks clean; every owner
  White move is Stockfish's first choice at 10 s). 7...e6 (65 games, 34%) is now uncovered.
- The other two round-1 extensions (9.Bxe7 and 8.Nf4) have the same split shape. The 50+ data ends
  after our one move in both (only 9...Ndxe7 10.O-O-O has 83 games; its replies are under 50), so
  the builder adds nothing there. 9.Bxe7 is sharp for Black: ChessDB 9...Ncxe7 -0.11 vs Qxe7 -1.08,
  Ndxe7 -1.27 (White's view +), and 9...Ncxe7 (45 games) is uncovered. The owner is looking at them.
- **Owner, later the same evening:** (1) a 7...e6 line: 7.Bc4 e6 8.Nxf6+ gxf6 9.Nf3 Be7 10.O-O with two
  clickables (`owner_e6.pgn`); (2) 7.e5 replaces 7.Bg5 after 1.Nc3 c5 2.d4 cxd4 3.Qxd4 Nc6 4.Qh4 Nf6 5.Nf3
  e6 6.e4 Be7 (`owner_e5.pgn`: 7...Nd5 8.Qg3 Nxc3 9.Qxg7 Rf8 10.bxc3 ... 16.a4; 8...O-O and 8...g6 as
  clickables). I agreed: step 0 (one forcing line, 7...Nd5 98%, vs 5-6 branches for Bg5 or Qg3);
  Practical d7 close (Qg3 64.5, Bg5 63.6, e5 62.9); prepared/equal e5 66.6/66.3, Qg3 65.4, Bg5 64.9/64.1;
  ChessDB e5 +0.50, Qg3 +0.18, Bg5 +0.03; Stockfish d30 e5 0.47, Qg3 0.38, Bg5 0.26.
  - The builder chose Bg5 on learning cost alone (blend e5 57.2 vs Bg5 56.1; learn -1.8 vs -0.3).
    Its price() charges a new line at the size of the LARGEST candidate's line, so e5 paid for Bg5's
    tree. Watch "learn" decisions whose alternative is a forcing single line (Jobava category B).
  - Applied by `c5edit3.mjs nc3_study_v3.pgn`, then fixnotes, giving **`nc3_study_v4.pgn`** (1791 White
    positions; checks clean; all owner moves and comments present). The 7.Bg5 branches other orders
    reach moved: 7.Bg5 d6 to 6...d6 7.Bg5 Be7, and 7.Bg5 d5 8.O-O-O to 5...d5 6.Bg5 e6 7.O-O-O Be7 8.e4.
    The 7...h6/Qa5/O-O branches (with round 1's 9.Bxe7 split) are gone. Stockfish 10 s agrees with
    every owner White move in both lines.
- **cdbexplore speed-up (21:35 UTC):** runs 1-2 did 16 positions at 35-44 requests/min (the cap is 60;
  waiting on ChessDB's queue is the bottleneck). Sent: after run 3, explore the 62 close calls first
  (`jobava_close_explore.pgn`, 4 games so each is a line end; checked with cdbexplore's own
  positions(): 62 leaves) in `close/` with a copy of jobava.explore.json, `--concurrency 6`, rate 60;
  then copy the record back and continue the main list with concurrency 6; the 30 h limit lifted.
  A higher rate or a second session needs the owner's OK (load on ChessDB).
- **ChessDB rate (owner, 2026-11-24 late):** no rate-limit answer ever seen; 60/min was repgen's polite pace,
  not measured. Owner approved making refusals visible: q_extension branch `claude/gifted-cori-2whjds`,
  commit a396b4d (not merged to main; q_extension has no CI; harness 648 checks pass, 2 explorerdb
  download checks fail intermittently with spawn ENOMEM, unrelated). cdbexplore logs a refusal (HTTP
  429 or a rate-limit status), pauses 30 s, retries up to 3 times; the last line gives requests/min,
  "rate-limited N" and a status tally. The cdbexplore session checks it out after close-list run 1;
  main list at --rate 120 if that run averaged 55+/min; back off on any refusal.
  **Superseded (owner pointed to the extension: 3 in flight, about 340 ms a lookup, up to about 450/min,
  150 lookups without error on 2026-09-28):** every run from the next one at `--rate 450 --concurrency 3`;
  on a refusal, 240 for the next run. Why: the search sends a whole depth at once (Promise.all), and
  waits on queued positions happen outside the lanes, so 3 lanes at 340 ms never filled at 60/min:
  the 60 cap bound whenever requests were ready, and concurrency 6 would have done little. Each run
  also repeats the survey (about 1,957 requests for the main list: 33 min of every 1.9 h run at 60/min,
  about 4-5 min at 450).
- **Close list:** only 11 of the 62 close calls qualified (the rest have stored lines of 10+ plies or
  |eval| > 3). Close-list run 1 started 22:59 UTC (concurrency 6, rate 60), ends about 00:53 UTC.
  After it: Practical on `pe/jobava_close.json` with a FRESH cache.
- **Practical's limit is Lichess, not ChessDB (2026-11-25):** in the 1...c5 runs, d5 made 372 explorer
  requests in 22 min (16.9/min: the app's 16/min limiter, under Lichess's measured ~19/min, which
  answers 429 above it) and 697 ChessDB requests (32/min, uncapped: 3 in flight as the extension).
  So Practical already follows the extension's ChessDB approach, and nothing changes there. The
  fresh-cache rule is about ChessDB only: `pe/cache_jobava` = the old `explorer.jsonl` copied, no
  `chessdb.jsonl`. (review/cache.json's explorer data is lossy, n/w/r per move, so it can't seed
  Practical's cache; a future prefetch should write Practical's explorer.jsonl format.)
- **Done while cdbexplore finishes (00:30 UTC):** Stockfish 30 s x 4 threads on all 62 close calls
  (`sf/jobava_close.txt`, done 00:58: all 62, depth 27-36, median 30), familiarity (`pe/jobava_fam.txt`), fit (`pe/jobava_fit.txt`).
  The Practical start was moved to 00:58 UTC (trig_01RYJs4stkSVUxDr7yTCsiGU).
- The machine restarted about 00:25 UTC; the scratchpad survived. The new session scratchpad path is
  /tmp/claude-0/-home-user/c3c91cac-.../scratchpad, but the work stays in the -home-user-repworks one.
- Not yet on the PC: send the revised 1...c5 chapter (new name) and log this definition in
  NC3_DECISIONS.md once the owner has finished with the other changes.

## Overnight 2026-11-25 (owner asleep; "make sure we make progress through the night")
- **Scheduled check-ins into this session fail:** the 00:58 UTC one ended ACCESS_DENIED (after the
  machine restart). Chain the work on background-task completions instead (they wake this session).
- cdbexplore: the close list finished 23:46 UTC (6 left of 11 explored, 3 changed; 31 req/min on the
  old code). Main list run 4 started 23:46 UTC on a396b4d at `--rate 450 --concurrency 3`. Queued
  (sent 01:05 UTC): when the main list is done, `rest/jobava.pgn` = `jobava_rest_explore.pgn` (the
  other three Jobava chapters, 234 positions) with a copy of the record; then it reports and stops.
- Running here (started about 01:03 UTC): Practical d5 on `pe/jobava_close.json` (cache_jobava) ->
  `pe/jobava_close_d5.json` / `.log`; Stockfish 120 s x 2 threads -> `sf/jobava_close_120.txt`.
- **Next, on Practical d5 done:** close ones (Practical within ~1 point, unless fit settles it) ->
  `pe/jobava_close7.json`, Practical d7 (same cache) -> `pe/jobava_close_d7.json`; Maia score
  (`maia/maiascore.ts`) for the close ones. Then the morning summary: only close calls, a table each
  (fit, Practical d5/d7, prepared/equal, Stockfish 30 s and 120 s, ChessDB, Maia, familiarity) and a
  recommendation; the "learn" decisions (category B) checked for the price() size bias.

- **03:00 UTC status.** Practical d5 done (02:57): `pe/summ.mjs pe/jobava_close_d5.json 1` sorts the
  62 into 18 close (|gap| < 1), 16 swap (an alternative > 1 better), 28 keep. 7 of the 14 learn
  decisions (category B) are swaps: #94 #147 #213 #306 #327 #338 #366. The builder's own rows show the
  learn cost deciding: blends within 0-2, learn costs -2 to -24 at 0.04-0.75% reach.
  - Practical d7: close (`pe/jobava_close7.json` -> `pe/jobava_close_d7.json`, background b34c2z8r3,
    started 02:52), then swap (`pe/jobava_swap7.json` -> `pe/jobava_swap_d7.json`), sequential.
  - Maia score done: `maia/jobava_maia.txt` (all 34). Stockfish 120 s 59/62 at 03:00.
  - `pe/tables.mjs <labels>` joins everything into one markdown table per position.
  - Own-move light check started 03:05 (b1s6zgemw): `review/review_slow.mjs` (ChessDB sleep 1000 ms)
    on the 4 Jobava chapters -> `review/own_<chapter>.json`.
  - cdbexplore session: containers recycled twice; run 6 started 01:32 UTC. The record saves after
    each target (save() per target in cdbexplore.mjs), so nothing finished was lost.

- **03:40 UTC.** Close d7 done (03:28): `pe/summ.mjs pe/jobava_close_d7.json 1` -> 11 close, 3 swap
  (#158 a3 +2.0, #206 c3 +1.2, #526 bxc3 +2.0), 4 keep. Swap d7 then own3 d5 running (bd03zucyv).
  SF 120 s complete (62). Own-move check done: `review/own_flags.txt` (393 own moves, 0 engine flags;
  real reach only #33 4.g4/Bg5, #38 5.Nf3/h4, #55 6.Nf3/Qd2 -> `pe/own3.json`).
  - **#56 has the owner's 5.h4 pin** (notes line ~69) and the candidate list missed h4: h4 is the most
    played (44,909, 28.1%, 53.7% at avg 2099; Nf3 49.0% at 1980), SF 120 s h4 0.18 = Nf3 0.19, Maia h4
    55.4 vs 52.1. Practical d5/d7 for it queued (`pe/pin56.json`). #336 (…5.Bd3 g6) h4 fits the pin.
  - cdbexplore: run 6 done 03:26 (16 explored, 4 changed, 0 refusals, 46.5 req/min); run 7 going.
    Asked it to start rest/ in parallel now (bound by ChessDB's queue, not the rate).

- **04:30 UTC: Jobava close calls SENT** (`jobava_close_calls.md`, built from `pe/report_tpl.md` by
  `pe/report.mjs`, tables by `pe/tables.mjs`). Waiting on the owner. Recommendations:
  - h4 against ...g6: #56 apply the 5.h4 pin (Practical tie 53.4/53.7, prep +1.8, Maia +3.3); #306 5.h4
    (+2.1; #342 goes); #336 6.h4 (tie; plan; SF prefers 6.h3; #366 goes).
  - Switch: #338 5.Qg4, #372 7.Nb5, #327 8.O-O, #127 4.Nb5, #213 7.h4, #147 7.dxe5, #172 5.Bd3, #158 10.a3
    (both move orders), soft #94 6.Bd3, soft #255 6.a3.
  - Close, keep: #162 #206 #274 #287 #326 #335 #196 #236. Rest kept (11 at d7, 28 at d5).
  - Own moves: own#38 5.Nf3 vs 5.h4 (d7 +5.9, prep +8.3; engines equal) questioned; own#33 4.g4 kept
    (d7 g4 +2.6, flipped from d5); own#55 tie.
  - Learning cost: 8 of 14 overturned at d7 (+#336 with the plan). Proposed: cap its difference between
    candidates (e.g. 2 points) before the next chapters; needs the owner's OK.
  - Next after the owner decides: decisions file -> PC deeprep rebuild below the switches; then line
    ends with the extension rule.

- **04:50 UTC.** Report resent with full lines everywhere and section 8 (line ends preview):
  `review/ends.mjs` -> `review/jobava_ends.json`, `review/endsreport.mjs` -> `review/jobava_ends.txt`
  (265 ends, 6.2% of 1.Nc3 games, max 0.10%; 93 sharp after dropping recaptures and check replies;
  111 shallow, 60 within ±3.00). Suggested to extend only 5 (listed in section 8) after the switches.
  Own-move d7 (`pe/own2_d7.json`): own#38 h4 59.8 vs Nf3 53.9; own#33 g4 62.8 vs Bg5 60.2 (keep g4).
  cdbexplore: main run 7 and rest run 1 (started 03:32) in parallel.

- **06:20 UTC.** cdbexplore: main run 7 done 05:21 (16 explored, 57 left, 0 refusals), run 8 going
  (ends ~07:15). Rest list FINISHED 05:44 (16 explored over 2 runs; changes in its reports, none
  puts a PGN White move 0.30+ behind ChessDB). Sent at 06:15: lane B starts `nf6/nf6.pgn` now
  (`nf6_explore.pgn`, the 1...Nf6 2.d4 chapter, 540 positions, 96 ends, record copied from main);
  lane A takes `pirc/pirc.pgn` (`pirc_explore.pgn`, 186 positions) when the main list is done; a
  finished lane with nothing queued reports and stops.
  - PC deeprep session: disconnected since 04:07 (computer_unreachable) and blocked on the owner
    typing /compact. No builder export for 1...Nf6 tonight.
  - **Nf6 cache warm-up** (bprexgpms, from 06:18, `timeout 7000`, restart to resume):
    `pe/chapterpos.mjs` -> `pe/nf6_warm.json` (270 White decisions, reach order, app's own rows),
    Practical d5 `--maia`, NO `--analyse`, cache `pe/cache_nf6` -> `pe/nf6_warm_d5.json` / `.log`.
    Its ChessDB answers predate cdbexplore: NOT for decisions. Before the real Nf6 review (after
    cdbexplore's nf6 lane), rename `pe/cache_nf6/chessdb.jsonl` to `chessdb.pre-cdb.jsonl` and run
    with `--analyse`; the explorer answers (the 16/min part) are reused. Stop it if another
    Practical run is needed (two runs = 32 explorer requests a minute).

- **08:25 UTC.** Owner awake; PC on again; the decision list (Jobava items 1-6, older 7-9) sent,
  waiting on the answers. cdbexplore: nf6 lane FINISHED 07:12 (11 explored, 7 changed, none puts a
  PGN White move 0.30+ behind ChessDB). Main run 8 done 07:15 (54 left, 0 refusals), run 9 going
  (ends ~09:10). Sent at 08:25 (`cdb_msg_e5.txt`): lane B takes `e5/e5.pgn` now, then `e6/e6.pgn`;
  lane A: main list, then pirc, then `f5/f5.pgn`. PGNs: `e5_explore.pgn`, `e6_explore.pgn`,
  `f5_explore.pgn` (sharepgn from `nc3_study_v4.pgn`, same as nf6/pirc).
  - Nf6 warm-up: first window ended 08:15 with 27 of 270 done (explorer-bound, ~16/min). Resumed
    08:16 as b6zl7tpif (`timeout 7000`, log `pe/nf6_warm_d5b.log`); restart again when it ends.
    Its ChessDB answers since 07:12 postdate the nf6 lane, but still rename `chessdb.jsonl` before
    the real review, as planned.

- **09:00 UTC. Owner: learnability as a whole comes first** ("a repertoire that's easy to learn and
  remember; best case only idea/plan cards"; "my own moves: treat them the same as any built move";
  questioned #372 7.Nb5). New step in the review method, the **system test**:
  1. Default = the system move: the one that transposes into a line we play, or the move we play
     from the same setup in neighbouring lines.
  2. Another move must follow an idea the repertoire already uses (an idea card), or gain clearly
     (3+ at Practical d7) at a position reached about 1 in 1,000 games or more (tree reach 0.1%+).
  3. Gains from a few Black blunders count only if the punishing move follows from an idea card.
  Tools: `review/alldec.mjs <study> <out>` (every decision with tree reach, Black nodes with shares),
  `review/nb.py "<path>"` (neighbours: Black's shares and our answers), `review/converge.mjs
  alldec_v4.json <practical json>...` with `LABELS=#a,#b` (share of Black's 3%+ replies that rejoin
  our lines), `review/scan2.mjs` (how we meet ...Bh5, ...Bg6, recaptures on e5).
  Reach: last night's report used the builder's reach (its own index); tree reach is lower
  (#372 0.025%, #338 0.055%, #127 0.157%, #94 0.027%, #147 0.017%, #158 0.012%, own#38 0.63%).
  **Revised (sent to the owner 09:00):** keep #338 Qf3, #372 Nf3, #127 e3, #158 Rg1, #94 Ne5,
  #255 Nf3; switch #213 h4 (as vs ...Bh5 in 6.h4/5.h4 lines), #147 dxe5 (as everywhere in the Ne5
  lines), #172 Bd3 (joins the 2...Nf6 a6 Nc6 line), #327 O-O, h4 vs ...g6 (#56 #306 #336).
  own#38 5.h4: passes the test (+5.9, 1 in 160 games, h4 vs the bishop is an existing idea); asked.
  Learning-cost cap: WITHDRAWN (no builder change; the system test is applied at review).

- **10:15 UTC. Owner (reply to the 09:00 calls):**
  - **f3 against an early ...Bf5:** in 1.Nc3 d5 2.d4 c6 3.Bf4 Bf5, 4.f3 (aiming e4/g4 as in 2...Bf5 3.f3)
    may be equal or better than 4.e3 and reuses the 2...Bf5 3.f3 themes; check how it relates to the
    ...Nf6 lines (owner: f3 looks weaker after 2...Nf6 3.Bf4 Bf5). If f3 doesn't hold up, the owner
    leans to own#38 5.h4 ("easy pattern: Black completes the pawn triangle before developing the knight").
  - **Nb5 as a theme:** keep it only with a rule/signal that is easy to remember; check whether our
    current Nb5 moves are explainable, and whether the suggested ones (#372 7.Nb5, #127 4.Nb5) fit.
  - **The owner has learnt none of the lines yet** (learns once the repertoire is near complete):
    never weigh "new theory vs what he knows"; only the size and coherence of the whole repertoire.
  - Explorer (1600-2500): 1.Nc3 d5 2.d4 c6 3.Bf4 Bf5: e3 52.7%/304k, f3 53.7%/153k (cdb +4, best), Nf3 50.0.
    After 4.f3: e6 53.5% (then e4 +33 cdb / g4 57.6% played but -32; e4 dxe4 67%, Bg6 31%; fxe4 Bg6 96%),
    Nf6 28.0% (g4 68.6%, 55.5%, cdb +5), Nd7 6.4, h6 5.5, Qb6 1.7. 2...Nf6 3.Bf4 Bf5: e3 53.0/652k,
    f3 54.5/342k (cdb 0), Nb5 51.9 (cdb 0). own#38 5.f3 54.0/56k (cdb -3).
  - **Nb5 scan** (`review/nbscan.mjs` -> `nbscan.json`, `review/nbrule.mjs`): 24 Jobava Nb5 moves. Rule
    that explains 18: with Bf4 (or Qf4) on the c7 diagonal and only Qd8 guarding c7, Black king on e8,
    Nb5 when (a) Black's b-knight went to c6/d7 (no ...Na6; after Nc6 no ...c6), or (b) ...c5 has left
    c7/d6 as holes, but only with e3 in (Bf1/Bd3 guards b5 vs ...Qa5+); not after ...c4 (blocks the
    f1-b5 diagonal), not once Black castled (Nc7 no longer check), recaptures/threats first.
    Explorer backs the checks: before e3 after ...c5 Nb5 scores 41.6/48.5/35.2 vs e3/Qxd4 54-55.
    Outside the rule: 2...e5 3.dxe5 d4 4.Nb5 (knight attacked), Qxd6 cxd6 Nb5 endgame, Stonewall
    1.Nc3 d5 2.d4 e6 3.Bf4 f5 4.e3 Nf6 5.Nb5 (cdb best +23, 53.4%), 3...h6 4.Nb5, two builder lines at 0.005%.
    Rule fires, we don't: 2...Nc6 3.Bf4 Bf5 4.e4 (0.44%; Nb5 53.1/111k vs e4 61.0/3k), 2...Nc6 3.Bf4 e6
    4.e3 (then 4...Nf6 5.Nb5), 3...Bf5 4.e3 e6 5.Nf3 Nbd7 6.Ne5 / Nc6 6.Bd3 (Bf5 system plan),
    #372 (7.Nf3; Nb5 fits the rule: d7 58.7 vs 53.3, prep 60.4 vs 56.9).
  - Practical d7 running (blpivwg28, from 10:20; the first wait loop matched its own pgrep and was stopped). Nf6 warm-up: 63 of 270 done at 10:12: `pe/f3nb5.json` -> `pe/f3nb5_d7.json`/.log,
    cache_jobava, --analyse: F1, F2 (e3/f3), own#38 (Nf3/h4/f3), N1-N6 (Nb5 disagreements).
    Restart the Nf6 warm-up (task #9) when it is done.
  - cdbexplore 09:10: main run 9 done (27 explored, 7 changed, none puts a PGN move 0.30+ behind; the
    Qd3 decision at …9.Nxg6 fxg6 is 0.28 behind a3). Run 10 going (32 left). Lane B on e5.

- **10:25 UTC. Second Lichess token** (another account, so its own explorer bucket): kept in
  `.lichess_token2` in this scratchpad (mode 600; never print it, never put it in a repo). Owner: use it
  only if the main token looks used elsewhere (429s, or explorer throughput under ~16/min). At 10:23 the
  main token ran a steady 16/min with no 429s. For a second lane: copy the cache folder (own limiter.json)
  and run with `LICHESS_TOKEN=$(cat .lichess_token2)`. `LICHESS_TOKEN2` in the environment reaches only
  sessions started after the owner added it.
  F1 d7: 4.f3 58.0 vs 4.e3 55.8 (after 4.f3: e6 -> h4 60.6, Nf6 -> g4, Nd7/h6 -> e4). F2 d7: e3 53.5 vs
  f3 53.3 (keep e3). Rule: ...Bf5 before ...Nf6 -> f3/e4; ...Nf6 first -> e3 + Ne5/g4. Sent to the owner.

- **10:40 UTC. Owner: both tokens in parallel; finish the MAIN Jobava chapter first ("by far the most
  important"; make sure all ideas/plans/themes make sense) before the Nf6 chapter.** Lane A = main token
  (cache_jobava), lane B = `.lichess_token2` (cache_jobava_b; merge its explorer.jsonl into cache_jobava
  when done). Nf6 warm-up paused until the Jobava themes are settled.
  - Results: N1 (2...Nc6 3.Bf4 Bf5) keep 4.e4 71.9 vs Nb5 58.9 (the Bf5-before-Nf6 rule wins); N2
    (2...Nc6 3.Bf4 e6) keep 4.e3 54.7 vs Nb5 55.3 (4...Nf6 5.Nb5 follows); N3 (…3.Bf4 Bf5 4.e3 e6 5.Nf3
    Nbd7) SWITCH 6.Ne5 -> 6.Nb5 65.8 vs 58.4 (Nb5 rule); own#38 h4 59.8, f3 55.3, Nf3 53.9.
  - Theme map tools: `review/tree.py "<white-decision path>" <min reach>` (chapter skeleton, `jtree015.txt`),
    `review/neigh.mjs` (moves that differ from every near-identical position; `neigh.txt`, 141 flags,
    mostly natural), `review/classes.mjs` (class A: bishop inside + g4 storm; B: Bf5+Nf6 system; C: Bg6/h4).
  - Plans found: 3.Bf4 vs all but 2...Bf5 (3.f3); e3 default; P1 Bf5 before Nf6 -> f3/e4 (h4 vs e6/Bg6,
    g4 vs Nf6); P2 Nf6+Bf5 -> e3 Nf3 Ne5 g4, h4 vs Bg6, dxe5, Bd3 vs Bb4, Bd3 vs ...h6 before Ne5 (so #94
    -> 6.Bd3: d7 Bd3 56.0, h4 55.9, Ne5 54.8; #238 a6 version Bd3 59.2 vs 54.1); P3 bishop inside (...e6,
    Bc8) -> g4-g5; P4 ...Bd6 -> Qf3 & Qxf4 (T1 checks 2...e6 3.Bf4 Bd6: 4.e3 51.6% vs Qd2 53.8% explorer,
    since 4.e3 Bxf4 5.exf4 breaks it); P5 Nb5 rule; P6 ...Bb4 -> Bd3; P7 ...Bg4 -> f3 + h4 vs Bh5;
    P8 ...g6 -> h4; P9 Stonewall -> Nb5 (trade the d6 bishop). Exceptions with reasons: …Ne5 Nbd7 7.Be2
    (g4 loses a pawn, cdb -0.50), Bb4 lines.
  - Running: lane A `pe/theme1.json` (T1 2...e6 3.Bf4 Bd6: e3/Qd2/Bg3; T2 2...e6 3.Bf4 a6 4.e3 c5:
    Bd3/dxc5/Nf3) -> `pe/theme1_d7.json`; lane B N4-N6 -> `pe/f3nb5_d7b.json`.

- **10:55 UTC results.** N4 (…3.Bf4 Bf5 4.e3 e6 5.Nf3 Nc6) SWITCH 6.Bd3 -> 6.Nb5 57.4 vs 55.2 (Nb5 rule);
  N5 (3...h6) SWITCH 4.Nb5 -> 4.e3 57.4 vs 58.1 (-0.7; default e3, Na6 still available so no Nb5 signal);
  N6 Stonewall keep 5.Nb5 60.3 vs Nf3 58.7, Bd3 57.8 (cdb Nb5 +0.23). T1 (2...e6 3.Bf4 Bd6) tie e3 53.9 /
  Qd2 54.3 / Bg3 54.3: keep 4.e3 (default; 4...Nf6 transposes to the Qf3 line); exf4 structure plan =
  Nf3, Qd2, Rg1 + g4. T2 (2...e6 3.Bf4 a6 4.e3 c5) tie Nf3 52.1 / Bd3 51.4 / dxc5 50.9: keep 5.Bd3.
  - New idea: **...Bd6 before ...Nf6 -> Qg4** (g7 unguarded; after ...Nf6 -> Qf3). #338 Qg4 62.8 vs Qf3
    55.5. Running lane A `pe/theme3.json` (Q1 2...c6 3.Bf4 e6 4.e3 Bd6, Q2 2...Nc6 3.Bf4 e6 4.e3 Bd6,
    Q3 …4.e3 Bxf4 5.exf4 Qd6: Qd2/Qg4) -> `pe/theme3_d7.json`. Lane B `pe/theme2.json` (T3 …Bf5 4.e3 e6
    5.Nf3 h6 Bd3/Ne5; T4 3...a6 4.e3 Bf5 5.Nf3 Nc6 Ne5/Bd3) -> `pe/theme2_d7.json`.
  - Then: write the plan map for the owner (`jobava_plans.md` in the listed scratchpad), merge
    cache_jobava_b into cache_jobava, then decisions file + PC rebuild once the owner agrees.

- **11:05 UTC. Plan map SENT** (`jobava_plans.md` in the listed scratchpad): 10 cards (1 Bf4/e3 default;
  2 Bf5-before-Nf6 -> f3/e4; 3 Nf6+Bf5 -> Nf3 Ne5 g4 h4, dxe5, Bd3 vs ...h6-before-Ne5 and vs ...Bb4,
  Nb5-else-Ne5 vs ...Nc6; 4 bishop shut in -> g4-g5; 5 ...Bd6: Qg4 if Ng8 home, else Qf3, exf4 plan;
  6 Nb5; 7 Bb4 -> Bd3; 8 Bg4 -> f3 h4; 9 g6 -> h4; 10 Stonewall -> Nb5). 13 changes: 4.f3 (c6 Bf5),
  Qg4 x3 (Q1 64.3/62.8, Q2 59.1/57.1, #338), N3 6.Nb5, N4 6.Nb5, #372 7.Nb5, 3...h6 4.e3, #94 6.Bd3, #213
  7.h4, #147 7.dxe5, #172 5.Bd3, #327 8.O-O; plus h4 vs g6 (#56 #306 #336). Kept: listed in the file
  (T1, Q3 Qd2 58.0/57.9, T2, N1, N2, #127, N6, T3, #158, #255, T4 Ne5 64.7 vs 56.3).
  cache_jobava_b merged into cache_jobava (408 explorer + 909 ChessDB lines). Waiting on the owner.

- **11:45 UTC. repworks main pulled (2f53695): `pickLast` (`--pick-last`).** The search already picks my
  moves recursively, but (1) compares candidates one full move shallower than their value, (2) only on
  lines reached >= `compareReachMin` (10%) from the row, ChessDB's best below that, (3) the last move
  in a line was ChessDB's best (pickLast fixes 3). Measured at d7 on today's 16 review positions
  (`pe/f3nb5_pl_d7.json`, `pe/theme_pl_d7.json`): +169 explorer on 1,082 (+16%); 31 of 35 values within
  0.2, four 0.3-0.5, N3 6.Ne5 +1.8 (still 6.1 behind Nb5); no verdict changed. Use `--pick-last` in
  review runs from now on. Records now carry `switches` (all my-nodes, with path and gain).
  Note: answers to Black replies under 10% (e.g. 4.f3 Nd7 / h6 -> 5.e4) are ChessDB's best, not picks.
  Suggested to the owner: a `--compare-reach-min` flag (review runs at ~3%), measured the same way.

- **12:15 UTC. Pushed repworks 7139751 to main** (owner asked: "Add the flag and labels here"):
  `ReplyResult.pick` (`OwnPick`: switched/kept/only/rare/last), `practical.ts --compare-reach-min <pct>`
  (own settings key; default 10 leaves the key as before) and `--replies` (after a run or with
  `--report`). Tests in pickLast.test.ts and scripts/practical.test.ts; PLAN.md §5.211 notes; CLAUDE.md.
  npm run check + npm test (1,339) pass locally; CI run 553 green (check, 4 e2e shards, no flaky, deployed). Live: F1 at 3% + pick-last: f3 58.0, e3 55.8 -> 56.6.
  Review runs from now: `--pick-last --compare-reach-min 3 --replies`.

- **12:15 UTC. Owner accepted the cards** ("they make sense"). New question: 1.Nc3 d5 2.d4 e6 3.e4 (French)
  instead of 3.Bf4, to avoid 3...Bd6 4.e3 Bxf4 5.exf4 (doubled pawns)? Are 1...d5 2...e6 players French
  players? How does our anti-French compare with the Bxf4 line?
  - Same position as 1.Nc3 e6 2.d4 d5: reach 5.94% + 4.19% = about 10% of 1.Nc3 games.
  - Explorer (1600-2500): 3.Bf4 52.5%/2.36M, 3.e4 55.4%/1.23M (cdb +0.01). After 3.e4 (the French main
    position, 20.5M games, all orders): Nf6 36% (-> our 1.Nc3 Nf6 2.d4 e6 3.e4 d5 4.Bd3, 50 decisions),
    Bb4 26% (-> our 1.Nc3 e6 2.d4 Bb4 3.e4 d5 4.e5, only 3 decisions: a Winawer would need building),
    dxe4 22% (new), c5 8% (57.6%), c6 3%, Nc6 1%. The 2...e6 3.Bf4 subtree has 122 decisions.
  - Running: Practical d7 lane A `pe/french_a.json` (3.Bf4), lane B `pe/french_b.json` (3.e4),
    `--pick-last --compare-reach-min 3 --replies`. Dump: `dump/part.pgn.zst` (first 1.6 GB of 2026-10),
    `review/frenchdump.mjs <zst> <out.json>` (skips the dump's skippable frames). 60 MB test: target
    Black players' 1...e6 share vs 1.e4 31% (pooled) vs population 11%; French players (3+ games, half
    or more e6) 26% vs 12%.

- **12:40 UTC. French check done; owner: keep 3.Bf4** ("the choice to enter the French after 2...e6
  makes less sense" once Winawer/Rubinstein would need building). Practical d7 (pick-last, 3%):
  3.e4 56.9 vs 3.Bf4 55.1 (+1.8, under the 3-point bar). Dump (`dump/french.json`, 4.9M games, Black
  1600-2500, blitz/rapid/classical): Black players of Nc3+d4 vs d5+e6 (3,215) answer 1.e4 with 1...e6
  28% (pooled) vs 11% population; French players (3+ games, half or more e6) 28% vs 11%. White vs
  rating expectation: 3.Bf4 +2.6 (2,154 games), 3.e4 +3.5 (788): +0.9, inside the noise (about 2
  points). French position by our order +3.4 vs by 1.e4 +1.3; by our order vs French players +1.4
  (206), vs others +4.9 (393). Replies by our order: dxe4 44%, Nf6 23%, Bb4 10%, c6 9%, c5 7%.
  Offered 4.Qd2 against 3...Bd6 (keeps the queen recapture; tie at d7) or keep 4.e3 (recommended).

- **12:50 UTC. Owner: keep 3.Bf4 and 4.e3** (vs 3...Bd6). Questions 8.Rg1 in 1.Nc3 d5 2.d4 e6 3.Bf4 Bd6
  4.e3 Bxf4 5.exf4 Nf6 6.Nf3 O-O 7.Qd2 Nbd7 (maybe his own earlier choice); suggests h4-h5 first (8.h4 c5
  9.h5 h6 10.Rg1). Explorer: 7.Qd2 is rare (2.5%; Bd3 58%, Ne5 29%), cdb +0.06 best; after 7...Nbd7 (767
  games) cdb h4 +0.17 best, Ne5/Be2 +0.15, Bd3 +0.07, O-O-O 0; Rg1 not in the top. Running Practical d7:
  lane A `pe/exf4a.json` (X1 after 7...Nbd7: Rg1/h4/Ne5/Bd3; X3 …5...Qd6 6.Qd2 Nf6 7.Nf3 O-O, same) ->
  `pe/exf4a.json.out.json`; lane B `pe/exf4b.json` (X2 after 6...O-O: Qd2/h4/Bd3/Ne5).

- **13:45 UTC. exf4 structure (after 3...Bd6 4.e3 Bxf4 5.exf4): Rg1 vs h4** (owner: one approach if
  possible, and a reason to remember). Practical d7 (pick-last, 3%): X2 after 6...O-O: h4 58.4, Ne5 57.7,
  Qd2 57.6, Bd3 55.4 (keep 7.Qd2). After 7.Qd2: Nbd7 h4 59.6 / Rg1 59.0; b6 h4 59.4 / O-O-O 57.7 / Ne5
  56.1 / Rg1 52.9; a6 h4 57.6 / O-O-O 57.4 / Ne5 56.2 / Rg1 54.8; Nc6 O-O-O 61.3 / h4 60.7 / Ne5 58.9 /
  Rg1 57.5; c5 dxc5 60.6 / h4 54.6 / Rg1 52.2. 5...Qd6 6.Qd2 Nf6 7.Nf3: O-O Rg1 58.6 / h4 58.3 / Ne5 57.3;
  a6 O-O-O 60.6 / Ne5 57.8 / h4 56.6 / Rg1 55.6. Owner's line 8.h4 c5: h5 59.4 vs dxc5 56.7; 9...h6:
  O-O-O 59.8 = dxc5 60.2 (Rg1 no data); 10...Nc6: dxc5 65.4, Rh4 58.3, Nb5 57.1, Ne5 43.6 (cdb -0.66).
  Thin past 8...c5 (16, 3, 1 games): Maia and ChessDB. Stockfish 3 s on the owner's trap
  (`sf/lineeval.mjs "<line>" <startPly> <ms>`): equal to 16...Qxa4; 15.Na4 only move (others -3.9);
  17.Rd4 0.15 vs 17.Rh4 0.89; 17...Qxa2 first error (+1.75, Qa5 +0.12); 19...Qxb2 loses (#11; Qa5+ +2.5).
  Proposed card: Nf3, Qd2; Black castled -> h4-h5, castle long after ...h6; king in the centre -> O-O-O
  first; ...c5 before h4 -> dxc5, after h4 -> h5 and take later; no Rg1 at move 8 (both Rg1s -> 8.h4).

- **14:00 UTC. Owner: the trap line is a plan note only (comment + arrow + clickable), not drilled.**
  Asked about 5...Qd6 6.Nb5 (instead of his 6.Qd2). Explorer: 6.Nb5 57 games; replies Qxf4 44% (cdb
  -4.12: 7.Ne2 Qe4 8.Nxc7+), Qb4+ 33% (7.c3 +0.34), Qb6 9%, Qd8 5%, Qe7 5% (cdb best, +0.15). Stockfish
  6 s: Qd2 +0.31, Qg4 +0.24, Nb5 +0.20. Practical d7 (`pe/nb5q.out.json`): Nb5 66.7 (prep 74.2), Qd2
  57.9, Qg4 58.1; answers Qxf4 Ne2 (90.0), Qb4+ c3 (60.6), Qb6 a4, Qe7 c3, Qd8 Qg4. Without any
  ...Qxf4 the rest average about 58.2, so 6.Nb5 is at worst equal. Proposed: switch to 6.Nb5 and
  widen card 6 to "Nb5 when it hits something on c7 or d6", which absorbs card 10 (Stonewall).

- **14:30 UTC. Owner: "write the decisions file and start the rebuild"**; keep 3.Bf4 and 4.e3; the trap
  line is a plan note only. Owner's 6.Nb5 lines checked with Stockfish 5 s (`sf/nb5lines.txt`): 7.c3
  only move vs ...Qb4+ (Qd2 -0.4); 7...Qxb2 8.Rb1 +4.8; Qe7/Qa5/Qb6 lines all within ~0.1 of best;
  6...Qxf4 7.Ne2 only move, then every queen move loses to Nxc7+ (+4); suggested 6...Qe7 7.c3 (0.21)
  and 6...Qd8 7.Qg4 (Prac pick; SF 7.Nf3 0.34, Qg4 0.27). Files in the listed scratchpad:
  `nc3_jobava_rev1.decisions.json` (26 pins, all legal), `nc3_jobava_rev1_owner.pgn` (6.Nb5 tree, 8.h4);
  message `pc_msg_rev1.txt` SENT to the PC session (session_01XshYbDbjsAeNPWV5synGn2, was idle,
  connected): merge with the `_f` decisions, owner input copy with the replaced lines, rebuild the 4
  Jobava chapters, log round 2 + the 9 cards in NC3_DECISIONS.md, print the chapters, list missed pins.
  The owner's trap note sat in the 6.Qd2 line, which 6.Nb5 replaces: it drops out (told the owner).

- **15:20 UTC. PC rebuild round 2 DONE** (session_01XshYbDbjsAeNPWV5synGn2, 15:02): all 30 pins applied (26
  new + 4 from `_rd2`), no pinMissing; files on the PC: `nc3_jobava_rev1.decisions.json`,
  `nc3_jobava_rev1_owner.pgn`, `nc3_jobava_rev1_base.pgn` (owner copy: 6.Qd2 line, 8.Rg1 and the
  2...c6 3.Bf4 Bf5 4.e3 subtree removed), `nc3_jobava_rev1b.decisions.json` (+ `cover` for 7...b6/a6/Nc6/c5
  after 7.Qd2, since at owner positions the builder follows only the owner's replies), builds
  `<chapter>_rev1` (14 gap chapters) and `nc3_jobava_rev1b`; export `nc3_jobava_rev1_chapters.pgn`
  (4 chapters, joins format) PRINTED in its event stream via sed, lines 1-392 after "===": collect
  with list_events (kinds user+assistant, limit 100, saved to a file) + `collect2.py <outdir> <file>`.
  Logged "Jobava review round 2" + the 9 cards in NC3_DECISIONS.md. Nothing committed.
  - It ALSO CUT two owner lines so the Qg4 pins apply (owner moves beat pins): 5.Qf3 after 2...c6 3.Bf4
    e6 4.e3 Bd6 (5 moves) and 5.Qf3 after 2...Nc6 3.Bf4 e6 4.e3 Bd6 (29 moves, INCLUDING the owner's
    7.Nb5 trap line). Raw owner file unchanged. -> ASK the owner: keep 5.Qg4 there or restore his 5.Qf3
    trap line (Prac Q2: Qg4 59.1 vs Qf3 57.1, without his trap specifics).
  - Two builder changes to check against the cards: 1.Nc3 d5 2.d4 Nf6 3.Bf4 e6 4.e3 Bd6 5.Qf3 Nc6 6.Be2
    (was 6.O-O-O); 2...e6 3.Bf4 Bd6 4.e3 Bxf4 5.exf4 Ne7 6.h4 (was 6.Nf3; card 5 says Nf3/Qd2, and
    O-O-O while Black's king is in the centre).
  - Counts: Jobava simplified 720 White positions (was 736), 342 decisions; ...g6 setups 19; 2...c5 32;
    rare replies 35. Scores: 61.8% in sample (everyone 52.3%), holdout 60.6% +-0.4 (before 61.6/60.3).
    228 Jobava moves under 50 games, all the owner's.
- **Owner (15:15): 6.Nb5 Qe7 and 6.Nb5 Qd8 are NOT drillable**: show them as a plan comment at the
  branching point (after 6.Nb5), with an explanation; drop my suggested drill moves 7.c3 / 7.Qg4.
  His plan lines, checked with Stockfish 4 s (`sf/nb5plans.txt`), both hold (White +0.1 to +0.8, his
  moves best or within 0.1): (6...Qe7 7.Nf3 a6 8.Nc3 Nf6 9.Qd2 O-O 10.h4) and (6...Qd8 7.Nf3 c6 8.Nc3
  Nf6 9.Qd2 O-O 10.h4). 8.Nc3 is the only good square when the knight is kicked or done (Na3 -1.5,
  a4 -3). Comment text idea: "Not drilled. Against ...Qe7/...Qd8 the threat is gone: Nf3, knight back
  to c3, Qd2, O-O-O or h4-h5 as in the exf4 plan" + the two clickable lines.
- **Next:** 1) collect the rebuilt PGN; 2) apply the Qe7/Qd8 comment change (in the study assembly or
  via the PC); 3) ask about the 5.Qf3 trap line; 4) check the two builder changes and the whole chapter
  against the cards (`review/alldec.mjs` on the new study, `neigh.mjs`, `classes.mjs`); 5) assemble
  `nc3_study_v5.pgn` (regroup4 / fixnotes / whitealts / dups / ownercheck / planlines) and send it;
  6) line-end extensions (item 6), items 7-9; 7) then the 1...Nf6 2.d4 chapter (warm-up 63/270 done,
  rename chessdb.jsonl before the real review). Review Practical runs: `--pick-last --compare-reach-min 3
  --replies`, both tokens (`.lichess_token2`; LICHESS_TOKEN2 also in the env now).

- **16:30 UTC. Owner: keep 5.Qg4 after 2...Nc6 3.Bf4 e6 4.e3 Bd6;** vs 5...Nf6 NO 6.Qxg7 (his line 6.Qxg7 Rg8
  7.Qh6 Rg6 8.Qh4 Rg4 9.Qh3 is unpleasant for a human), "sidestep with 6.Qh4, let cdbexplore settle these
  lines", and make sure 5...Nf6 is covered.
  - Rebuilt PGN collected: `exports/nc3_jobava_rev1_chapters.pgn` (4 chapters, 720 W positions).
  - After 5.Qg4 Nf6, Stockfish 30 s (`sf/qg4nf6.txt`) / Practical d7 (`pe/qg4nf6a.out`, `qg4nf6b.out`):
    Nc6 line Qh4 -0.26/53.2, Qf3 -0.18/55.0, Qxg7 -0.50/66.0; c6 line Qh4 -0.53/44.5, Qf3 +0.15/57.0, Qxg7
    +0.98/68.7; a6 line Qh4 -0.26/48.3, Qf3 -0.38/52.0, Qxg7 +1.06/64.5. ChessDB: Nc6 Qh4 -0.07, Qf3 -0.23,
    Qxg7 -0.19; c6 Qxg7 +1.01; a6 Qxg7 +1.13. Reason (`sf/qxg7lines.txt`): with the knight on c6 the dance
    ends in ...Nxd4 (-0.3/-0.5); without it +1.2/+1.7. Queen moves Qh6/Qh4/Qh3 are only moves everywhere.
  - Same split after 5...Bxf4: Nc6 line ChessDB Qxf4 +0.18 (Qxg7 0); c6/a6 lines Qxg7 (+1.47/+1.28).
  - Proposed card 5 addition: Qg4 wins g7 unless Black's knight is on c6. Knight on c6: ...g6/...Nf6 ->
    Qf3, ...Bxf4 -> Qxf4. No knight on c6: ...Bxf4/...Nf6 -> Qxg7 (Rg8 Qh6, Rg6 Qh4, Rg4 Qh3). ASKED.
  - Coverage of 5.Qg4 in the rebuild is thin (builder index, not explorer): Nc6 line only g6/Qf6 (missing
    Bxf4 251 g, Nf6 56 g); c6 line g6/Bxf4 (missing Bf8 123, Nf6 103, Kf8 65); a6 line only Bxf4 (missing
    g6 252, Qf6 121; Nf6 36 <50 but owner wants it). White answers (ChessDB): Nc6 Bxf4 -> Qxf4; c6 Bf8/Kf8
    -> Qg3 (Qf3 +0.33/+0.83); a6 g6 -> Qf3 (Qg3 ~ Qe2 ~ Qf3), a6 Qf6 -> Nxd5 (+3.90; Bxd6 +1.80).
  - cdbexplore: lane C `qg4/qg4.pgn` (msg `cdb_msg_qg4.txt`, sent 16:25) with the 9 positions after
    5...Nf6 6.Qh4/Qf3/Qxg7 to report. Main run 13 was running.
  - **Owner's trap is still reachable** by 1.Nc3 d5 2.d4 Nf6 3.Bf4 e6 4.e3 Bd6 5.Qf3 Bxf4 6.Qxf4 Nc6 7.Nb5
    (same position; 4,438 games; 7...e5 16.9%, White 66.5%, NOT in the rebuilt tree) and 5.Qf3 Nc6 6.O-O-O
    (his move; builder now 6.Be2; ChessDB O-O-O +0.04 best, Be2 -0.04). Draft `nc3_jobava_rev1c_owner.pgn`
    in the listed scratchpad: 6.Nb5 comment with the two plan lines (no 7.c3/7.Qg4), the 8.h4 line, and his
    5.Qf3 lines grafted on the 2...Nf6 order (comments from his upload). legal.mjs 0 illegal; planlines 6/6.
    Covers to add there: 7...Kd7 (12%, 534 g), 7...a6 (7.6%, 338 g), 8...Nd7 (28%, 208 g).
  - The c6-line owner 5.Qf3 was only a transposition note (5...Bxf4 6.Qxf4 Nf6 7.g4): still covered.
  - **Coverage finding** (`review/missing2.mjs`, `review/ownsplit.mjs`): Jobava rev1 has 806 Black replies
    at 2%+ and 50+ explorer games with no White move anywhere in the study (by position), ~6% of 1.Nc3 games
    summed: 429 at the owner's positions (builder follows only his replies; 3.75%), 377 in built lines
    (2.6%); 208 reached 1 in 10,000+ (124 + 84). Same in v4 (old behaviour: the builder's own 126-dump
    index and reply threshold). Told the owner; options: cover the 208 now, or all, before line ends.
  - **Next:** owner answers (Qf3/Qh4; Qxg7 in c6/a6; trap graft; coverage) -> round 3 to the PC:
    owner file rev1c, decisions rev1c (pins 5...Nf6 answers, 5...Bxf4 Qxf4 in Nc6 line, covers for 5.Qg4
    replies and the trap node, and any coverage list), rebuild, collect, check cards, then v5 assembly.

- **17:20 UTC. Owner: "Do what you think is best. The queen walk is not a problem in the others."** Decided:
  2...Nc6 line 5...Nf6 6.Qf3 (not his 6.Qh4); 5...Bxf4 6.Qxf4. 2...c6 and 3...a6 lines: 5...Nf6 6.Qxg7 with
  the walk 6...Rg8 7.Qh6 Rg6 (7...Bxf4 8.Qxf4; 7...Bf8 8.Qh4, only move) 8.Qh4 Rg4 (8...Be7 9.Bd3; 8...Bxf4
  9.Qxf4) 9.Qh3 Bxf4 10.exf4 (only move; +1.2/+1.75). a6 5...g6 6.Qf3; a6 5...Qf6 6.Bxd6 (system move;
  6.Nxd5 +3.9 is outside the cards). Trap graft: yes. Coverage: the 208 replies (1 in 10,000+) now.
  - Files in the listed scratchpad: `nc3_jobava_rev1c_owner.pgn` (3 games), `nc3_jobava_rev1c_decided.pgn`
    (3 games: Nc6-line 6.Qf3 with a comment on 5...Nf6 showing 6.Qxg7...9...Nxd4; the two walks), and
    `nc3_jobava_rev1c.new.json` (6 pins, cover map: 129 positions, 219 replies; `review/chkdec.mjs` 0 bad).
    Message `pc_msg_rev1c.txt` SENT 17:20 to the PC (idle, connected): owner copy rev1c_base = rev1_base +
    these (decided lines exempt from the 50-game rule, check no owner position loses a reply), decisions
    rev1c = rev1b + pins + covers, build `nc3_jobava_rev1c`, export/print `nc3_jobava_rev1c_chapters.pgn`,
    log round 3, report + explain the builder's reply selection.
  - Owner's original file: at the graft positions it has 5.Qf3 -> Bxf4,O-O; 6.Qxf4 -> O-O; the builder
    covers more than the owner's replies there (so "only the owner's replies" is not general).
  - cdbexplore lane C (`qg4/qg4.pgn`) running/queued since 16:25; its 9-position report confirms or
    revises 6.Qf3 vs 6.Qh4 (Nc6 line) after the fact.
  - **Next:** collect the rev1c print (collect2.py, folder exports/rev1c), rerun `review/missing2.mjs` and
    the card checks (alldec/neigh/classes), the builder's two changes from rev1 (6.Be2 now 6.O-O-O by the
    graft; 5...Ne7 6.h4 vs card 5's Nf3/Qd2 - still to check), then v5 assembly (add the decided-file
    comments if the export lacks them) and send; then line ends (item 6).

  - 17:30: 7th pin sent to the PC (priority next): 2...e6 3.Bf4 Bd6 4.e3 Bxf4 5.exf4 Ne7 -> 6.Nf3 (card 5 exf4
    plan: Nf3/Qd2 first, h4 only once Black has castled; ChessDB all 0.00; reach 0.049%). Both rev1 builder
    changes now settled (6.Be2 -> the owner's 6.O-O-O through the graft).
  - 17:45: owner asked to confirm 6.Nxd5 (+3.9) vs 6.Bxd6 (+1.8) after 3...a6 4.e3 Bd6 5.Qg4 Qf6. Confirmed (SF d28,
    `sf/qf6.txt`, `sf/pv.mjs`): 6.Nxd5 exd5? 7.Qxc8+ (c8 loose: queen off d8, Nb8 blocks Ra8); best 6...Qg6 7.Qxg6
    hxg6 8.Nxc7+ Bxc7 9.Bxc7 (two pawns + bishop pair). But 60/60 players answer 6.Bxd6 with 6...cxd6, then
    7.Nxd5! is the same trick (+4.32; explorer 1,578 games, Nxd5 45%, White 86.5%); 6.Bxd6's +1.8 needs
    6...Nh6. In the Nc6 line Nxd5 is -4.4 (Ra8 guards c8). Kept 6.Bxd6 (system move); 2nd addendum to the PC:
    pin 7.Nxd5 after 6...cxd6, cover 7...exd5/Qd8/Qg6, decided game 4 with the trick comment.
- **18:25 UTC. PC round 3 DONE (18:01).** Export collected: `exports/nc3_jobava_rev1c_chapters.pgn` (473 lines;
  collect2.py -> exports/rev1c). PC inputs: `nc3_jobava_rev1c2_base.pgn`, `nc3_jobava_rev1c2.decisions.json`
  (the first-round rev1c inputs were already written when the addenda came), chapter `nc3_jobava_rev1c`.
  All 38 Jobava pins applied; 224/226 covers followed (not: 4...Qb6 5.a3 Bf5, since the builder now plays
  5.Na4; 7.g5 Nfd7, the owner's 2nd move at …5.g4 Bd6 6.Qf3 Qc7). Counts: Jobava 720 -> 941 W positions,
  342 -> 516 decisions; ...g6 setups 19 -> 33; 2...c5 32 -> 40; rare 35 -> 51. Holdout Jobava 60.6 -> 61.1.
  - **Builder reply rule (PC):** own index lichess_126 (1600+, b/r/c, 40 plies); a reply is followed at
    2%+, 50+ games and reach x share >= 0.05% (1 in 2,000; 0.01% on sharp lines); owner replies and covers
    always. Our cover rule (1 in 10,000) is 5x lower -> the +51% decisions. Tell the owner.
  - Lost replies (PC): 8...Qxc7 after the trap's 7...O-O 8.Qxc7 (line ends at 8.Qxc7 now); 7...Bg4 after
    …4.e3 g6 5.h4 Bg7 6.Bd3 h5 7.Nf3. Cover both next round, and 7.g5 Nfd7 (61%, 209 games).
  - Checked: all moves legal; `review/missing2.mjs` rev1c: only 7.g5 Nfd7 left at 1 in 10,000+ (582 below,
    2.04% total). New branches as decided (5.Qg4 x3 with the walk; trap; 6.O-O-O; 5...Ne7 6.Nf3; 6.Nb5
    without Qe7/Qd8 drills; comments present incl. "Not drilled", "6.Qxg7 is tempting", "c8 bishop is loose").
  - Builder's own changes: 6.Nf3 vs ...h5 (c6 g6 h4 line, as the owner's accepted 6.Nf3), 7.Nf3 vs …Bd3 Nbd7
    (cdb best), 7.h4 / 7.h5 vs Bg6 (card 2), 7.Bb5 vs …Nf3 Nc6 in 2...Bf5 3.f3 e6 (58.0%, cdb +0.81; Qe2
    +1.10) - all accepted; **4...Qb6 5.Na4 (was 5.a3)**: explorer a3 61.5% / Na4 53.2% / Rb1 50.5%, cdb
    Rb1 +0.09, Na4 +0.08, a3 0.00 -> Practical d7 running (`pe/qb6.json` -> `pe/qb6.out`, bbgflxz71).
    Our other ...Qb6 answers: Nb5 (after ...c5, card 6), a4 (Nb5 already in).
  - **Next:** decide 4...Qb6; round 4 small (covers 8...Qxc7, 7...Bg4, 7...Nfd7, any Qb6 pin) can wait for
    the line-end step; assemble `nc3_study_v5.pgn` from rev1c (regroup4/fixnotes/whitealts/dups/ownercheck/
    planlines) and send; report size/threshold to the owner.
- **18:50 UTC. Study v5 SENT** (`nc3_study_v5.pgn`, listed scratchpad): v4 with the four Jobava chapters from rev1c
  (`exports/nc3_jobava_rev1c_chapters.pgn`; collect2 parts MUST be joined with "\n" - the first join lost
  spaces in comments), then fixnotes (96 notes, 0 fixed). Checks: 2016 W positions (v4 1791), 2 two-move
  positions (the owner's own, as v4), 0 illegal, 0 duplicate nodes, owner comments 172/172, owner moves
  missing 63 = the planned removals (23 c6 Bf5 4.e3, 29+5 Qf3 lines, 5 6.Qd2, 1 8.Rg1), planlines 91/91.
  - 4...Qb6: Practical d7 a3 60.9, Na4 58.8, Rb1 58.3 (`pe/qb6.out`); kept the builder's 5.Na4 (one main
    reply, ...Qa5+ 81%; a3 +2.1 is under the bar; a3's extra is the ...Qxb2? Na4 trap).
  - cdbexplore lane C (18:05): Nc6 line 6.Qh4 -0.24 / Qf3 -0.22 / Qxg7 -0.19 (equal; keep Qf3); c6 line
    Qxg7 +1.01, Qf3 0.00, Qh4 -0.19; a6 line Qxg7 +1.13, Qh4 -0.11, Qf3 -0.23. Run 2 for 3 positions left.
  - Next round (with line ends): covers 8...Qxc7 (trap 7...O-O 8.Qxc7), 7...Bg4 (…5.h4 Bg7 6.Bd3 h5 7.Nf3),
    7...Nfd7 after the owner's 7.g5. Then item 6 (line-end extensions), 7-9, then the 1...Nf6 2.d4 chapter.
- **19:05 UTC. Owner asked: below 50 games is Prepared still meaningful; swap the builder to the Lichess explorer there?**
  Measured: builder index lichess_126 = 126 of 165 months, MISSING 2021-07..2024-09 (39 busiest months); its counts
  are ~0.57x the explorer's (9 of 10 matched positions 0.53-0.58, one 0.71; old build json vs review/cache.json).
  So 49 index games ~ 85 explorer games. `review/leafgain.mjs` on rev1c main chapter: 420 line ends, 205 cached;
  124 already have a Black reply with 88+ explorer games (they end on the reach threshold 0.05%, not data), 58
  have a reply at 50-87 (would extend with explorer counts). Answered: Prepared below 50 is mostly prior/ChessDB
  lean (weak, not useless); explorer swap in the builder = slow (16/min/token, many thin positions per build) for
  a ~1.75x gain; use the explorer at line ends in step 6; best fix = index 2021-07..2024-07 on the PC (keep
  2024-08/09 out: holdout months), ~1 TB of dumps - ask the PC for disk/time if the owner wants it.
- **19:30 UTC. Owner: index gap months being downloaded on the PC (slow); the current index will do for now.
  Asked: is the Jobava chapter done, what's left?** Answer sent with a /compact text. Findings for it:
  - `review/neigh2.mjs alldec_v5.json neigh_v5.json` (neigh.mjs with in/out args; alldec_v5.json from v5):
    186 Jobava decisions break all near-identical neighbours; 54 of them among the 267 new Jobava decisions
    (from the covers). Examples needing the system test: 2...e6 3.Bf4 Bd6 4.e3 Ne7 5.h4 (card 5 says Qf3/Qg4
    family), 2...e6 3.Bf4 c5 4.e3 Bd6 5.Bxd6, 2...Nc6 3.Bf4 Bf5 4.e4 dxe4 5.d5 e5 6.dxc6, 2...c6 3.Bf4 Nd7 4.e4
    e6 5.Nf3, …5.Nf3 Bb4 6.Bd3 Bg6 7.h4, 2...Bf5 3.f3 e6 4.e4 dxe4 5.fxe4 Bg4 6.Qxg4, 2...e6 3.Bf4 Bb4 4.e3 c5
    5.Ne2. Some are our own pins (5.Qg4 Bxf4 6.Qxf4).
  - Line ends (v5 main chapter): 420 (`review/leafgain.mjs`).
  - cdbexplore lane B queued 19:30 with `v5/jobava.pgn` (= `jobava_v5_explore.pgn`, sharepgn of v5 main
    chapter) then `v5rest/rest.pgn` (= `jobava_rest_v5_explore.pgn`, the other three); records copied so only
    new positions are explored. Lane A: main run 14 then pirc then f5; lane C: qg4 run 2 (3 positions).
  - Plan proposed to the owner (Jobava NOT done): (1) system-test pass on the 267 new decisions (54 flags)
    with Practical d7 where needed, after cdbexplore lane B; (2) the 3 missing replies + the 2 owner
    two-move positions (…g4 Bg6: Nxg6/h4; …6.Qf3 Qc7: Bxd6/g5) - one move each, the other as a clickable;
    (3) line ends by the binding extension rule (explorer at the ends); (4) round 4 on the PC with all of it;
    (5) idea deck (opening-ideas skill) from the final chapter, replacing the outdated jobava_plans.md
    (it still says Rg1, Stonewall card, no knight-on-c6 rule); then freeze and start 1...Nf6 2.d4.
- **22:35-22:55 UTC. Owner: "Start working on what's left on the jobava chapter."** Steps 1-2 done, round 4a SENT.
  - Step 1 (system test): "new" = v5 Jobava decisions not in rev1 (267). `review/neigh3.mjs` (neigh2 over all four
    Jobava chapters) -> `review/neigh_v5all.json` (234 flags); 71 among the new (`review/neigh_v5new.json`; 54 main,
    17 others). All under 0.1% reach (max 0.047%), so no Practical exception: card/natural or system move.
    `review/flagcands.mjs` -> `sf/flags71.json`; Stockfish 8 s x4 -> `sf/flags71.txt`; extra passes `sf/step2.txt`,
    `sf/pass3.txt`. Result: 50 keep, 21 switch (pins with reasons in `nc3_jobava_rev1d.new.json`, listed scratchpad;
    builder script `review/mkdec4.py`). Card 7 refined: "...Bb4: Bd3, then castle; if Black adds a 2nd attacker on c3
    (...Ne4, ...Qa5, ...c5 hitting d4), Ne2 first" (#13 #23 #26 #44, SF +0.5 to +1.6 over Bd3/Nf3). Kept tactics:
    7.Qxg4 (5...Bg4??), 6.dxc6, exf5, exf6 x2, axb4, Nxd5 pawn, Nxc7+ (card 6), 9.e5 vs pinned Nf6 (#40; also the
    ...Nf6 -> e5 system move in 2...Bf5 3.f3 e6), 7.Bxe5 (#61). Switched 7.d5 -> 7.Bb5+ (#9, +2.25 vs +1.90).
  - Step 2: covers 7...Bg4 -> 8.Qd2 (as …3.Bf4 g6 4.e3 Bg7 5.h4 h5 6.Nf3 Bg4 7.Qd2; SF +0.49) and the trap
    8...Qxc7 9.Nxc7 Rb8 (SF +1.49). Two-move positions: keep the owner's mains 11.Nxg6 (SF +0.09 vs h4 -0.09) and
    7.Bxd6 (+0.72 vs g5 +0.77; Bxd6 also in the 4.f3 line vs ...Bd6/...Qc7); the others become comment clickables
    (`chk_two.pgn` = `nc3_jobava_rev1d_twomove.pgn` in the PC message; planlines 4/4). 7...Nfd7 cover dropped.
  - Round 4a message `pc_msg_rev1d.txt` (listed scratchpad) SENT 22:50 to the PC (idle, connected): owner copy
    `nc3_jobava_rev1d_base.pgn` (rev1c2_base + the two comment edits), decisions rev1d = rev1c2 + 23 pins + 3 covers,
    build `nc3_jobava_rev1d`, export/print `nc3_jobava_rev1d_chapters.pgn`, log round 4a. Round 4b = line-end
    extensions (single variations, --coverage 0) on top of rev1d.
  - Step 3 started: chain b9h87zp93 = review.mjs on the 4 v5 Jobava chapters -> `ends5/rv_*.json`, then
    `review/ends.mjs ends5/ends_v5.json ...` (cache backup `review/cache.bak_2235.json`; don't run node.mjs meanwhile).
    Then endsreport.mjs; extend only the few sharp, well-reached ends (as section 8 of the morning report), rest stop.
  - Step 5 prep: opening-ideas skill read. Jobava deck size raised by the owner (2026-11-21): about 30 cards, 12
    rules, from 0.5% reach (`check --max-cards`, `--rare`). Tools `scripts/ideas/cv.ts` (run from repworks) with
    STOCKFISH=/usr/games/stockfish STOCKFISH_THREADS=3 IDEAS_CACHE=<scratchpad>/deck/cache. Preview on v5 running
    (bntx1h2lz): `deck/jobava_v5.pgn` (the 4 Jobava chapters) -> deck/tree.txt, develop.txt, profile.txt,
    decisions.txt (--min 0.5 --top 60). Rerun on the final chapter after 4b (cache reused). Never commit a deck.
    Preview done 23:2x: reach shows 176% for 2...Nf6 = the 4 chapters each counted from 100% (all start 1.Nc3 d5 2.d4);
    for the real run merge the 4 Jobava chapters into ONE game first (or check tree on the main chapter alone).
  - cdbexplore lane B: v5/jobava.pgn run 1 started 22:19 (1.9 h), then v5rest; lanes A and C idle.

- **23:10-23:45 UTC. Round 4a DONE on the PC (23:07); v6 assembled; round 4b SENT.**
  - PC report: 23 pins as pinned, 227/229 covers (not: 5.a3 Bf5 = learning tie-break, left; 7.g5 Nfd7 = gone);
    Jobava 941 -> 939 W positions, 516 decisions, holdout 61.06 -> 61.13; 2...Bg4 rare 67.9 -> 71.8. Builder's own
    tie-break changes, accepted: 7.a3 vs ...Ne4 (4...a6 5.g4 Bb4 6.Ne2), 8.Qd2 vs ...h5/...O-O (4...g6 5.h4 Bg7 6.Bd3
    Nbd7 7.Nf3). Events saved `ev_rev1d.txt`; parts `exports/rev1d/...` (each part starts with a "=== ..." line:
    strip it, then join with "\n") -> `exports/nc3_jobava_rev1d_chapters.pgn` (483 lines).
  - **`nc3_study_v6.pgn` (listed scratchpad)** = v5 with the 4 rev1d chapters (`nc3_study_v6_raw.pgn` -> fixnotes, 96 notes
    same). Checks: 2014 W positions, 0 two-move positions, 0 illegal, 0 duplicates, planlines 92/92, owner moves
    missing 70 = v5's 63 planned + 7 in the two removed variations (now comments), owner comments 0 missing,
    `review/pincheck.mjs` 26/26 (23 pins + 3 covers). neigh on v6 (`review/alldec_v6.json`, `review/neigh_v6all.json`):
    216 flags (v5 234), 11 newly flagged, all checked (card 2/5 moves in the 4.f3 lines, owner's 9.Bb5+, captures;
    SF `sf/pass4.txt`: 7.Bxd6 +1.74 kept vs ...Nbd7; vs ...Nc6 the capture is Nxd6+ +0.03, Bxd6 -0.28).
  - Step 3: survey `ends5/ends_v5.json` (480 ends, 10.7% of 1.Nc3 games; 53 at 0.05%+, 63 at 0.03-0.05%), report
    `review/endsreport5.mjs ends5/ends_v5.json ends5/switched_4a.json` -> `ends5/report.txt` (135 sharp, 191 shallow,
    95 thin). Most ends stop on the builder's reach cut (0.05% on its index), not on data. Chosen: 22 extensions
    (`nc3_jobava_rev1e_ends.pgn`, listed scratchpad; `ends5/mk4b.py`; SF `ends5/sf_sharp.txt`, `sf/pass4.txt`):
    11 sharp (S1/S2 9.Nc7+ fork after 8.Qxd5 Qxd5; S3 8.Bxe5 fxe5 9.Bb5+ Kf7 10.Nf3; S4 9.Bxh5 ... 11.Ne2; S4b 9.Bxh5;
    S5 6.Nge2; S6 9.Bb5+ Bc6 10.Bxc6#; S7 7.cxb7 Rb8 8.Bb5+; S8 owner's 9.Rb1 b6 10.Bxf5 exf5 11.Qd3; S9 10.b4;
    S10 9.Qxd5) + 11 card-move pairs (C1/C2 h4 vs Bg6, C3 h4 vs Bh5, C4 dxe5, C5 Nxd6+, C6 h5, C7a/b cxd3, C8 Bd3,
    C9 c3, C10 dxe5). Every extension stops while the explorer has 50+ games before our move (past 50 = owner's).
    About +35 W moves. NOT extended (option for the owner): quiet ends with a main reply of 88+ explorer games:
    26 more at 0.05%+, 36 at 0.03-0.05% (one builder variation each, ~+80 / ~+190 W moves).
  - Round 4b message `pc_msg_rev1e.txt` SENT 23:45: base rev1e = rev1d_base + 22 decided lines, decisions unchanged,
    build `nc3_jobava_rev1e`, export/print `nc3_jobava_rev1e_chapters.pgn`, log round 4b.
  - Next: collect rev1e -> v7 (same checks + `ends5/leafchk.mjs`-style presence check of the 22 lines), send v7; then
    step 5 idea deck from v7 (merge the 4 Jobava chapters into one game for cv.ts tree/decisions; ~30 cards, 12 rules,
    0.5% reach; replace jobava_plans.md); then freeze and start 1...Nf6 2.d4.

- **00:05 UTC (11-26). Round 4b DONE on the PC (23:55); v7 SENT.** All 22 extensions in full; builder changed no White
  move. 18 in Jobava simplified, S5/S6 in 2...c5, C9 in ...g6 setups, C10 in rare replies (own small owner files:
  `nc3_d5_c5_rev1e_base.pgn`, `nc3_d5_nf6_g6_rev1e_base.pgn`, `nc3_d5_more_nf6nbd7_rev1e_base.pgn`). The builder added
  7...Nd7 8.Qxd5 below C4; the PC cut it from the export via `nc3_jobava_rev1e_trim.pgn` (build file keeps it) and
  **deleted and rewrote its own first export under the same name** (breaks "overwrite nothing, delete nothing";
  its own minutes-old file; tell the owner, remind the PC next round). Counts: Jobava 939 -> 967 W positions,
  holdout 61.13 -> 61.23; 2...c5 40 -> 43, holdout 63.3 -> 64.2. Four main lines reordered by the build: restored to
  v6's order with `reorder.mjs <ref> <in> <out>` (9 nodes).
  - **`nc3_study_v7.pgn` (listed scratchpad, SENT)** = v6 with the rev1e chapters (`exports/nc3_jobava_rev1e_chapters.pgn`,
    489 lines) -> reorder -> fixnotes. Checks: 2047 W positions, 0 two-move, 0 illegal, 0 dups, planlines 92/92, owner
    missing 70 (same as v6), comments 0 missing, pincheck 26/26, `ends5/leafchk.mjs` 22/22 in study, `cmpch.mjs v6 v7`:
    nothing removed, no comment changed, +66 nodes in the Jobava chapters only.
  - Next: step 5 idea deck from v7 (task #20): `deck/merge.mjs <study> <out> Jobava` -> one game; cv.ts tree/develop/
    profile/decisions; ~30 cards, 12 rules, 0.5% reach; replaces jobava_plans.md. Then freeze, start 1...Nf6 2.d4.

- **00:20 UTC. Round 4c SENT (one pin):** deck prep found 2...Nf6 3.Bf4 e6 4.e3 c5 5.Nb5 Qa5+ 6.b4 (builder, since v4;
  reach 0.097%) = the only b4 vs ...Qa5+ with Nb5; owner's own move in the same structure is c3 (2...e6 3.Bf4 c5 4.e3
  cxd4 5.exd4 Nc6 6.Nb5 Qa5+ 7.c3), 4 neighbours c3, and 4a pinned c3 in the exd4 Bf5 line. SF 20 s b4 +1.30 / c3
  +1.12; explorer b4 66.5% (1,188) / c3 62.5% (26,241); after 6.b4 cxb4 7.Nc7+ Kd7 only 8.Bd3 (Maia Nxa8 83%).
  -> pin 6.c3 (`nc3_jobava_rev1f.new.json`, listed scratchpad). Reminded the PC: no delete/rewrite under the same name.
  Build `nc3_jobava_rev1f`, export `nc3_jobava_rev1f_chapters.pgn`. Then v8 (same checks) = the final Jobava chapter
  for the deck.
  - Deck: v7 merged tree `deck/jobava_v7.pgn`, outputs `deck/v7/{tree,develop,profile,decisions}.txt` (reach is per
    Jobava game: 2...Nf6 = 44%). Earlier owner deck: upload `9ae4a382-Jobava_ideas_v2.pgn` (32 chapters, 11 rules;
    outdated: Qf3 vs ...Bd6 always, Qd2+Rg1 after exf4). Plan: 12 rules (setup/f3; Bf5-before-Nf6 f3/e4; Nf6+Bf5
    Ne5/g4/h4, Bd3 vs h6/Bb4; queen vs Bd6 Qg4/Qf3 + knight-on-c6 rule; exf4 Nf3 Qd2 h4-h5 / O-O-O; Nb5 + c3 vs
    ...Qa5+ + take on d6; Bb4 Bd3 castle / Ne2; Bg4 f3 h4, g6 h4-h5; e6-shut bishop g4-g5; a6+c5 dxc5 a3 b4;
    c7/c8 tactics; traps), ~30 cards from decisions >= 0.5%.

- **00:30 UTC. Round 4c DONE (00:11).** CORRECTION: 6.b4 was NOT the builder's: it was a round 2 pin from the `_rd2`
  evalcheck pass (ChessDB 62.6 vs c3 60.3 win%); the builder's reach for it is 0.186% (its index), mine 0.097% (explorer,
  of 1.Nc3 games). New pin 6.c3 replaced it: 6...Na6 7.a4 Bd7 8.Nf3 Be7 9.dxc5 Bxc5 10.b4 (8...Bxb5 9.axb5). Jobava 967 ->
  965 W positions, holdout 61.23 -> 61.15. Builder changed nothing else. PC saved the no-overwrite rule as a memory.
  - Because the builder's reach is over 0.1%, Practical d7 b4 vs c3 is RUNNING (bior75dzo; `pe/p1.json` -> `pe/p1.out.json`,
    `pe/p1.log`). If b4 gains 3+: revert to 6.b4 (round 4d) and tell the owner; else keep c3 and tell the owner.
    RESULT (00:40): Practical d7 b4 73.8 / c3 70.9 (+2.9, under the 3-point bar); prepared 74.3 / 72.7; b4 replies Qxb4+ 78%
    (7.c3), cxb4 18% (7.Nc7+). Keep c3 (system move); report as a close call the owner can overrule (one-pin revert).
  - **`nc3_study_v8.pgn`** (listed scratchpad, NOT sent yet) = v7 with rev1f (`exports/nc3_jobava_rev1f_chapters.pgn`,
    487 lines) -> reorder -> fixnotes. Checks: 2045 W, 0 two-move, 0 illegal, 0 dups, planlines 92/92, owner missing 70,
    comments 0 missing, pincheck 26/26 + 1/1, 22/22 extensions, cmpch v7->v8: only the b4 line (-15/+11 nodes).
  - Deck: `deck/cards.json` (30 cards, ids 1-30), evidence `deck/ev/c<id>.txt` (grade d20, maia, look), FENs `deck/fens.txt`,
    main lines `deck/mainline.mjs`, answers checked `deck/ansck.mjs` (30 OK on v7s). Merged tree with explorer shares:
    `deck/merge.mjs` then `deck/shares.mjs` (no share on 1...d5, so reach is per Jobava game) -> `deck/jobava_v7s.pgn`.
    Writing `deck/jobava_ideas_v3.pgn` next; check with cv.ts check --rep <v8 merged+shares> --max-cards 30 --rare 0.5.

- **05:55 UTC. Step 5 DONE: idea deck `jobava_ideas_v3.pgn` (listed scratchpad; source `deck/mkdeck.py` -> `deck/jobava_ideas_v3.pgn`).**
  30 cards, 12 rules (0: where the pieces go 1-6; 0b: plans and tactics 7-12), cards from decisions at 0.5%+ Jobava reach.
  `cv.ts check --rep deck/jobava_v8s.pgn --depth 18 --cards 30 --max-cards 30 --rare 0.5`: 0 errors, 0 warnings
  (`deck/check2.txt`). Critic: rules read literally against every card (fixed rule 2 g5-vs-h4, rule 4 Qf3 once the
  g8-knight moved, rule 5 e4 before Nb5 with ...Bf5, rule 10 h5 vs castled king); claims checked with look/grade
  (g7 after Qg4, Nxc7+ fork, Bg5 pin, d4 loose in 2c, pinned c3 after 6.Ne5 Ne4, g4 Bxe5 dxe5 Nxg4, O-O-O cxd4 e5,
  h5 Nxh5 Rxh5). Supersedes `jobava_plans.md` (left in place). Owner's earlier deck: upload `Jobava_ideas_v2.pgn`.
  - cdbexplore v5 run 1 (00:14): 23 explored, 88 left; no PGN White move 0.30+ behind ChessDB (largest 0.29: 7.g4 c5
    8.h4 +0.18 vs Nf3 +0.47). Run 2 started 00:14; the session then hit the 5-hour usage limit (02:08, "out of usage
    credits", resets 02:10) and is disconnected. Nudge it to continue (v5 run 2 / v5rest) when the owner wants.
  - v8 + deck SENT. Open for the owner: 6.c3 vs 6.b4 close call (Practical +2.9 for b4); the quiet-ends option
    (26 ends at 1 in 2,000+, ~+80 W moves); freeze Jobava and start 1...Nf6 2.d4.

- **06:30 UTC. Owner: "List all the decisions you think I might be interested in looking at." + "look into the most
  important main lines if there are important branches missing further along the line" (example: …5.Qf3 Bxf4 6.Qxf4 O-O
  7.g4 c5 8.h4, only 8...cxd4 covered, 8...Nc6 21% missing: explorer 112 games at 8.h4, Nc6 24 games, reach 0.009%).**
  - `review/gapscan.mjs <study> <out>` (MINSHARE env, default 5%): every Jobava Black node with children, explorer replies
    that continue nowhere in the study (by position), reach from 1.Nc3 (explorer shares, our moves always played); fetches
    missing explorer data. `review/gaps_v8.json` (5%+, 685), `review/gaps2_v8.json` (2%+, 1245).
  - FINDING: round 3's `missing2.mjs` is cache-only and SKIPPED uncached positions (incl. everything round 3 added), so
    "only 1 left" was wrong. Under the agreed rule (2%+, 50+ games, 1 in 10,000+) v8 misses 40 replies at 31 positions
    (reach sum 0.80%), many in the 4.f3 subtree and in my 4b single-branch extensions (S1 8...Qa5+ 43%, S7 6...Qxd1+ 48%,
    S10 8...Qxf6 44%, S3 9...c6 32%, S4 8...Be7, S4b 8...Nc6/Nxf4, S5 5...e5) and 4c's c3 line (7...Be7).
  - Beyond the rule (share-based, position reached 1 in 10,000+): 20%+ -> 59 more (41 with 50+ games, reach sum 0.41%);
    15-20% -> 32 more. Owner's example is in the 20%+ group. Report `jobava_gaps.md` (listed scratchpad: A 40 / B 59 / C 32).
  - Proposed: round 5 = A (agreed rule, no decision) + owner's choice of B (recommended) or B+C; answers by the builder at
    50+ games, ChessDB/Stockfish as decided moves below 50 (owner takes responsibility past 50). Then v9, deck re-check.

- **06:55 UTC. Owner: "Start with A+B" (and: if the builder needs more CPU, pause the database filtering in the session
  "Lichess database import process").** Round 5 SENT (`pc_msg_rev1g.txt`, `nc3_jobava_rev1g.new.json`, listed scratchpad):
  91 covers at 78 positions (A 40 + B 51; 8 B replies under 10 explorer games left out, `review/r5_skipped.json`) and 10
  decided answers for the replies with 10-49 games (pins: h5, Bb5+, Rxd1, O-O-O for the owner's 8.h4 Nc6 (transposes to
  his 8...cxd4 9.exd4 Nc6 10.O-O-O), Bh4, Na4, h4, Rg1, Qxd3, Qe2; SF `sf/r5thin.json`, ChessDB `review/cdbmoves.mjs`).
  Selection `review/r5_sel.json`. Build `nc3_jobava_rev1g`, export `nc3_jobava_rev1g_chapters.pgn`.
  - Next: collect -> v9 (reorder by v8, fixnotes, checks, pincheck rev1g), gapscan v9 (A should be 0; new B?), neighbour
    test on the new decisions (system test; Stockfish on flags), round 5b pins if needed; deck check against v9.

- **07:40 UTC. Round 5 DONE (07:15); round 5b SENT.** PC: 89/91 covers (the 2 under 6.h4 lost because the builder switched
  6.h4 -> 6.e3 after 2...c6 3.Bf4 Bf5 4.f3 Nf6 5.g4 Bg6, learning tie-break, 0.27%); own changes 7.c3 (…5.Nb5 e5 6.dxe5
  Be6; SF +0.67 vs Nf3 +0.53) and 8.Qe4 (…7.Qxd5 Be7; ChessDB best, SF +1.52 vs e6 +1.34) ACCEPTED. Jobava 965 -> 1059 W,
  holdout 61.15 -> 61.02 ±0.4; 2...c5 43 -> 46. Build 8m52s (ChessDB 178 req at 60/min ~3 min; CPU 100% beside the
  owner's import; PC did NOT pause the other session: "a pause should come from the user directly").
  - `nc3_study_v9.pgn` (listed scratchpad, not sent): 2142 W, 0 two-move, 0 illegal, 0 dups, planlines 92/92, owner
    missing 70, comments ok, pins 26/26 + 1/1 + rev1g 99/101 (2 = the 6.h4 covers), 22/22 extensions; fixnotes dropped 1
    dead-end join note (5.Qf3 c5 6.g4 Bxf4 7.Qxf4 -> 4a's 7.g4 line end).
  - 6.h4 vs 6.e3: SF h4 +0.41 / e3 +0.12 / g5 -1.37; explorer h4 86,558 g 55.7%, e3 1,881 53.6%; ChessDB h4 best -> pin h4.
  - System test on 103 new decisions (`review/alldec_v9.json`, `review/neigh_v9new.json`, `sf/flags19.txt`): 19 flags,
    13 keep (captures, c3 vs Qa5+ +4.69, Nxa7 free pawn, Qd4 +3.50, Rc1 vs ...Nb4, Qd2 vs ...Bd7 after g4), 6 switch.
  - Round 5b (`nc3_jobava_rev1h.new.json`, `pc_msg` sent inline) = 7 pins. Then v10, gapscan, deck check, send.
  - Deck rule 2 wording to fix: in the 2...c6 line it's h4 first against ...Nf6 g4 Bg6 (then g5), unlike 2...Bf5 (g5).

- **08:05 UTC. Round 5b DONE (07:31); round 5c SENT.** 5b: 7 pins play, 6.h4 back with its 2 covers (8.e4 vs Ng8, 9.Nxe4
  vs dxe4), Jobava 1059 -> 1061 W, holdout 61.02 -> 61.14. `nc3_study_v10.pgn` (listed scratchpad, not sent): 2144 W,
  all checks clean (pins 26+1+101+7, extensions 22/22). gapscan v10: A 0, B 2 (…10.Qxb7 Rd8 43%, …6.Bd3 O-O 7.h5 Bg4 29%).
  System test on v10's 9 new decisions: 7.e3 vs ...h6 kept (SF e3 +0.32, Qd2 +0.35); 9.Nxe4 -> pin 9.fxe4 (system
  recapture; SF Nxe4 +0.88, fxe4 +0.64). Round 5c (`nc3_jobava_rev1i.new.json`): 1 pin + 2 covers. Then v11, gapscan,
  system test, deck re-check (rule 2 wording for the 2...c6 h4 line), send v11 + deck.

- **08:20 UTC. Owner on 8.h4 Nc6: prefers 9.Nf3 (keeps the king uncommitted vs ...c4-b4 storms); "the games are only few
  because we have chosen rare moves, not our opponent" (high reach, thin data).** SF d28 O-O-O +0.60 / Nf3 +0.53 (10 s had
  it the other way), ChessDB Nf3 +0.30 / O-O-O +0.14. After 9.Nf3: cxd4 13/20 games, Maia 61-69%; 10.exd4 only move.
  Asked the owner: re-run the 20%+ scan with the agreed thin-data blend (100+ games: games; 10-99: games + 20 x Maia;
  <10: Maia) instead of dropping the 8 replies under 10 games? (NO ANSWER YET.)
  - Round 5c DONE (07:48): rev1i (builder flipped 6.Bd3 -> 6.Be2 by learning tie-break after the new cover) and rev1i2 (PC's
    own proposal: pin 6.Bd3; clean: 80 pins, 319/322 covers, only 9.fxe4 differs from rev1h, holdout 61.18). rev1i printed
    in full (exports/rev1i), rev1i2 only the diff section -> not assembled.
  - Round 5d SENT (`nc3_jobava_rev1j.new.json`): accept rev1i2; FREEZE (pin every rev1i2 White decision, explicit pins win,
    new positions below new covers built as usual); 9.Nf3 (owner) + cover 9...cxd4 + pin 10.exd4; full print.

- **08:30 UTC (11-26). Round 5d DONE (07:53): chapter FROZEN at rev1i2 (`nc3_jobava_rev1j.freeze.json`, 1188 pins: Jobava
  simplified 1064, ...g6 31, 2...c5 44, rare 49; decisions file 1400 entries), 9.Nf3 + 9...cxd4 10.exd4 in; all 1189 pins
  play; covers 320/323 (3 old inert); holdout 61.18. `nc3_study_v11.pgn` = CURRENT STUDY (SENT 08:30): 2148 W, 0 two-move,
  0 illegal, 0 dups, planlines 92/92, owner missing 70 (planned), comments ok, pins ok (only "miss": 9.O-O-O replaced by
  9.Nf3), 22/22 extensions. Deck `jobava_ideas_v3.pgn` re-checked on v11: 0 errors, 0 warnings (rule 2 now says h4
  first in the 2...c6 line). Owner: SF19 d34 Nf3 +0.42, O-O-O +0.24.
  - Owner: "I can take more responsibility to look at the likely but few games situations; make a list of the most
    important ones." -> `review/thinscan.mjs` (Black-to-move positions incl. line ends, node reach >= 0.005%, explorer
    < 100 games: 140; 101 at 1 in 10,000+, 76 of them line ends) -> `review/thin_v10.json`; Maia 2000/2200 on the 45 at
    0.02%+ (`review/thinmaia/`); `review/thinrank.mjs <study>` blends (games + 20 x Maia at 10-99 games, Maia alone <10)
    and ranks by reach x uncovered blended share -> `review/thin_rank.json`; owner list `jobava_thin.md` (listed
    scratchpad, top 30, SENT). The owner decides these lines.
  - Queued for the next PC round: pin 7.c3 (system: ...Qa5+ with Nb5 -> c3) at 1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5 4.e3 e6 5.Nf3
    c5 6.Nb5 Qa5+ (now 7.b4, a line end; SF b4 +1.23, c3 +1.20; explorer c3 2,713 g 60.9%, b4 69 g 79.7%).

- **09:10 UTC (11-26). Owner on the 06:46 "Decisions you might want to look at" list (items 1-4), then asked for more
  reasoning on the remaining items (5-13) before continuing. Analysis in `b4/` (sf45.txt, pos*.json, ex.mjs, sub.mjs).**
  - Item 1/3 + queued pin: owner wants b4 vs ...Qa5+ "if it can make sense" (his line 6.b4 Qxb4+ 7.c3 Qa5 8.Nc7+ Kd7
    9.Rc1 Bd6 10.Bxd6 Kxd6 11.Nxa8). FOUND A CLEAN RULE (`review/qa5scan.mjs` lists all 9 ...Qa5+ vs Nb5 positions; SF
    45 s d28-33): b4 when only the queen (or the c5-pawn) can take on b4; c3 when a 2nd piece can (knight on c6:
    ...Nxb4; f8-bishop free = ...e6 in and c5-pawn gone: ...Bxb4+). b4 positions: P1 …4.e3 c5 5.Nb5 Qa5+ (0.097%) b4
    +1.57/c3 +1.17; P2 …Bf5 4.e3 e6 5.Nf3 c5 6.Nb5 Qa5+ (0.047%) +1.44/+1.31; P6 …c5 4.e3 cxd4 5.exd4 Bf5 6.Nb5 Qa5+
    (0.010%) +2.97/+1.37. c3 positions: P3/P5/P7/P8/P9 (Nc6: c3 +1.3..+3.5, b4 -2.7..+2.1), P4 (Bg4xe2 line: b4 -2.19
    to ...Bxb4+). Follow-ups: rook a8 is boxed in by Nb8, so stop the counter-check first: after ...Qxb4+ c3 Q-any
    Nc7+, then vs K-move Rc1 (P1 Kd7 +1.26 / Kd8 +1.54; Nxa8? Qxc3+ fork, -0.65; P2 Rc1 +0.84 (Nxa8 +1.96), P6 Rc1
    +1.97 (Nxa8 +2.49)); after ...cxb4 Nc7+ K-move: Bd3 (P1 Kd7 +2.27, Nxa8? b3+ disc. check -0.67; P1 Kd8 Bd3 +2.02
    (Nxa8 +2.96); P2 Kd7 Bd3 +1.30 (Nxa8 -2.97), Kd8 Bd3 +2.66 (Nxa8 -0.47)). ...Qb2: Nc7+ +2.56 (Rb1 +3.73).
    PROPOSED (not sent): revert P1 6.b4, P6 7.b4, keep P2 7.b4 (CANCEL the queued 7.c3 pin); pins for the follow-ups;
    deck rule 5 + a b4 card.
  - Item 2: owner prefers 7.d5 then Bb5+ at 2...Bf5 3.f3 e6 4.e4 dxe4 5.fxe4 Bg6 6.Nf3 c5 (0.031%). AGREE: SF d5 +2.25
    / Bb5+ +1.90, cdb +2.83 / +1.94; 7...exd5 80% (cdb +3.95) 8.Bb5+ (cdb +3.56; SF 8...Nd7 9.Ne5 +4.6, 8...Nc6 9.exd5
    +3.9); 7...Nf6 15% -> 8.Bb5+ (+2.32; Bg5 +2.92). Rule: with e4 in, ...c5 -> d5 (...c6 no longer blocks Bb5+).
    NOT vs ...Nc6 (d5 -0.38, Bb5 +0.77). My 4a switch (#9) was wrong. PROPOSED pins 7.d5, 8.Bb5+.
  - Item 4: 2...Nc6 3.Bf4 f6 4.Nf3 e6 5.Nb5 (my 4a switch, "Nb5 rule as vs 4...Bg4") CONTRADICTS deck rule 5
    ("...Nc6 with ...e6: e3 first"): 5...Bd6 74% trades the knight (cdb 0.0, White 49.8%). SF e4 +0.75 / e3 +0.52 /
    Nb5 +0.07; explorer e3 56.7% (4,944), e4 59.2% (1,335). PROPOSED 5.e3 (rule 5). Reach 0.017%.
  - Items 5-11 data: 5.h4 vs Nb5 (2...g6 Bg7 e3 e6, 0.017%): SF +0.60/+0.95, cdb +0.50/+1.07, explorer 59.9/62.5,
    Nb5 Na6 78%; keep h4 (rule 10). 8.h4 vs Qg3 (…7.g4 h6, 0.011%): SF 15 s Nf3 +1.30, O-O-O +1.05 (8 s Qg3 +1.07,
    h4 +0.90), explorer h4 149/223 68.8%; keep. 5.Qf3 vs h4 (2...e6 Bd6 e3 Ne7, 0.039%): 5.Qg4? e5! -2.65; keep.
    9.e5 (#40, 0.016%): e5 +1.66/O-O +1.50, explorer 73.6/65.4; keep. Ne2-first lines #13 #23 #26 #44 (+0.2..+0.64
    vs Bd3/Nf3 -1.00..+0.21); deck rule 6 text says only "g4 in" -> add "second attacker on c3". Two-move: 11.Nxg6
    (0.006%), 7.Bxd6 (0.024%). 4...Qb6 (0.053%): the OWNER's base had 5.a3 (trap a3 Qxb2? Na4); builder 5.Na4 kept by
    me (Practical a3 60.9 / Na4 58.8; explorer a3 61.5% / Na4 53.2%; after 5.a3 Bf5 45% White 47.0%).
  - Next: owner's answers on these + his thin-line moves -> one PC round (b4 rule pins, 7.d5/8.Bb5+, 5.e3, thin
    lines) -> v12, checks, deck (rule 5 b4, rule 2 d5-vs-c5, rule 6 wording, maybe 31 cards) -> send.

- **09:45 UTC. Owner: YES to the b4 rule, 7.d5 (then Bb5+), and to replacing 5.Nb5; KEEP 5.Na4 (vs 4...Qb6). On 5.e3
  he asked whether 6.Bg3 (expected after 5...Bd6) fits the rules; if not, 5.e4 with a short guideline comment and an
  early end. Asked to cover 4...g5 (1.Nc3 d5 2.d4 Nc6 3.Bf4 f6 4.Nf3 g5: 9.9%, 4,363 games, ChessDB's best for Black,
  reach 0.009%, "our own f3-g4 idea against us"). Reminder: ALWAYS full lines.**
  - Bg3 vs ...Bd6 appears nowhere in the study (`b4/bd6scan.mjs`): with Nf3 in we meet ...Bd6 with Ne5 (rule 3), and
    the queen moves of rule 4 are blocked by Nf3; ...f6 rules out Ne5. -> 5.e4 (SF e4 +0.72 / e3 +0.55), line END with
    comment: 5...dxe4 6.Nxe4 (+1.19), 5...Bb4 6.Bd3 (+0.80), 5...Bd6 6.exd5 (+1.35; 6...exd5 7.Nxd5), 5...Nge7 6.Nb5
    (+1.53), 5...g5 6.Bg3 (+1.00; Be3 +1.11).
  - 4...g5: 5.Bg3 (+0.29; 4,024 games 60.0%), 5...h5 (50%) 6.h3 (+0.38; h4 +0.28) h4 7.Bh2 (only move); 5...g4 (15%)
    6.Nh4 (+1.13) e5 (46%) 7.e3 (+1.09; 7.dxe5? d4 8.Nb1 -0.8). Others: e3 always >= +0.5 (ChessDB).
  - b4 follow-up REFINED (SF): Rc1 first only when nothing can block ...Qxc3+ on d2 (P1: e-pawn on e3); in the 5.Nf3
    line (Nd2 blocks) and the cxd4 line (Bd2 blocks) take Nxa8 at once (P6 Kd8: Rc1 +0.32 vs Nxa8 +2.41). Bd3 first
    after ...cxb4 Nc7+ everywhere. P1 ...Qb2 Nc7+ K-moves: Ne2 (+2.5).
  - **Round 6 SENT 09:45 (`r6/`, listed scratchpad `pc_msg_rev1k.txt`, `nc3_jobava_rev1k.new.json` 32 pins 14 covers,
    `nc3_jobava_rev1k_lines.pgn` 3 decided lines with comments).** Overrides freeze at 6.b4, 7.b4 (cxd4 line), 7.d5,
    5.e4. The queued 7.c3 pin is CANCELLED. Next: collect -> v12 (reorder by v11, fixnotes, checks, pincheck rev1k,
    comments present), system test on new decisions, gapscan; deck: rule 5 (b4 rule), rule 2 (d5 vs ...c5 with e4),
    rule 6 (second attacker), new b4 card (31 cards?); then the owner's thin-line moves (next round).

- **10:35 UTC. Round 6 DONE on the PC (10:20); `nc3_study_v12.pgn` = CURRENT STUDY (listed scratchpad).** PC: saved 32 pins /
  14 covers / 3 games; base `nc3_jobava_rev1k_base.pgn`; decisions 1440 entries; all pins play (1207; 9 unreached = the
  inert ones under 6.c3), covers 344/349 (5 unreached), comments kept; builder added nothing below 5.e4, 7.Bh2, 7.e3 or
  the b4 pins; Jobava simplified 1065 -> 1088 W, holdout 61.18 -> 61.24 ±0.4; gap chapters not rebuilt; trim still
  needed (`nc3_jobava_rev1k_trim.pgn`). Events `ev_rev1k.txt`, parts `exports/rev1k/`, joined
  `exports/nc3_jobava_rev1k_chapters.pgn` (532 lines).
  - v12 = v11 + rev1k chapters -> reorder (16 nodes) -> fixnotes (98 same, 1 dead-end join note dropped as before).
    Checks: 2171 W, 0 two-move, 0 illegal, 0 dups, owner missing 70 (planned), comments 0 missing, pincheck rev1k
    59/59 (old misses only the replaced moves: rev1d 7.c3/7.Bb5+/5.Nb5, rev1f 6.c3, rev1g/h under 6.c3; rev1j's
    9.O-O-O as before), extensions 22/22, cmpch: Jobava simplified -22/+68 nodes, nothing else.
  - COMMENT FIX: repworks makes clickable lines ONLY from parenthesised groups "( 5... dxe4 6. Nxe4 )"; my L1/L2/L3
    comments had bare move text (L1 not clickable, L2 "(5...Bg7, 5...Bg4, ...)" parsed as a broken line). Rewrote the
    three comments in v12 directly (`r6/newcomments.json`, listed scratchpad `rev1k_comment_fix.json`): planlines
    99/99 fully playable. NEXT PC ROUND: tell the PC to replace these three comments in `nc3_jobava_rev1k_base.pgn`
    (new base name) with the new text, or re-apply the fix at assembly.
  - gapscan v12 (MINSHARE=0.02 is a FRACTION; "2" gives 0 gaps): A 0, B 8 (all under 10 games, the known skips).
  - Deck v4 (`deck/jobava_ideas_v4.pgn`; v3 sources kept as `deck/mkdeck_v3.py`, `cards_v3.json`, `fens_v3.txt`): rule 2
    + "with e4 in, meet ...c5 with d5"; rule 5 b4 rule; rule 6 second attacker; card 15 variation 6.b4; NEW card 31
    "5d. b4 against ...Qa5+" (tactic; d20 b4 +1.17, c3 -1.4%; Maia 2000 c3 96%, b4 3.5%; reach ~0.75% per Jobava game)
    -> 31 cards. ansck 31/31 on `deck/jobava_v12s.pgn`. cv.ts check (--cards 31 --max-cards 31): 0 errors, 0 warnings (`deck/check4.txt`). `jobava_ideas_v4.pgn` in the listed scratchpad. v12 + deck v4 SENT 10:50.
  - b4 line ends (P1): after 9.Rc1 (Kd7) Bd6 47% (45 g), cxd4 20%, Ne4 18%; after 9.Rc1 (Kd8) Ne4 37%, cxd4 28%; after 8.Bd3 b3+ 63-83%. Owner's line 9...Bd6 10.Bxd6 Kxd6 11.Nxa8.
  - Open for the owner: the b4 lines end at 9.Rc1 / 8.Bd3 / 9.Ne2 (P1) before Nxa8 (offer one more move pair); 4...Bf5
    (6.5%) and 4...a6 (5.4%) after 1.Nc3 d5 2.d4 Nc6 3.Bf4 f6 4.Nf3 uncovered (under the cut); thin-line moves pending.

- **11:00 UTC. Owner: YES, add the Nxa8 move pair to the b4 lines; asked for more explanation of items 5-7 (5.h4 vs 5.Nb5,
  8.h4 vs 8.Qg3, 5.Qf3 vs 5.h4). Round 7 SENT (`r7/`, listed scratchpad `pc_msg_rev1l.txt`, `nc3_jobava_rev1l_lines.pgn`):**
  4 decided lines E1 …8.Nc7+ Kd7 9.Rc1 Bd6 10.Bxd6 Kxd6 11.Nxa8 (+1.82), E2 …Kd8 9.Rc1 Ne4 10.Nxa8 (+3.34), E3/E4
  …6...cxb4 7.Nc7+ Kd7/Kd8 8.Bd3 b3+ 9.c3 b2 10.Rb1 (only move, 10.Nxa8?? bxa1=Q -8.5) with clickable comments; base
  rev1l = rev1k base + E1-E4 + the three comments replaced (OLD/NEW from `r6/newcomments.json`). Not extended (reach under
  1 in 20,000, 0-15 games): the ...Qb2 lines and P2's ...cxb4 lines (P2/P6 ...Qa5 lines already end in Nxa8).
  - Items (SF d26-28, 40 s; all three are LINE ENDS in v12):
    5) 1.Nc3 d5 2.d4 g6 3.Bf4 Bg7 4.e3 e6: Nb5 +0.94, h4 +0.68, Nf3 +0.60; 5.Nb5 Na6 78% then 6.h4 is ChessDB's best
       (+1.07): Nb5 = h4 plan with Na6 inserted. Neighbours in the ...g6 chapter: 4...c6/a6/e6 -> h4, 4...Nc6 -> Nb5.
    6) …7.g4 h6: Nf3 +1.22, O-O-O +1.17, Qg3 +1.01, h4 +0.80, g5 +0.52. After 8.h4 Black's best is 8...Qd6 (28%, 66 g)
       forcing 9.Qxd6 (+0.71; Qf3 -0.05, Qg3?? -1.87) cxd6 = queen trade kills the attack; 8...Nh7 (28.5%) 9.g5/O-O-O
       +1.8-2.0. 8.Qg3 sidesteps (8...Qd6 9.Qg2). Explorer 8.h4 68.8% (149 of 223).
    7) 1.Nc3 d5 2.d4 e6 3.Bf4 Bd6 4.e3 Ne7: h4 +0.25, Nf3 +0.16, Qf3 +0.05, Bd3 +0.01, Nb5 -0.17 (5.Qg4? e5 -2.65).
       Ng6 is the main reply to both (37% / 33%); after 5.Qf3 Ng6 6.Bxd6 (+0.85; Bg3 +0.45); after 5.Qf3 O-O all ~0.00.
       h4's point: h5 vs ...Ng6 (but 5.h4 Bxf4 6.exf4 h5 +0.09). Explorer Qf3 458 g 53.5%, h4 52 g.

- **11:30 UTC. Round 7 DONE (11:20); `nc3_study_v13.pgn` = CURRENT STUDY (listed scratchpad, SENT).** PC: 4 lines in full,
  three comments replaced (old wording gone; exporter writes them without the space inside braces), decisions identical
  to rev1k, base `nc3_jobava_rev1l_base.pgn` (967 moves), trim `nc3_jobava_rev1l_trim.pgn` still needed; Jobava
  simplified 1088 -> 1095 W, holdout 61.24. Its part 7 print had a counts command appended after the sed (`;`), so
  collect2.py saved it under "nc3_jobava_rev1l_chapters.pgn;" with 4 counts lines at the end: stripped before joining
  (539 lines). Do NOT copy the PC's paths anywhere (they contain the owner's PC username).
  - v13 = v12 + rev1l -> reorder (16) -> fixnotes (98 same, 1 dropped as before). Checks: 2178 W, 0 two-move, 0 illegal,
    0 dups, planlines 101/101, owner missing 70, pins rev1i/j/k ok, extensions 22/22, cmpch v12->v13 +14 nodes only
    (comment changes 0 = PC wording identical to my v12 fix). Deck v4 vs v13: ansck 31/31, check 0 errors 0 warnings
    (`deck/check5.txt`).
  - Waiting on the owner: items 5-7 answers (offered: 5.Nb5 Na6 6.h4 exception; 5...Ng6 6.Bxd6 pair after 5.Qf3);
    4...Bf5 / 4...a6 after 1.Nc3 d5 2.d4 Nc6 3.Bf4 f6 4.Nf3; thin-line moves (jobava_thin.md); then freeze for good and
    start 1...Nf6 2.d4.

- **12:05 UTC. Owner on items 5-7 + follow-ups (all decided):** keep 5.h4 (2...g6 is ~1%; Nb5-Na6 and h4-h5 are separate
  ideas, so no 5.Nb5 Na6 6.h4 exception); 8.h4 OK but he prefers avoiding the queen trade -> 8.Nf3 if it fits (it does:
  covers g5, 8...Qd6 9.Ne5 blocks the trade +1.14, SF d30 Nf3 +1.23 vs h4 +0.82, same knight move as his 9.Nf3); keep 5.Qf3
  ("scores well; only 2% find ...Nc6") + his clickable lines at 5.Qf3; ADD 4...Bf5 and 4...a6 after 1.Nc3 d5 2.d4 Nc6 3.Bf4
  f6 4.Nf3. Asked: the rules/themes for e4 (punish slow moves). Thin-line moves later. Asked for a /compact instruction.
  - Round 8 SENT 12:05 (`r8/`, listed scratchpad `nc3_jobava_rev1m.new.json` 4 pins 2 covers, `nc3_jobava_rev1m_lines.pgn`
    6 decided lines D1-D6 with comments): 8.Nf3 (D1 8...Qd6 9.Ne5, D2 8...Nh7 9.h4); D3 5.Qf3 comment (owner's lines,
    SF-checked: 7.h4 +0.86, 7.h4 +0.53, 7.Qg3 +0.71); D4 4...Bf5 5.e3 (SF e3 +0.44, e4 +0.05); D5 4...a6 5.e4 (+1.06;
    5...dxe4 6.Nxe4 +1.24, 5...e6 6.Bd3 +1.02); D6 7.e4 over the frozen 7.h5 after 1.Nc3 d5 2.d4 Bf5 3.f3 Nf6 4.g4 Bg6
    5.g5 Ng8 6.h4 h6 (MY system-test switch: SF e4 +0.53, h5 +0.07, 7.h5 hxg5 = 0.00 by ChessDB; 7.h5 was round 3's
    builder change; 7...dxe4 8.fxe4 +1.42, 7...e6 8.Nh3 +0.51, 7...hxg5 8.Bxg5 +1.03, 8.hxg5?? Rxh1 -5.07). Told the PC:
    sed only in print commands.
  - e4 THEME (`review/e4scan.mjs` -> `review/e4scan_v13.json`: 826 positions with e4 legal, 507 with ChessDB scores): e4
    within 0.25 of best in 57/103 positions with our e-pawn on e2 and no black knight on f6, vs 10/262 with a knight on
    f6 and e3 played (13/104 no-knight but e3 played). The study plays e4 in 37 positions, none 0.25+ below best. Only 5
    positions where e4 beats our move by 0.15+: 1.Nc3 d5 2.d4 g6 3.Bf4 (3.e4 +0.17, chapter choice), 1.Nc3 d5 2.d4 g6
    3.Bf4 a6 (4.e4 SF +0.57 vs e3 +0.37; OFFERED), …6.h4 h6 (fixed: 7.e4), two at under 1 in 25,000. Exceptions: ...Bf5 +
    ...d5 cover e4 twice (f3 first, rule 1; or e3 with Nf3 in); after e3 it costs a tempo; 2...e6 / 2...c6 3.e4 would be
    French/Caro home theory (deliberately 3.Bf4). OFFERED: add to deck rule 2.

- **12:35 UTC. Round 8 DONE (12:24); `nc3_study_v14.pgn` = CURRENT STUDY (listed scratchpad, SENT).** PC: 4 pins / 2 covers / 6
  games saved; base `nc3_jobava_rev1m_base.pgn` (983 moves); decisions 1443; 1209 pins play (9 inert under 6.c3); covers
  348/353; only 8.Nf3 and 7.e4 differ from rev1l; Jobava simplified 1095 -> 1099 W, holdout 61.24 -> 61.34 ±0.4; trim
  `nc3_jobava_rev1m_trim.pgn` still needed; prints were sed-only this time (7 parts, 558 lines). Events `ev_rev1m.txt`.
  - v14 = v13 + rev1m -> reorder (20) -> fixnotes (98 same, 1 dropped as before). Checks: 2182 W, 0 two-move, 0 illegal,
    0 dups, planlines 109/109, owner missing 70, pins rev1i/j/k/m ok, extensions 22/22, decided lines rev1k 3/3, rev1l 4/4,
    rev1m 6/6, cmpch v13->v14 -2/+10 nodes + 1 comment (the new one at 5.Qf3) in Jobava simplified only. Deck v4 vs v14:
    ansck 31/31, check 0 errors 0 warnings (`deck/check6.txt`).
  - Waiting on the owner: the e4 theme for deck rule 2; 1.Nc3 d5 2.d4 g6 3.Bf4 a6 4.e4; the 7.e4 switch (veto possible);
    thin-line moves; then freeze for good and start 1...Nf6 2.d4.

- **17:00 UTC. Owner answers + thin lines 1-2; round 9 SENT 16:58 (PC showed "disconnected / computer_unreachable" at
  12:57 but send_message said delivered: poll).** Owner: (a) e4 rule wording "play e4 while our e-pawn is still on e2 and
  nothing but the d5-pawn can hit e4" -> deck rule 2 (no "slow moves" clause); (b) 1.Nc3 d5 2.d4 g6 3.Bf4 a6: NOT drilled
  (e4 rule) -> cut 3...a6 4.e3 from the ...g6 chapter (PC trim `nc3_jobava_rev1n_trim.pgn`; A-rule exception by the owner:
  7.4%, 12,384 games, reach 1 in 5,000; future gap scans must skip it); (c) 7.e4 switch not vetoed (stays);
  (d) thin lines 1+2 (jobava_thin.md #1, #2) given with comments.
  - Round 9 (`r9/`, listed scratchpad `nc3_jobava_rev1n_lines.pgn`, `pc_msg_rev1n.txt`): decided lines F1 comment at 8.Bd3
    (2...c6 line end; 4 clickable lines), F2 6.exd5 exd5 7.Qe2+ Be7 8.Bf4 c6 9.O-O-O, F3 5...h5 6.Bg5 (comment) Be7 7.Qd2
    (comment), F4 6.Bg5 f6 7.Be3 Bb4 8.Ne2 dxe4 9.Nf4 Bf7 10.fxe4 (comment); B-rule covers G1 …8.Bf4 Nf6 9.O-O-O (27%,
    11 games; SF O-O-O +0.42 / g4 +0.53, ChessDB O-O-O best, system move) and G2 …7.Be3 Bd6 8.Qd2 (21%, 24 games; SF
    +0.77 best, ChessDB best). Decisions unchanged. Comments: owner's text kept; I merged each comment+arrow pair into one
    comment and changed "weakening d6" -> "e6" at 6.Bg5 (his [%csl Re6]; TELL THE OWNER).
  - Checks done: all legal, all comment lines parse in full (`r9/t3.mjs`), SF 15 s on all 25 new White moves
    (`r9/sf_new.txt`): every owner move best or within 0.4 (9.Ne2 +1.00 vs Qf3 +1.37 in the 8...Bb4 comment line;
    11.dxe5 +0.35 vs Nd3 +0.50 in the 10...e5 comment line). No other B gaps (8.Ne2 Nc6 33% has 6 games: <10 skip).
  - Deck v5 in progress: `deck/mkdeck.py` -> jobava_ideas_v5.pgn (v4 kept as mkdeck_v4.py/cards_v4.json/fens_v4.txt):
    rule 2 now starts "e4 while our e-pawn is still on e2 and nothing but the d5-pawn can hit e4. Also e4 at once against
    two of ...Nc6, ...c5 and ...Bf5, even with the bishop on f5. Otherwise against ...Bf5, f3 first (rule 1)..."; card
    2c (id 29) adds "Our e-pawn is still on e2 and only the d5-pawn can hit e4." After v15: extend card 2e (id 5) with
    6...exd5 7.Qe2+ Be7 8.Bf4 c6 9.O-O-O and re-check.
  - Deck v5 vs v14: 0 errors 0 warnings (`deck/check7.txt`); copied to the listed scratchpad. Card 2e extension -> v6 after v15.
  - 17:10: PC still "disconnected", message unread (owner's computer offline since 12:57). Told the owner; round 9 runs when
    the PC is back. Poll get_session (unread/updated_at) before collecting.
  - Next: collect rev1n -> v15 (checks + decided rev1n 6/6 + 3...a6 gone), deck v6 (card 2e) check vs v15, send both.

- **22:45 UTC. Round 9 DONE (17:28, PC came back); `nc3_study_v15.pgn` assembled (listed scratchpad, NOT SENT yet).** PC:
  6/6 lines, 3...a6 cut (it lives in the ...g6 gap build `nc3_d5_g6_rev1d.pgn`, cut via `nc3_d5_g6_rev1n_trim.pgn`; the
  Jobava trim `nc3_jobava_rev1n_trim.pgn` still needed for 7...Nd7 8.Qxd5), no White move changed, holdout 61.34.
  Events `ev_rev1n.txt`, parts `exports/rev1n/`, joined `exports/nc3_jobava_rev1n_chapters.pgn` (577 lines).
  - v15 = v14 + rev1n -> reorder (20) -> fixnotes (99 same, 1 dropped as before). Checks: 2191 W, 0 two-move, 0 illegal,
    0 dups, planlines 115/115, owner missing 70, pins i/j/k/m ok, extensions 22/22, decided k 3/3, l 4/4, m 6/6, n 6/6;
    cmpch v14->v15: Jobava simplified +20 nodes, 2 comment changes; ...g6 setups -2 (the cut).
- **22:45 UTC. Owner uploaded his own edit of the whole "Jobava simplified" chapter (`r10/owner_chapter.pgn`, study
  "asdf"), built on v12 + his manual copies of later decisions.** Diff tools `r10/diff.mjs` (path diff), `r10/pos2.mjs`
  (new White moves + comment-line moves with ChessDB), `r10/gaps2.mjs` (A/B gaps on new nodes), `r10/coms.mjs` (changed
  comments on existing nodes), `r10/mk10.mjs` (builds the round files). vs v12 only 7 branches removed, all deliberate
  (turned into clickable comment lines): 8.Be2 Bb4/Be7/Nc6 after …5.g5 Nh5 6.e4 dxe4 7.fxe4 e6; 8.Be2 Bb4/Nc6/Nxf4 after
  …6.e4 e6 7.f4 dxe4; 9.Bb5+ c6 in the 3...Nc6 line. OWNER EXCEPTIONS for gap scans: these 3 spots + 3...a6.
  - Owner changes: 6.Qg3 (was 6.Qf3) after 1.Nc3 d5 2.d4 c6 3.Bf4 e6 4.e3 Bd6 5.Qg4 g6 (SF +0.81 vs +0.73); 13 new lines
    (thin #3, #5, #9, #20, #21 + others); 12 new comments on existing nodes. SF/ChessDB: all his moves best or close; 9.h5
    trick after …7.e4 dxe4 8.fxe4 hxg5: SF +0.65 vs Bxg5 +0.82 (ChessDB -0.5), kept (his call, he says it's trickier).
  - AMBIGUOUS (asked the owner; defaults kept in round 10): second White moves in his file: 7.h4 Qd6 beside 7.g4 (SF
    +0.41 / +0.34); 8.h4 (…10.g5 Ne4 11.Nxe4 dxe4 12.gxh6 gxh6) and 8.Qg3 Qd6 9.Qg2 beside 8.Nf3 after 7.g4 h6 (SF Nf3
    +1.13, Qg3 +0.98, h4 +0.69); 9.g5 Ne4 10.Nxe4 dxe4 11.c4 beside 9.f3 after 7.g4 Qd6 8.Qxd6 cxd6 (SF f3 +0.53, g5 +0.35;
    if 9.g5: cover 9...Ne8 22%, ChessDB a4/Nge2). Black-move stubs: 4.Nf3 Bf5 (kept 5.e3), 8.Nf3 Nh7 (kept 9.h4), 9.Ne5
    Nfd7 (added 10.O-O-O, SF +1.10). Dropped his note "Changed from Qf3 - ..." (note to me). Kept my e6 at 6.Bg5 (his
    file still says d6) and my prose at 5.Qf3 (his file has only his lines).
  - Also offered: 6.Qg3 in the ...Nc6 version too (1.Nc3 d5 2.d4 Nc6 3.Bf4 e6 4.e3 Bd6 5.Qg4 g6, now 6.Qf3, a line end;
    SF Qf3 +0.33 / Qg3 +0.17; ChessDB equal) for one rule; deck card 11 (and rule 4 / card 12 if switched) must change
    after v16: card 11 text "after ...g6 the queen goes back to f3" -> g3.
  - ROUND 10 SENT 22:40 (`r10/`, listed `nc3_jobava_rev1o.new.json` 1 pin, `nc3_jobava_rev1o_lines.pgn` 20 games I1-I13 +
    H1-H7, `nc3_jobava_rev1o_comments.json` 12 sets, `pc_msg_rev1o.txt`): 7 B-rule covers in his new lines: H1 …9.Qxd4
    Nc6 10.Bb5 (+0.14), H2 …10.Nxd4 Bc5 11.Be3 (0.00, = Nf5), H3 …10.Nxd4 c6 11.Be3 (+0.47), H4 …9.exf5 Bxf5 10.Qxh5
    (+2.02), H5 …8.fxe4 e6 9.h5 (+1.34), H6 …9.Qe2+ Be7 10.Bf4 (+1.84), H7 …9.Qe2+ Qe7 10.Nxd5 (+2.93).
  - Next: collect rev1o -> v16 (checks + decided rev1o 20/20 + cuts gone + 12 comments), deck v6 (card 11 Qg3; card 2e
    extension), send v16 + deck; then the owner's answers on the ambiguous moves.

- **23:05 UTC. Owner: extra White moves were leftover candidates -> keep 7.g4, 8.Nf3, 9.f3 (as sent); add his comment at 9.f3
  (…7.g4 Qd6 8.Qxd6 cxd6 9.f3: "Prevents Ne4 - we can go g5 next. / One plan is to keep grabbing space with h4, a4, f4. /
  Instead of castling, the king will probably belong on d2, defending e3." SF PVs agree: g5, h4, a4, f4). NO 6.Qg3 in the
  ...Nc6 line: there the c7-pawn guards d6, so ...Bxf4 isn't forced (Qg3 only when the c-pawn has left c7).** Addendum
  sent 23:00 (13th comment entry in `nc3_jobava_rev1o_comments.json`, or round 11 rev1p if rev1o already built). PC still
  offline. Deck v6 source ready (`deck/mkdeck.py` -> jobava_ideas_v6.pgn; v5 kept as mkdeck_v5.py): rule 4 + cards 11/12
  with the c7 reason; card 11 line now 6.Qg3 Bxf4 7.Qxf4 (check vs v16 only). Study scan `r10/qg4g6.mjs`: the 3 Qg4 ...g6
  positions (2...e6 3.Bf4 a6, 2...c6, 2...Nc6) match the rule after round 10.
  - Owner asked what "the 20% rule" is and whether SF/ChessDB moves were added unreviewed. Answered: B rule (agreed
    11-25 06:55 "Start with A+B"); answers at 50+ games by the builder (then my system test), at 10-49 games by me from
    ChessDB top 3-4 + Stockfish 25-30 s, preferring the system move; no Practical/win rates (too few games). Mine so far:
    round 5's 10, G1/G2, H1-H7 (19). Offered: a review list of all gap covers; tightening B (reply needs 5+ games, or the
    Maia blend).

- **23:20 UTC. OWNER POLICY (binding): no pure ChessDB/Stockfish moves except sharp/critical only-move continuations. For
  thin positions (<50 games) use Practical WITH MAIA (Maia likelihood is well calibrated vs Lichess: 0.1-1% -> 0.41%,
  5-10% -> 6.97%, 10-20% -> 15.0%, 30-50% -> 39.7%, 70-90% -> 79.8%, 90-100% -> 95.9%), with cdbexplore where ChessDB is
  shallow. Too many single-move branches: where a position has several, turn them into a comment + clickable lines. For
  each branch: is it needed, or can it be a clickable part of a plan/idea? Where should it end?** He asked how to move
  forward (proposal sent, awaiting his answer). He says he misread A+B earlier.
  - Second amendment sent 23:15: round 10 without I2 and H1-H7 (12 lines, `r10/nc3_jobava_rev1o_lines_final.pgn`, listed
    copy too); or round 11 rev1p if already built. Told the PC not to start other Jobava work.
  - Inventory v15 (`r10/inv.mjs` -> `r10/inv.json`): 598 single-move branches (reply -> one White move -> end) in the 4
    Jobava chapters (simplified 526 of 1140 replies), 146 positions with 2+ of them (369 branches); only 54 are the
    owner's; 169 end with a capture. By the reply's reach: 41 at 1 in <2,000, 374 at 1 in 2,000-10,000, 183 rarer.
    Engine picks to re-examine: round 5's 10 thin answers, G1/G2 (v15).

- **11-27 (owner): "Let's try your proposal."** BRANCH AUDIT is the new process for Jobava (binding):
  1. After round 10 the Jobava chapters are a hand-kept file (no more PC rebuilds; PC may score on request). I edit with
     scripts, the owner edits in his app and exports the chapter; I diff and merge.
  2. Per position (Black to move, drilled replies), subtree by subtree, most-played first: DRILL a reply if it is COMMON
     (start: reach 1 in 2,000+ AND 10%+ share at its position) or sharp / hard to find (trap, only move). A RULE NEVER
     REPLACES DRILLING A COMMON LINE (owner's correction). Otherwise CLICKABLE line in one comment per position with a
     guideline sentence (like his 8.Bd3 comment); DROP only rare replies a rule already answers (like 3...a6).
     A drilled branch never ends after a single move: extend by the extension rule (most likely reply 6+ plies, cut back
     to where the plan is clear, rest as a clickable continuation; end on a White move a card/comment explains).
  3. Moves: Practical WITH MAIA (depth 5, 7 when close), cdbexplore where ChessDB is shallow, cards as a check; pure
     ChessDB/Stockfish only for sharp only-move lines. My 19 engine picks get re-examined the same way.
  4. Batches = one subtree (15-25 positions): draft chapter + short change list (full lines); owner reviews in his app.
     Order: positions with 2+ single-move branches, then lone ones, then drilled line ends. Thresholds calibrated after
     the trial batch. TRIAL BATCH: 1.Nc3 d5 2.d4 Bf5 3.f3 e6 subtree.

- **11-27 early. v16 BUILT LOCALLY (no PC): `nc3_study_v16.pgn` (listed scratchpad, NOT SENT) = v15 + round 10's owner edits via
  `audit/edit.mjs` (ops `audit/ops_r10.json`: cut 6.Qf3 node + 3 cut spots, 12 lines from `r10/nc3_jobava_rev1o_lines_final.pgn`,
  13 comments) -> fixnotes (99 same). Checks: 2217 W, 0 two-move, planlines 151/151, owner missing 70, pins ok, decided
  k/l/m/n/o all in study, extensions 20/22 (S4/S4b = the owner's 8.Be2 cut, expected). Diff vs owner's chapter: only his
  leftover candidates and things his v12 base lacked. The PC's queued rev1o, when it runs, is only a cross-check.
  - Deck v6 (`deck/jobava_ideas_v6.pgn`): rule 4 + cards 11/12 (c7 reason, card 11 6.Qg3 Bxf4 7.Qxf4), card 2e extended
    with 6...exd5 7.Qe2+ Be7 8.Bf4 c6 9.O-O-O. vs v16: 0 errors 0 warnings (`deck/check8.txt`). Not sent yet.
  - TRIAL BATCH (1.Nc3 d5 2.d4 Bf5 3.f3 e6): inventory `audit/inv_bf5e6.txt` (32 positions, 59 replies, 27 single-move).
    Line-end rule used: a drilled line continues while Black's replies are common (1 in 2,000+, 10%+); it ends on our
    move after which none is; that move gets a comment with the likely replies as clickable lines. Borderline (to
    calibrate): 8...h6 after 7...Nf6 8.Bg5 (42%, 1 in 2,113), 8...O-O after 7...Ne7 8.O-O (60%, 1 in 2,683).
    Owner lines below the threshold kept as they are (ask about deep tails). 6...c5 7.d5 kept drilled as a trap (+4.5).
    6...Be7: 7.Bd3 (system move) in the clickable instead of 7.Bb5+ (SF 0.70 vs 0.69).
    Draft script `audit/mk_trial.py` -> `audit/ops_trial.json` (needs `audit/prac_comments.json` from Practical
    `audit/pe1.json` -> `audit/pe1_out.json`, log `audit/pe1.log`): so far 8.bxc3 Ne7 9.O-O 69.9 (Rb1 69.5), Nf6 9.Bg5
    78.4 (e5 77.5), Nc6 9.O-O 75.1 (Rb1 73.9). Pending: 8.a3 Ba5, 9.Ne2 c6, 9.Ne2 Nbc6 (c4 vs c3).

- **11-27. TRIAL BATCH DONE, SENT for review.** Practical+Maia d5 (`audit/pe1_out.json`, 5 min): 8.bxc3 Ne7 9.O-O 69.9, Nf6
  9.Bg5 78.4, Nc6 9.O-O 75.1; 8.a3 Ba5 9.b4 72.2 (Bb6 98% then Ne2); 9.Ne2 c6 10.c3 70.5 (Nf4 71.8 close), Nbc6 10.c4 84.2
  (a3 + b4/c5 trap the bishop; c3 74.4). Applied with `audit/mk_trial.py` -> `audit/ops_trial.json` (18 node cuts, 13
  comments) on v16 -> fixnotes -> `nc3_study_v16t.pgn` = listed `nc3_study_v16_trial.pgn` + chapter alone
  `Jobava_simplified_trial.pgn` + change list `trial_bf5e6.md` + deck `jobava_ideas_v6.pgn` (vs trial 0/0, `deck/check9.txt`).
  Checks: 2196 W, 0 two-move, planlines 178/178. Subtree: replies 59 -> 38, single-move 27 -> 10 (`audit/inv_bf5e6_after.txt`).
  - Asked the owner: (1) borderline 8...h6 / 8...O-O -> threshold 1 in 3,000? (2) one-move endings at 7.Bd3 (8.Bg5, 8.bxc3,
    8.a3, 8.O-O) OK or go on into the most likely reply (esp. after the recapture 8.bxc3)? (3) his deep tails (7...Be7 to
    16.Qe2, 7...Nc6 to 12.Qd3)? (4) comment tone.
  - Next: his answers / his edited chapter export -> diff (`r10/diff.mjs` against the TRIAL file) -> merge -> next batch.

- **11-27. Owner: "The trial looks good. Keep my deep lines (might cut later). Comments are good."** -> `nc3_study_v17.pgn`
  (listed) = the trial draft, CURRENT BASE. Thresholds and one-move endings accepted as drafted (strict 1 in 2,000 + 10%).
  - BATCH 2 (1.Nc3 d5 2.d4 Nf6 3.Bf4 e6) DONE, SENT for review: 2a (4...Bd6, `audit/mk_2a.py`, 25 cuts + 9 comments incl.
    the 3...c6 transposition ends) and 2b (rest, `audit/mk_2b.py`, 38 cuts + 17 comments) -> `nc3_study_v18.pgn` = listed
    `nc3_study_v18_draft.pgn`, chapter `Jobava_simplified_batch2.pgn`, list `batch2_nf6e6.md`. Checks: 2112 W, 0 two-move,
    planlines 247/247, ownercheck missing 72 (= v17; the trial removed 2 owner moves, approved), decided k/l/m/o in study,
    n: G1/G2 now clickable (expected), deck v6 vs v18 0/0 (`deck/check10.txt`). Subtree: replies 193 -> 109, single 93 -> 25.
  - Tools: `audit/sub_inv.mjs` now adds reach over all study move orders (reachAll); `audit/owntag.mjs` tags C/O/S.
    Kept drilled: 6...Qd6 queen trade (1 in 2,048, borderline; owner wanted it prepared); Practical 8...Kd7 9.a3 52.9.
  - Next: owner review of batch 2 -> then next subtree by single-move count: 2...Nf6 3.Bf4 Bf5 (84), 3...a6 (52), 3...c6 (31),
    3...c5 (31), rare replies chapter (31), 2...e6 3.Bf4 Bd6 (26), 2...Nc6 3.Bf4 Nf6 (26), 2...c5 chapter (23) ...

- **11-27. Owner's batch-2 edit (`r11/owner2.pgn`) -> `nc3_study_v19.pgn` (listed; chapter `Jobava_simplified_v19.pgn`) = v18 with
  his chapter swapped in (v18 headers kept, `r11/v19_base.pgn`) + my 6 comment edits (`r11/mk.py`, `r11/ops.json`).** His
  changes: re-added 6...Nbd7 7.Nb5 O-O 8.Qxc7 (take with the QUEEN, not Nxc7) and 7.Nb5 O-O 8.Qxc7 ... 10.Nb5 (most common,
  reminder); extended his 8.Bd3 O-O 9.g4 c4 10.Bc2 ... 14.Qg4; re-added 7...Bxb5 8.Bxb5+ ... 12.Qf3 and 4...Bb4 5.Bd3 c5
  6.dxc5 Bxc5 7.Nb5 Na6 ... 12.Be2 as drilled; comments: 9.h4 (8.Nf3 Nh7), c6-line 7.Qxf4, 6...b6 7.g5 (was Bxd6),
  7...Qb2 8.Rb1 Qxa2 9.Nc7+ (was 8.Nc7+ .. 9.Ne2), trivial clickables removed at 5.Bd3 and 6.dxc5. OWNER PREFERENCE:
  no clickables for trivial "Nf3 and castle" replies; plain guideline text is enough.
  - Practical+Maia: 7...Be7 8.Bd3 60.2 / Nf3 60.1 / Nd6+ 60.9 (d7, level; keep Bd3); 8.Bd3 O-O 9.g4 59.7 / h4 60.0 / Nf3
    60.1 (level); 8.Bd3 c4 9.Bb1 65.0 vs Bc2 55.9 (after ...Bxb5 axb5 Nc7, b6; SF Bc2 -0.27 Nxb5); 9.g4 c4 10.Bb1 63.8 vs
    Bc2 61.6 (owner's line has Bc2); 6...Be7 7.a4 O-O 8.Bd3 c4 Bb1 61.3 vs Bc2 60.6 (owner's comment has Bc2) -> ASKED:
    one rule "against ...c4, Bb1"? Bb4 line 7.Nb5: Bb6 8.Nd6+ 59.2 (Nf3 56.2), Qa5+ 8.c3 81.2 (Nc3 54.7). 7...Nb4 line:
    SF 9...Ke7 10.Bd3 +1.39 (Black's best), 9...Kd8 10.Nxa8 Nxc2+ 11.Kd2 Nxa1 12.Bd3 +1.42. 5.Nb5 explorer 163k 57.9%
    (Nf3 56.8%), ChessDB best +0.03.
  - My edits: 7.Nb5 (Nc6 line) explanation + (…9...Ke7 10.Bd3); 6.h4 prose moved out of the parentheses; 7.c3 text fixed
    for his 8.Rb1; 5.Nb5 plan explanation; 8.Bd3 + (8... c4 9. Bb1 Bxb5 10. axb5 Nc7 11. b6); Bb4-line 7.Nb5 explanation
    + (7... Bb6 8. Nd6+) (7... Qa5+ 8. c3). Checks: 2132 W, 0 two-move, planlines 243/243, ownercheck missing 72, deck 0/0.

- **11-27. Owner asked why "against ...c4, Bb1" (Qc2 battery?).** Not the battery (SF builds one either way: Bb1+Qc2 or Bc2+Qb1;
  after 9.Bb1 Qb6 SF even plays 10.Bc2). The reason is concrete: after 8.Bd3 c4 9.Bb1 Bxb5 10.axb5 Nc7 11.b6 axb6 12.Bxc7
  the b1-bishop shuts the first rank, so 12...Rxa1 13.Bxd8 wins (+3.8); with Bc2, 13.Bxd8 Rxd1+ and 12.Bxc7 fails (-1.2), so
  Black takes on b6 safely. SF overall: 9.Bb1 -0.14, 9.Bc2 -0.29; Practical 65.0 vs 55.9 (Bxb5 branch 79 vs 50). NOT a
  general rule: castled positions keep the owner's Bc2 (63.8 vs 61.6; 61.3 vs 60.6). Comment at 8.Bd3 rewritten in v19.

- **11-27. Owner: drill 8...c4 (sharp, needed to stay equal). DONE in v19** (`r11/c4_lines.pgn`, `r11/ops3.json`; Practical
  `r11/pe4..pe7`): 8.Bd3 c4 9.Bb1 [comment: why b1; (9... Qa5 10. Bc2 Bxb5 11. axb5) since on b1 the bishop cuts the a1-rook
  off (10.Nf3?? Bxb5 11.axb5 Qxa1 -3.0; Bc2 70.9 vs Nf3 23.7); (9... Qb6 10. Nf3) 51.8] - 9...Bxb5 10.axb5 [(10... Nb8 11.
  Nf3)] Nc7 11.b6 (81.4 vs Nf3 59.0) [(11... Na6 12. bxa7)] - 11...axb6 12.Bxc7 (Maia 88.6% axb6; trap) / 11...Nb5 12.bxa7
  Nxa7 13.Nf3 (52.1 ~ h4 52.7; SF best) [(13... Nc6 14. Rxa8 Qxa8 15. O-O) (13... O-O 14. Qc2)]; 9...O-O 10.h4 (d7 66.4
  vs Qc2 66.7, SF h4 +0.83 vs +0.27; system pawn storm) [(…11.axb5 Nc7 12. Qc2) (…Nb8 12. Qc2): 67.7/68.9, the Bb1+Qc2
  battery on h7]. Old 8.Bd3 comment removed (line drilled). Checks: 2139 W, 0 two-move, planlines 253/253, deck 0/0.

- **11-27 (latest). Owner corrected the 5.Nb5 explanation: ...c5 does NOT change c7's protection; the point is that the c-pawn
  can never come to c6 to chase a knight on b5 (and after ...Na6, ...a6 is out too).** Fixed in v19 (comments at 4...c5 5.Nb5
  and 4...Bb4 5.Bd3 c5 6.dxc5 Bxc5 7.Nb5, `r11/ops4.json`) and in deck v7 (`deck/jobava_ideas_v7.pgn`, listed; v6 source kept
  as `deck/mkdeck_v6.py`): rule 5 + card 5b (id 15). Checks: 2139 W, planlines 253/253, deck v7 vs v19 0/0 (`deck/check13.txt`).
  CURRENT FILES: `nc3_study_v19.pgn` + `Jobava_simplified_v19.pgn` + `jobava_ideas_v7.pgn` (listed scratchpad), all SENT.
  NEXT: batch 3 = 1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5 (84 single-move branches), then 3...a6 (52), 3...c6 (31), 3...c5 (31), rare
  replies chapter (31), 2...e6 3.Bf4 Bd6 (26), 2...Nc6 3.Bf4 Nf6 (26), 2...c5 chapter (23), 2...c6 3.Bf4 Bf5 (22) ...

- **11-27. BATCH 3 (1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5) DONE, SENT for review** -> `nc3_study_v20.pgn` (listed + scratchpad) =
  v19 + `r12/ops3.json` (from `r12/mk_3.py`: 55 node cuts, 30 comments; existing comments kept, mine appended; only 7.Be2 had one)
  -> fixnotes (93 same). Chapter alone `Jobava_simplified_v20.pgn`, change list `batch3_nf6bf5.md` (listed). Checks: 2021 W (was 2139),
  0 two-move, planlines 310/310, t3 0 partial, ownercheck missing 72 (unchanged), 0 Black-move leaves (`r12/blackleaf.mjs`),
  deck v7 vs v20 0/0 at d18 (`deck/check14.txt`, `deck/jobava_v20s.pgn`); card 3c (5...h6 Bd3) now starts at a clickable-only position (kept).
  Subtree: positions 112->60, replies 199->80, single 84->18 (`audit/inv_nf6bf5*.txt`, tags `audit/tag_3.txt`).
  - Kept drilled beyond the rule: 4...Nc6 5.Nb5 (6%, but 1 in 712, both replies common; 5...e5 gambit), 6...Ne4/Nd7 7.e6 (hard;
    Practical 82.0 vs f3 71.0; 77.5 vs Nf3 73.9), 6...Qa5+ 7.b4 (1 in 2,120, sharp).
  - Changed moves: 5...Nc6 6.Bb5 (d7 62.3 vs Nb5 57.4), 11...Nbd7 12.O-O-O (85.3 vs Rg1 79.9), c6-line 9...Nh6 10.h4 (69.5 vs e4
    67.6; owner's plan), 5...h6 clickables now show Bd3 Bxd3 cxd3. Kept after Practical: 6.Ne5 Nc6 7.h4 (69.1 vs Bb5 60.3), 6...Bg6
    7.h4 (57.9 vs O-O 56.7), c6 5...Nbd7 6.Ne5 (53.7 ~ Bd3 53.6) 6...Nxe5 7.dxe5 (54.5 vs Bxe5 51.9), 10...h5 11.g5 (76.6 vs gxh5
    71.0), 9...Bxd3 10.cxd3 (85.9 vs Qxd3 76.2), cxb4 8.Nc7+ Kd8 9.Bd3 (85.6 vs Nxa8 48.6: ...b3+ discovered check), 7...c4 8.Qa4
    (82.8 vs b3 68.8). Logs `r12/pe3..pe6.log`, SF `r12/sf3.txt`.
  - New ideas in comments: 5...e5 gambit blocks f4-c7 with the e5-pawn, 7.e6 reopens it with tempo; Na6 line: a4-e8 diagonal open
    (Qa4 behind Nb5 = discovered check); 5...Nbd7 6.Nb5 trap (d7-knight blocks Qxd6); 8...Qb2: Rb1 impossible (Bf5 covers b1).
  - ASKED: (1) drill 5...Nbd7 6.Nb5 trap? (2) owner's 7.Be2 comment "O-O transposes into 6... O-O 7. Be2 Nbd7" (we play 6...O-O
    7.g4) - meaning? (3) drill 7...c4 8.Qa4?
  NEXT: owner's review/export of batch 3 -> r10/diff.mjs vs `Jobava_simplified_v20.pgn` -> merge -> batch 4 = 3...a6 (52), then
  3...c6 (31), 3...c5 (31), rare replies chapter (31), 2...e6 3.Bf4 Bd6 (26), 2...Nc6 3.Bf4 Nf6 (26), 2...c5 chapter (23), 2...c6 3.Bf4 Bf5 (22).

- **11-27 (latest). Owner's answers on batch 3 -> `nc3_study_v21.pgn` + `Jobava_simplified_v21.pgn` (listed, SENT) = v20 + `r12/ops4.json`
  (`r12/mk_4.py`, lines `r12/lines4.pgn`: 24 nodes, 12 comments).** Owner: (1) drill ONLY the sharp 5...Nbd7 6.Nb5 Bb4+ line:
  6...Bb4+ 7.c3 Ba5 8.Qa4 Bb6 9.c4 {his: (9... dxc4 10. Bxc4 O-O 11. O-O) (9... a6 10. Nc3 O-O 11. c5)} (all SF best; Practical
  c3 56.8, Qa4 57.4, c4 56.6); the rest (6...Bd6 7.Bxd6 cxd6 8.Nxd6+, 6...Rc8 7.Nxa7, 6...e5 7.dxe5) = clickables on 6.Nb5; added
  (8... c6 9. Nd6+) (+5.3) and (9... c6 10. Nd6+) (+4.0, nothing can take d6). (2) his 7.Be2 comment "O-O transposes..." REMOVED
  (ownercheck: owner comments missing 1 = this, expected). (3) DRILL 7...c4 8.Qa4 (owner: Black can block the diagonal; 9.b3 and
  Nd6+ are far from obvious, "a key reason why we play Nb5 + c3"): 8...Nd7 9.b3 Be7 10.Nd6+ Bxd6 11.Bxd6 and 9...cxb3 10.axb3 Be7
  11.Nd6+ Bxd6 12.Bxd6 (Maia: after 9.b3, cxb3 57.6%, Be7 19.4%; Practical b3 77.2 vs Nd2 61.3, Nd6+ 76.2 vs bxc4 71.4), 8...Qd7
  9.Ne5 (93.2; then double checks). Comments: 7.c3 rewritten (diagonal open; Black has to block), 8.Qa4 (8... Be7 9. Nc7+), 9.b3,
  11.Bxd6/12.Bxd6 (d6-bishop covers f8: no castling; 11...Qb6 12.Ba3), 10.axb3 (Qb6/Rc8 11.Ne5), 9.Ne5. 5.Nf3 comment: Nbd7
  part dropped (now drilled). Checks: 2033 W, 0 two-move, planlines 324/324, t3 0 partial, 0 Black leaves, ownercheck missing 72,
  deck v7 vs v21 0/0 d18 (`deck/check15.txt`). IDEA (not done, offer): the Qa4 / a4-e8 diagonal point could go into deck card 15 (5b).
  NEXT: owner review of v21 (his export -> r10/diff.mjs vs `Jobava_simplified_v21.pgn`) or straight to batch 4 = 3...a6 (52 singles).

## Next (as of 2026-11-24 18:30 UTC)
1. **Jobava simplified review** (the next chapter):
   - The builder export is `nc3_jobava_rd2_f_export.txt` (732 decisions: 401 are the owner's own
     moves, `why base`, with no alternatives scored; 331 are the builder's).
   - `triggers.py` flags 68, in `jobava_triggers.txt`:
     - A, close + learn, keep by fit: 68, 98, 225, 281, 314, 317;
     - B, learn: 14; C, close: 13; D, holdout: 20; E, trap or other: 10; F, thin-lead: 5.
   - The Practical input is ready: `pe/jobava_close.json` (62 positions, 138 candidates).
   - **Run it only after cdbexplore has finished, with a FRESH cache folder** (e.g. `pe/cache_jobava`).
     The Practical cache keeps ChessDB answers for 7 days, so the old cache would hide the deeper
     evals. Then depth 7 on the close ones, plus Stockfish, Maia and the fit checks, as for 1...c5.
   - The owner's own Jobava moves: check them lightly after cdbexplore (`review.mjs`, with the
     ChessDB sleep raised to 1000 ms). Present only a strong trigger, as "your move, the data
     questions it". The explorer cache is being prefetched (`review/prefetch_jobava.log`).
   - The 5.h4 pin (1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6) belongs in the "...g6 setups" chapter's
     review. Decisions #56 and #68 are in that chapter.
2. **cdbexplore** session_01XshYbBNhEqtVFUXeNp51Qv (smaller model, low effort): 147 targets (73 line
   ends, 74 decisions), most reached first, about 10 min each, about a day. It reports after each
   1.9 h run.
3. **PC deeprep session: done (18:26 UTC).** Saved `repertoires/nc3_c5_reviewed.pgn` (100 White
   positions, 208 moves); logged "1...c5 review round 1 (owner accepted)" and the toTree fix in
   NC3_DECISIONS.md; the fix is committed as dee7c20 on its branch claude/sleepy-davinci-efw8dt
   (build.mjs + test/deeprep.js only; 62/62 deeprep tests), NOT pushed. Old build PGNs keep the
   self-naming notes until rebuilt. Its own /compact text is in its 18:26 reply.
4. **The current study is `nc3_study_v4.pgn`** (v2 plus the owner's 7.Bc4, 7...e6 and 7.e5 lines; `c5edit2.mjs`, `c5edit3.mjs`). Pipeline: `gaps/f_input.pgn`, then
   `gaps/regroup4.mjs`, `stripplans.mjs`, `c5edit.mjs` and `fixnotes.mjs`. Apply each chapter's
   edits on top of v2, then run `fixnotes`, whitealts, dups, ownercheck and planlines.
5. **Scripts:**
   - `triggers.py <export>`: the agreed triggers;
   - `review/node.mjs "<path>" [study]`: replies, ChessDB, reach, continuations;
   - `review/critical.mjs`, `review/famcand.mjs <positions.json>` (familiarity),
     `fit.mjs <study> <positions.json>`, `sf/sfcand.mjs <positions.json> <secs> <threads>`
     (Stockfish), `maia/maiascore.ts <positions.json>` (the app's Maia score), `lenstats.mjs`,
     `mainl.mjs`, `subtree2.mjs`;
   - `collect2.py <outdir> <events files>` (prints keyed by file; join with "\n"; a chunk ending
     in a blank line loses it).

## 1...c5 review, round 1 (2026-11-24 evening): sent to the owner
- 11 close calls from the triggers (`triggers.py` on `nc3_c5_rv4_f_export.txt`); Practical d5, then d7
  on 9 (`pe/c5_close*.json`, `--analyse`); Stockfish 90 s (`sf/c5_close.txt`); Maia score
  (`maia/maiascore.ts`); familiarity (`review/famcand.mjs`); fit (`fit.mjs`).
- Presented as close: #5 6.e4 vs 6.Bg5 (rec. keep); #6 5.e4 vs 5.Nf3 (rec. **switch to 5.Nf3**:
  Practical +2.3/+2.5, and it transposes into our lines); #21 6.e4 vs 6.Bg5 (rec. keep, fit);
  #36 cluster 4.e4/5.Qd3/6.Bf4 (rec. keep).
- Kept, not close: #7 7.Bg5, #13 5.Qxd8+, #18 5.Qh4, #26 8.e5, #38 5.Nf3.
- Add 11.Rd5 after …9.O-O-O Qa5 10.Ng5 Ne5 (Practical 81.8%; ChessDB +1.36; 81 games in the
  Lichess filter).
- Line ends proposed for extending: 7.Bc4 (0.24%), 7.Bf4 after 6.Nb5 Ke7, 9.Bxe7, 8.Nf4.
- **Owner (2026-11-24): "I'll trust your judgment. Extend."** Applied in `c5edit.mjs`, giving
  `nc3_study_v2.pgn`; the 1...c5 chapter (100 White positions) is in `c5_reviewed.pgn` and is
  accepted and frozen.
  - 5.Nf3 against 4...g6: 5...Bg7 6.e4 carries the old 5.e4 lines, and 5...Nf6 transposes to the
    4...Nf6 lines.
  - Added 11.Rd5.
  - Extensions: 7.Bc4 Be6/e6 8.Nxf6+; 9.Bxe7 Ndxe7 10.O-O-O (Practical 70.1 vs 66.6 for Bd3;
    Stockfish +1.07 vs +0.85), 9...Qxe7 10.Nxd5; 8.Nf4 Nf6 9.f3 (all level with 9.Bd3), 8...Bb4+
    9.Bd2. 9...Ncxe7 is left uncovered (45 games); 7.Bf4 is not extended (no reply has 50 games).
- **Join notes fixed:** the PC's export wrote 23 "transposes to" notes naming their own line.
  `fixnotes.mjs` rewrites every leaf note to the line where the position continues (the largest
  subtree). Run it after `regroup4` from now on.

- **11-27 (latest, owner on v21).** (1) 8.Qa4 Nd7 9.b3: drill only the MOST LIKELY Black reply (9...cxb3 10.axb3 ...), not both
  orders -> 9...Be7 becomes a clickable. (2) Deck: Nb5 is already explained; ADD a card explaining c3 (not a common move in the
  repertoire): the Qa4 / a4-e8 diagonal behind Nb5. (3) Go on with batch 4 = 1.Nc3 d5 2.d4 Nf6 3.Bf4 a6.
  RULE REFINED (binding): reach 1 in 2,000 + 10% share is a GUIDE, not absolute. Also drill for sharpness, hard-to-find moves,
  or a key idea. NEVER remove the most common reply from drilling.
  DONE so far: `nc3_study_v22.pgn` (scratchpad) = v21 + `r13/ops5.json` (`r13/mk_5.py`): 9...Be7 cut -> clickable on 9.b3
  (9... Be7 10. Nd6+ Bxd6 11. Bxd6); 12.Bxd6 comment self-contained + (12... Qb6 13. Ba3) (12... Nc7 13. Ne5) (Practical
  `r13/pe1*`: Qb6 41.6% -> Ba3 74.9%, Nc7 22.9% -> Ne5 90.5%); 7.c3 comment now starts with "c3 takes the c-pawn off the d1-a4
  diagonal" (the c2-pawn blocks Qa4: 7.Qa4 is illegal before c3); 9.Ne5 "Nc7+ or Nd6+ is a double check" (exact). 2031 W,
  0 two-move, planlines 325/325, 0 Black leaves, ownercheck 72/1. DECK v8 (`deck/jobava_ideas_v8.pgn`, source `deck/mkdeck.py`,
  v7 source kept as `deck/mkdeck_v7.py`): new card 32 "5e. c3 opens the way to a4" (after 6...Na6; d20 c3 +0.74, Be2 -3.7%;
  Maia c3 42%; evidence `deck/ev/c32.txt`), 8...Qd7? marked; rule 5 + "After ...Na6, c3 also frees the queen's way to a4...".
  check vs v22 0/0 d18 (`deck/check16.txt`, rep `deck/jobava_v22s.pgn`).
  BATCH 4 in progress (`r13/`): inventory `audit/inv_nf6a6.txt` (46 pos, 98 replies, 52 single), tags `audit/tag_4.txt`, SF
  screen `r13/sf4.txt` (1 flag: c5-line 11.Bd3 +2.95 vs Bh3 +3.45), Practical `r13/pe2.json` -> `pe2_out.json`/`pe2.log`,
  cut draft `r13/cuts6.py` (35 node cuts). Rule applied: the most common reply at every kept position stays (literal reading).
  `r13/mccut.mjs`: batches 1-3 cut the most common reply at 14 positions (1 = owner's own 6.Nb5 choice) -> ASK owner to restore.
- **11-27 (latest). BATCH 4 (1.Nc3 d5 2.d4 Nf6 3.Bf4 a6) DONE, SENT** -> `nc3_study_v22.pgn` (FINAL, listed + scratchpad) = v21 + `r13/ops5.json`
  (Qa4 trim) + `r13/ops6.json` (`r13/mk_6.py` + `r13/cuts6.py`: 36 node cuts, 33 comments; 4.e3 owner note kept + mine appended).
  Intermediate v22 (before batch 4) kept as `r13/v22_pre4.pgn`. Chapter alone `Jobava_simplified_v22.pgn`, list `batch4_nf6a6.md`,
  deck `jobava_ideas_v8.pgn` (listed). Checks: 1978 W, 0 two-move, planlines 388/388, t3 0 partial, 0 Black leaves, ownercheck 72/1,
  deck v8 vs v22 0/0 d18 (`deck/check17.txt`; only card 9 = 3c off-repertoire, known). Subtree 46->33 positions, 98->45 replies,
  52->12 single (`audit/inv_nf6a6_after.txt`). Practical `r13/pe2..pe4`, SF `r13/sf4.txt` (sfscreen.mjs = new one-process screen).
  Drilled beyond the guide: 7...Nxe5 8.gxf5 (dxe5? Nxg4 -0.8), 5...e6 6.Na4 (Nxc5 not Practical's Bxb8: 1 game), 7...Bxc5 8.Bxf6 gxf6
  9.Qxd5 (8...Qxf6 clickable, like the owner's "keep the most likely"). Changed in clickables: 10...Ne4 11.Qd3 (Nbd7 line), 5...Qa5
  6.Nf3, 9...d4 10.exd4. ASKED: restore the 13 most-common replies cut in batches 1-3 (list in batch4_nf6a6.md; recommend yes).
  NEXT: owner's answer/review -> then batch 5 = 1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 (31 singles), then 3...c5 (31), rare replies chapter (31),
  2...e6 3.Bf4 Bd6 (26), 2...Nc6 3.Bf4 Nf6 (26), 2...c5 chapter (23), 2...c6 3.Bf4 Bf5 (22).
- **11-27 (owner on batch 4): "Forget 'the most common reply stays drilled' - use your judgement to decide for each situation."**
  (e.g. after a rare sideline like 5...Nbd7 6.Nb5, only the difficult 6...Bb4+ is drilled). So: NO restore of the 13 batch 1-3
  lines (question withdrawn); re-judge batch 4's lines that were kept only by the literal rule.
- **11-27 (latest). v23 SENT** (`nc3_study_v23.pgn` + `Jobava_simplified_v23.pgn` + `v23_judgement.md`, listed) = v22 (as sent, copy
  `r13/v22_final_sent.pgn`) + `r13/ops7.json` (`r13/mk_7.py`, lines `r13/lines7.pgn`: 6 cuts, 16 nodes, 13 comments). Judgement
  replaces the literal rule: batch 4 cut 10...Ng8 11.Bh3 (Nbd7 line), 10...Nfd7.. (c5 line), 7...Bg6.. (Bd6 line), 6...Nxe5 7.dxe5
  (Nc6), 6...Bxd3 7.cxd3 (h6), 7...Bg6 8.g4 (Nc6 Bg4) -> clickables; DRILLED 7...h6 8.g4 Bg6 9.Bxg6 fxg6 10.Qd3 (+1.9, Practical
  78.1). Restored from batches 1-3 (hard follow-ups): 8.Nc7+ Kd8 9.Bd3; 7.e6 Bd6 8.exf7+ Kxf7 9.Qxd5+; 9.Rb1 b6 10.Bxf5 exf5 11.Qd3
  (Practical `r13/pe5*`). Others (10) stay clickable. Checks: 1978 W, 0 two-move, planlines 387/387, t3 0 partial, 0 Black leaves,
  ownercheck 72/1, deck v8 vs v23 0/0 d18 (`deck/check18.txt`). Subtree 3...a6: 28 pos, 40 replies, 12 single.
  NEXT: owner review of v23 -> batch 5 = 1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 (31 singles).
- **11-27 (latest). Owner: will review batch 4 later together with batch 5. START BATCH 5 = 1.Nc3 d5 2.d4 Nf6 3.Bf4 c6** on v23
  (work dir `r14/`).
- **11-27 (latest). BATCH 5 (1.Nc3 d5 2.d4 Nf6 3.Bf4 c6) DONE, SENT** -> `nc3_study_v24.pgn` + `Jobava_simplified_v24.pgn` + `batch5_nf6c6.md`
  (listed) = v23 + `r14/ops8.json` (`r14/mk_8.py`: 18 node cuts, 15 comments; owner note at 6.Qf3 kept + mine appended). No drilled move
  changed. Kept: owner lines (6...Qc7, 7.Qxf4, 7.Bd3 e6 ... 12.Nge2 = Nh3 88.2), 7...h6 8.Bd3 / 7...h5 8.g5 (C via 5...Bf5 order), 6...O-O
  7.h5 Nxh5 8.Rxh5 gxh5 9.Qxh5 f5 10.Nf3 (sharp, rule 10; 6...h5 33% made clickable = owner's Bb4+ pattern), 4...Nbd7 5.Bd3 e6 6.g4
  (Practical g4 61.6 / a3 60.6 / Nf3 58.6; SF -0.22 flag), 4...Qb6 5.Na4 Qa5+ 6.c3 (Qd2 -4). Practical `r14/pe1*`, SF `r14/sf5.txt`.
  Checks: 1944 W, 0 two-move, planlines 416/416, t3 0 partial, 0 Black leaves, ownercheck 72/1, deck v8 vs v24 0/0 (`deck/check19.txt`).
  Subtree 35->22 positions, 68->33 replies, 31->10 single. Owner reviews batches 4+5 together.
  NEXT: batch 6 = 1.Nc3 d5 2.d4 Nf6 3.Bf4 c5 (31 singles), then rare replies chapter (31), 2...e6 3.Bf4 Bd6 (26), 2...Nc6 3.Bf4 Nf6 (26),
  2...c5 chapter (23), 2...c6 3.Bf4 Bf5 (22).
- **11-27 (latest). NEW HAND-OFF (owner): the data repo replaces download/import/export.** Data repo cloned at /home/user/repworks-data
  (skAeglund/repworks-data, push works; shallow, fetched --depth=1000). Owner reviews in study "asdf" = `studies/JX3v8kXM/` (study.json:
  ONE chapter, k2kyJU1R "Jobava simplified"). Repworks main pulled (bd98f6b): `scripts/chapter-diff.ts` (PLAN §5.214).
  Found: the owner's chapter was imported at aea2f0d (11-27 14:05 +0100) = EXACTLY my v20 (not v21); his edits since = his own 8.Qa4 ...
  12.Bxd6 and 5...Nbd7 6.Nb5 ... 9.c4 lines (both already in mine) + shapes at 7.c3 (Ga4, Gd1a4, Gf6h5, Gc5c4) -> carried over.
  Merge tool `r15/build.ts <repo chapter file> <id> <base pgn> <mine pgn> <out>` = 3-way, node by node and FIELD by field (comments,
  shapes, nags): the owner's changed field wins, conflicts reported; writes with repworks parse.ts + chapterFileText, repo headers/id kept.
  `r15/roundtrip.ts`: repworks' writer reproduces the repo file byte for byte. PUSHED 0d0faa1..c35665a (3 commits, only k2kyJU1R.pgn):
  bb9b630 "session: Jobava batch 3 answers" (= v21 + Qa4 trim = `r13/v22_pre4.pgn` + arrows), 9c84ff4 "session: Jobava batch 4" (= v23
  + arrows), c35665a "session: Jobava batch 5" (= v24 + arrows). validate-data 0 errors (README warning pre-existing). Change lists
  `diff_batch3_answers.md`, `diff_batch4.md`, `diff_batch5.md` (listed scratchpad). Chapter checks on the written files: 862 W (chapter),
  0 two-move, planlines 387/387, ownercheck 72/1, 0 Black leaves, t3 0.
  MASTER for Jobava simplified is now the repo file (copy `Jobava_simplified_master.pgn` = c35665a); the other 3 Jobava chapters (...g6
  setups, 2...c5, rare replies) exist only in `nc3_study_v24.pgn` (NOT in "asdf": ask the owner where before batches touching them).
  WAITING: owner confirms the version arrived (else revert my 3 commits), then reviews; DON'T PUSH while he reviews. After "done":
  `git -C ../repworks-data pull` then `node scripts/chapter-diff.ts ../repworks-data@c35665a ../repworks-data --study JX3v8kXM`, merge
  into the master with r15/build.ts (base = c35665a's file), then batch 6 (3...c5) written the same way.
- **11-27 (latest). REVIEW PANEL hand-off (owner's revised prompt; repworks main 38f1e21: chapter-diff --review, review-answers.ts,
  PLAN §5.216; §5.217 nested clickable lines - planlines still 387/387 on the pushed chapter).** Chapters were already pushed
  (bb9b630/9c84ff4/c35665a). Added review lists with my notes (`r15/mknotes.py` -> `r15/notes-3a.json`, `notes-4.json`, `notes-5.json`;
  notes attach to an item by its own move: reply = new move, added = first added move, removed = first removed move, comment = the move;
  others become questions): review/JX3v8kXM/batch-3-answers.json (11 items, 7 with words), batch-4.json (74, 48), batch-5.json (34, 24).
  Commits 1c6b216 / 40a0aae / b0bd480 "session: Jobava batch N, review list", PUSHED c35665a..b0bd480; validate-data 0 errors.
  AFTER the owner says done: pull; `node scripts/review-answers.ts ../repworks-data --study JX3v8kXM` (No + notes first);
  `node scripts/chapter-diff.ts ../repworks-data@b0bd480 ../repworks-data --study JX3v8kXM` (all his app edits); merge into the master with
  r15/build.ts (base = the chapter file at c35665a/b0bd480); then `git rm review/JX3v8kXM/<list>.json` for merged lists in the next push.
  Questions not tied to a move (in chat): where the other 3 Jobava chapters go; whether to put the idea deck in the repo.
- **11-27 late (owner): new chapters in "asdf"; deck into his new reference study "1. Nc3 Jobava Ideas" (PjxBtS11); "119 items too
  much": split by priority (low = I'm confident he approves; medium = likely; high = unsure / big impact).** His answers (desktop,
  b84ca80): batch-3-answers 11 OK (note: "c8-bishop on f5" wording); batch-4 7 OK (the restored lines + 4.e3 comment), note on 8.Nc7+:
  MY COMMENT WAS INACCURATE (b3+ came with and without Bd3, Nd2 blocks in both) - he wrote the real reason himself: 9.Bd3! (glyph),
  9...b3+ 10.Nd2 bxc2 11.Bxc2 "glad we went Bd3", and (9. Nxa8?? b3+ 10. Qd2 Qa3 ...) with arrows; changed (12... Qb6 13. Ba3) to Bxa6.
  PUSHED b84ca80..8eb275a: 05f5b15 fixes (7.c3 "bishop on f5"; 12.Bxd6 text now explains Bxa6: bxa6 Qxa6 pawn up, ...Qxd6 Bxb7 hits a8),
  2889878 three chapters added to asdf (OMZ5HrTn "Jobava: ...g6 setups", XAB9LmOI "Jobava: 2...c5", GwwMeXxP "Jobava: rare replies";
  study.json order k2kyJU1R first), 76b3dd5 deck v8 into PjxBtS11 (34 chapters; his empty placeholder "Chapter 1" ybCUQDDk removed),
  8eb275a review lists by priority (`r15/priority.py`): priority-high (7), priority-medium (26), priority-low (73; incl. the 2 fixes and
  3 new chapters); batch-3-answers/batch-4/batch-5 lists deleted (answered items merged; unanswered moved). Panel order = created desc,
  so high has the newest timestamp. Scripts: `r15/fixes.ts`, `r15/addchapters.ts` (jobava|deck mode, crypto ids via freshId).
  MASTER = repo (copy `Jobava_simplified_master.pgn` = 8eb275a); the other 3 Jobava chapters now also live in the repo.
  NEXT after his review: review-answers + chapter-diff from 8eb275a; merge; git rm answered lists; then batch 6 (3...c5).
- **11-27 late. Owner challenged my reasoning "level/quiet -> clickable"** (7...Bg6 8.g4 in the a6-Nc6-Bg4 line; 6...h5 7.Nf3 Bg4 8.Qd2 in
  the c6-g6 line): "We're used to having an advantage - when the position gets equal, it doesn't mean the variation shouldn't be
  drilled. Often it points to the opposite." RULE (binding): an equal eval is never a reason against drilling; a common reply that leaves
  us level is often exactly the line to know. Only these two decisions used that reasoning (grep of notes/change lists). 6...h5 is also
  idea card 26's line. PLAN: after his review, restore both as drilled (7...Bg6 8.g4 and 6...h5 7.Nf3 Bg4 8.Qd2), keep 7...h6 and
  6...O-O drilled too, fix the 7.h4 / 6.Bd3 comments, add end comments. Not pushed (owner reviewing).
- **11-27 late. Owner: "Go ahead".** His review since 8eb275a: High all answered (4 OK; No on removing 7...Bg6 8.g4, 4...Bg4 "Bring
  it back", 6...h5 line); Medium 3 OK + No on 7...Bxe5 8.dxe5 ("only moves needed") which he drilled himself (8...Nxg4 9.f3 Nh6 10.e4 +
  clickables); his edits: nested branch in my 7.h4 clickable (8...Bxd3 9.Qxd3 e6 10.O-O-O Bd6 11.Nge2), 10.Nf3 "castle and bring the rook
  to the h-file" + extended (10... Nd7 11. O-O-O Nf6 12. Qh3 Ne4 13. Rh1), arrows at 4 moves. PUSHED aa8ecfe..04e139e: aba5586 chapter
  (`r16/restore.ts`, `r16/fix2.ts`): 7...Bg6 8.g4 back (after 7...h6, which stays main), 4...Bg4 5.f3 Bh5 6.h4 / Bf5 6.g4 back, 6...h5
  7.Nf3 Bg4 8.Qd2 back (after 6...O-O); end comments from Practical `r16/pe1*` (6...h6 7.Bd3; 6...Bg6 7.g4 / 7.h4; 7...O-O|Nbd7 8.Qd2 (SF);
  8...Nbd7 9.Ng5, 8...Bxf3 9.gxf3); 4.e3 Bg4 sentence and 6.Bd3 h5 clickable removed. Checks: 873 W, 0 two-move, planlines 397/397,
  ownercheck 72/1, 0 Black leaves, roundtrip identical. 04e139e lists: brought-back (5 items, 3 notes) added, priority-high deleted.
  Open lists now: brought-back (5), priority-medium (22 open), priority-low (73).
- **11-27 late. HAND-OVER (owner: "so the audit no longer depends on this session"; repertoire unchanged).** repworks branch
  `claude/audit-tools` (b43d413 + 0b73656): `tools/audit/` = 38 generic scripts in their scratchpad layout + README (one line each, the
  batch workflow, settings); no study lines (one example line in audit/edit.mjs redacted to 1.e4 e5 2.Nf3). Data repo 3ea990f:
  notes/JX3v8kXM/ rules.md, ledger.md (subtree table + container-only list), nc3_study.pgn (10 chapters: 4 Jobava from repo + 6 from
  v24; 1955 W, 0 two-move), deck/ (mkdeck.py, fens.txt, cards.json), owner_original_jobava_simplified6.pgn. validate-data 0 errors
  (notes/ = warnings, app ignores). Not handed over: caches (review/cache.json 3.6MB, pe/cache_jobava 19MB, pe/cache_jobava_b 26MB,
  deck/cache 13MB), .lichess_token2, ort folder, this journal, per-batch ops builders/notes, old versions/logs.

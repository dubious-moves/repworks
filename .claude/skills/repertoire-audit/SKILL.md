---
name: repertoire-audit
description: Audit one part of the owner's opening repertoire (a study in his data repo) and hand it to him for review - merge his answers and edits from the last round first, then take one subtree, decide what is drilled and what becomes a clickable line in a comment, check every move and every claim with the explorer, Practical with Maia, Stockfish and the difficulty measure, have a second reader go over the result, and push the chapter, one review list (with what he should look at first marked) and the updated ledger, then start ChessDB's exploration of the subtrees to come. The repertoire's own rules and state are in the data repo, notes/<study id>/ (rules.md, ledger.md, audit.json); the tools are scripts/audit/audit.ts. Use when the owner asks to audit, review or continue the repertoire review, to merge his review answers, to run "the next batch", or to review a chapter that has had none, and when a scheduled task starts a session for an unattended run (its section says what to do when nobody is there to ask). PLAN.md sections 5.219 and 5.220.
---

# Repertoire audit: one batch, from the rules to the push

The owner builds a repertoire he will drill move by move, and reviews it with a session one small
part at a time. A **batch** is one such part: his answers to the last round merged, one subtree
audited, the result pushed to his data repo with a review list he answers in the app. This skill is
the process; it is the same for any study. What is particular to a repertoire (its rules, its
state, his corrections) is in the data repo and is read first, every time.

## Where everything is

| What | Where | Kept by |
|---|---|---|
| The tools | `scripts/audit/audit.ts` in repworks (`--help` lists the commands) | code, tested |
| The study's chapters | `studies/<sid>/<cid>.pgn` in the data repo | the app, and `audit.ts apply` |
| The review lists | `review/<sid>/<name>.json` | `scripts/chapter-diff.ts --review` |
| **The rules** | `notes/<sid>/rules.md` | by hand: the owner's word, with his corrections |
| **The state** | `notes/<sid>/ledger.md` and `notes/<sid>/audit.json` | `audit.json` by hand; the ledger's tables by `audit.ts ledger` |
| His corrections, by type | `notes/<sid>/corrections.md` | by hand, when his answers are merged |
| A batch's ops, notes and evidence | `notes/<sid>/batches/<name>/` | the batch |
| The lock: who is writing to the study now | `notes/<sid>/lock.json` | `audit.ts lock` and `unlock` |
| ChessDB explored: the files, records and reports | `notes/<sid>/cdbexplore/<name>.pgn`, `.explore.json`, `.md`, `.json` | `audit.ts explore-start`, and the exploring session with `explore-run` |
| How each batch's review came out | `audit.json`'s `batches`, the ledger's "Batches" table | `audit.ts tally`, `audit.ts ledger` |

`audit.json` holds what the scripts need: each chapter's depth (how many plies name a subtree) and
the owner's own file to compare with, each subtree's state (`todo`, `open`, `closed`), the checks'
targets, the replies he decided not to drill, and lines flagged for a later batch. The ledger's
tables, the order of what is left, the open lists with his answers so far and the base commit are
written from it and from the chapters, never typed. Nothing of a batch goes into repworks: the
repertoire's state is in one place. The owner agreed that his 1.Nc3 repertoire may be quoted in
this public repo (DECISIONS.md, 2026-11-28); course content never.

Where `rules.md` and this skill disagree, `rules.md` holds.

## Before the first command

- The data repo beside repworks (`../repworks-data`): attach it with `add_repo` (push access) and
  clone it. A shallow clone holds too little history for the base: `git -C ../repworks-data fetch
  --depth=500 origin main`.
- `npm ci` in repworks: it brings the audit's own engines (Stockfish 19 for the screens and the
  checks of comment lines, the vendored Stockfish 18 lite for the difficulty measure). For
  `scripts/ideas/cv.ts` (single positions, and the deck check) a native Stockfish: `apt-get update
  && apt-get install -y stockfish` (the update first, or the install finds no package), then `export
  STOCKFISH=/usr/games/stockfish`. The environment's setup script does both installs.
- For Practical with Maia: `mkdir -p ~/ort && (cd ~/ort && npm i --ignore-scripts onnxruntime-node)`,
  then `--ort-node ~/ort`.
- Tokens: `LICHESS_TOKEN`, `LICHESS_TOKEN2`, `LICHESS_TOKEN3` are in the environment, each its own
  explorer bucket (about 16 requests a minute). Never print one, never write one to a file.
- A cache folder outside every repo (`--cache ~/cache/a`), shared by Practical, the inventory, the
  close calls and the deck check. Fill it from the store earlier sessions left: attach the testing
  data repo (its name is in `REPWORKS_TESTING_DATA`) with `add_repo` (push access), clone it beside
  repworks, and `node scripts/audit/audit.ts cache-pull --store ../<testing repo>/audit-cache --cache
  ~/cache/a`. What the store lacks is fetched as you go (the explorer answers 16 requests a
  minute); a missing answer is slow, never wrong.
- For a run of cdbexplore on demand (step 4): q_extension beside repworks, at the commit that logs
  ChessDB's refusals, read-only (change and push nothing there): `git clone --branch
  claude/gifted-cori-2whjds https://github.com/skAeglund/q_extension ../q_extension && git -C
  ../q_extension checkout -q a396b4d`. It is a public repo and needs no install.

## The rules that matter most

1. **Read first.** `rules.md`, `ledger.md` and `corrections.md`, whole, before anything else. They
   are short, and every mistake in `corrections.md` was made by a session that knew chess.
2. **Every claim rests on a tool's output.** That a move is best, loses, wins a pawn, traps a
   piece, is hard to find: Practical, Stockfish, Maia or the line played out, never memory. A
   comment's claim carries its proof as a clickable line that Stockfish agrees with. When unsure,
   write less.
3. **A tool that could not see something says so, and so do you.** `NOT COMPLETE`, `NOT RUN` and
   `MISS` in a tool's output are findings. (An earlier scan read only its cache, skipped what the
   cache lacked, and reported "only 1 left".)
4. **His lines and words are his.** Kept, deep tails too; your text goes after his; changing his
   words is a question to him, not an edit.
5. **Full lines.** In everything he reads (notes, lists, messages), a line is written in full from
   move 1. Inside a chapter's comment, a clickable line in parentheses continues from the commented
   move.
6. **One session writes to the study at a time**, and never while he is reviewing. `audit.ts
   status` says whether both hold; the lock (`audit.ts lock`) is taken and pushed before anything
   under `studies/` or `review/` is written, and released at the end. `apply` and `chapter-diff.ts
   --review` refuse without it.

## One batch

### 0. Is there work, and the lock

```sh
git -C ../repworks-data pull
node scripts/audit/audit.ts status ../repworks-data --study <sid>
node scripts/audit/audit.ts lock ../repworks-data --study <sid> --session <this session's id> --for <the batch's name>
```

- `status` first, before reading anything else: its first line says whether there is work (no
  list with a position still open, the owner quiet for 30 minutes, nobody else holding the lock,
  ChessDB's exploration of the next subtree finished) or why not. He asked you by hand and it says
  there is none: tell him its line; if he says he is done although positions are open, go on
  (those are counted as not answered).
- `lock` writes `notes/<sid>/lock.json`, commits it and pushes it. `REFUSED`: another session
  holds it (younger than 6 hours): stop, and say so. A stale lock (older) is a session that died:
  the command takes it over and says so. A batch that takes longer than 6 hours renews it with the
  same command. The session's id: `get_session` with no id (claude-code-remote), or the
  environment variable `CLAUDE_CODE_REMOTE_SESSION_ID`.
- Release it at the very end, whatever happened (`audit.ts unlock`, step 9), also when the run
  stops early.

### 1. Merge his answers and edits

```sh
node scripts/audit/audit.ts base ../repworks-data --study <sid>          # the commit his edits are counted from
node scripts/review-answers.ts ../repworks-data --study <sid>            # No and notes first
node scripts/chapter-diff.ts ../repworks-data@<base> ../repworks-data --study <sid> --max-lines 0
```

- If a list still has unanswered items and he has not said he is done, **stop here**: say what is
  open and ask. Don't write to `studies/` or `review/` while he reviews; `notes/` is yours.
- Read each answer as `rules.md` says (there: OK keeps the change; No without a note undoes it; No
  with a note does what the note says; a note alone is an instruction or a question; his own edit
  of an item wins). His edits in the app are already in the chapter: read them, learn from them,
  and never undo one.
- What his answers ask for becomes ops (`notes/<sid>/batches/answers-<date>/ops.json`), applied as
  in step 6, with the same checks. A change he asked for that needs a decision goes through steps
  3 to 5 like any other.
- Write every No, note and edit into `corrections.md` under its type (move, drilled or clickable,
  wording, format), with the full line, his words, and its **kind** at the end: the reason in a
  few words, the same words as an earlier entry when the reason is the same (`Kind: an equal eval
  given as a reason`). The file's head lists the kinds so far.
- **A second correction of one kind is a rule to propose.** When the kind you just wrote is in the
  file for the second time and no rule of `rules.md` already says it, write the rule's wording as
  you would put it into `rules.md`, and ask him in the next list: a note with `"first": true` at a
  move of that batch where the rule applies ("A rule for `rules.md` §3: … Your corrections of
  <date> and <date> both say it. Accept?"). Note the proposal under "Rules proposed" in
  `corrections.md`, so it is asked once. His OK: the rule goes into `rules.md` with the date, and
  the entry says so; his No or his wording: as he says.
- **The tally, before a list is removed:** `node scripts/audit/audit.ts tally ../repworks-data
  --study <sid> --list <name>` for each list. It writes into `audit.json` how the review came out
  (positions, OK, No, notes, positions he edited himself, how many were marked "look first" and
  how many of those he corrected); `audit.ts ledger` writes the "Batches" table from it. Read the
  table: a share of corrections that does not fall, or marks he mostly waves through, says the
  judgement or the marks are off, and the report says so.
- Then `git rm` each list whose answers are merged, update `audit.json` (a subtree he accepted is
  `closed`), and commit: `session: <study>, answers merged`.

### 2. Choose the subtree

The ledger's "What is next" (`audit.ts ledger` writes it: most single-move branches first). A batch
covers at most about 25 positions where the opponent is to move; a larger subtree is two batches,
split at a move. Make `notes/<sid>/batches/<name>/` and write `git -C ../repworks-data rev-parse
HEAD` into its `base.txt`: the ops will be written against that commit.

### 3. See what is there

```sh
A="node scripts/audit/audit.ts"; D=../repworks-data; B=$D/notes/<sid>/batches/<name>
$A inventory $D --study <sid> --chapter <cid> --line "<the subtree's moves>" --cache ~/cache/a --out $B/inventory.json > $B/inventory.txt
$A screen    $D --study <sid> --chapter <cid> --line "<moves>" > $B/screen.txt
$A difficulty $D --study <sid> --chapter <cid> --line "<moves>" --sf-cache ~/cache/sf --out $B/difficulty.json
$A judge     $D --study <sid> --chapter <cid> --inventory $B/inventory.json --difficulty $B/difficulty.json > $B/judge.txt
$A lines     $D --study <sid> --chapter <cid> --line "<moves>"            # the comments already there
```

- **inventory**: every position with its drilled replies: share, games, reach over all move orders,
  our answer, and tags C (common), O (in his own file), S (a single-move branch), and the replies of
  2% or more that are not drilled. It must end without `NOT COMPLETE`.
- **screen**: Stockfish 19 on every move of ours; `FLAG` when ours is 0.50 or more behind. A flag
  is a prompt for Practical, not a verdict.
- **difficulty**: per move of ours, how likely a player is to find it and what the natural moves
  cost; per reply, the hardest of our next three moves. It runs the engine its class limits were
  set for, at a fixed node count, so its numbers are the same on every run; give them in notes as
  "found by x% of 2000 players, the natural move y costs z win%". A number within about 1 of a
  class limit is a judgement: for such a move run the line again with `--moves "<the full line>"
  --engine sf19` as a second opinion, and give both numbers in the note. Never use another
  engine's number for the class itself: the limits belong to the measure's own engine.
- **judge**: the guide and the measure side by side for every reply. A suggestion, not a verdict.
- **ChessDB explored ahead**: the ledger's "ChessDB explored" table names the exploration of this
  subtree; read its report, `notes/<sid>/cdbexplore/<name>.md` (the exploring session wrote and
  pushed it). A move of ours it lists as 0.30 or more behind ChessDB's best is treated like a
  `FLAG` of the screen: to Practical. A position where ChessDB's best move changed tells you an
  earlier decision there may have rested on a shallow eval. Not finished (positions left), or
  none started: say so in the report; an attended run goes on with what there is.

### 4. Settle the moves

Every flagged move, every move you would change, and every line end goes to Practical with Maia:

```sh
$A practical $D --study <sid> --positions $B/practical/p1.json --cache ~/cache/a --out $B/practical/p1_out.json --ort-node ~/ort   # --depth 7 when candidates are close
```

It runs `scripts/practical.ts` with the study's own flags from `audit.json` ("practical"), all of
them: don't call the script bare for a decision. The positions file is `[{ "moves": "<the full
line>", "candidates": ["ours", "other"] }]`; keep it and the report in `practical/` (a report names
its settings). A flag is settled by Practical, then by the repertoire's
own tests in `rules.md` (for the 1.Nc3 study: the system test, and no pure engine moves outside
sharp only-move lines). A Practical edge that rests on no games is said to be so.

**A decision that hangs on a shallow ChessDB eval is explored first.** After its run, `practical`
prints ChessDB's depth for every candidate it was asked about, `SHALLOW` where the stored line is
under 10 plies (`--sf` adds Stockfish, and its disagreement by 0.5 or more); `close-calls` says it
on a flag that rests on ChessDB; `audit.ts chessdb --moves "<the full line>" --candidates "a,b"
--cache ~/cache/a --sf` asks about one position. When the candidates are close and the choice
would turn on such an eval:

```sh
$A explore-pgn --moves "<the full line to the position>" --candidates "ours,other" --out $D/notes/<sid>/cdbexplore/od-<batch>-1.pgn
$A explore-run $D --study <sid> --names od-<batch>-1 --hours 0.3 --minutes 8 --again     # a background command: about 15 minutes
$A chessdb $D --study <sid> --moves "<the full line>" --candidates "ours,other" --cache ~/cache/a --fresh --sf
```

then Practical again: the commands drop every ChessDB answer cached before the exploration, so
the new run decides on the deeper evals (the same holds after an exploration ahead: you need do
nothing). `--short-line 99` on `explore-run` when the stored line is long and only Stockfish
disagrees. Still `SHALLOW` afterwards: Stockfish decides, and the note to the owner says that
ChessDB had no deep line there. The files stay in `cdbexplore/` as the batch's evidence.

### 5. Judge each reply

By `rules.md`, reply by reply: drilled, a clickable line in the comment on our move before it, a
plain sentence, or dropped. The tools give the numbers; the judgement is yours, in the owner's
terms. For each position write down the reason in a sentence: it becomes the note he reads.
A drilled line ends on our move, with the likely replies as clickables in its last comment
(Practical `--replies` names them). Lines of his that fall under the guide stay unless he said
otherwise.

### 6. Write and apply the ops

`ops.json` (the format is in `scripts/audit/ops.ts`):

```json
{ "chapter": "<cid>",
  "cut":      [{ "at": "1. Nc3 d5 2. d4 ...", "mode": "node" }],
  "lines":    ["1. Nc3 d5 2. d4 ... 9. Bd3 { A comment on a new move. } 9... b3+ 10. Nd2"],
  "comments": [{ "at": "1. Nc3 ...", "append": "Against ...h6, h4 first: (6... h6 7. h4)" },
               { "at": "1. Nc3 ...", "replace": ["old words", "new words"] }],
  "glyphs":   [{ "at": "1. Nc3 ...", "nags": [1] }],
  "first":    ["1. Nc3 ... the reply that becomes the main one"] }
```

`append` puts your text after his; `set` replaces a comment and is for your own comments only.

```sh
$A apply $D --study <sid> --ops $B/ops.json --base $(cat $B/base.txt) --dry-run     # then without --dry-run
$A check $D --study <sid> --deck --cache ~/cache/a > $B/checks.txt
node scripts/validate-data.ts $D
```

- `apply` builds the chapter from the base and the ops, carries his edits since the base onto it
  (his field wins; every `CONFLICT` line is read and resolved, his way), rewrites the "transposes
  to" notes, and writes the files in the app's own form. An op that doesn't apply is an error and
  nothing is written. A base that is behind the session's own later commit is refused: use the
  commit it names.
- `check` must meet every target, the deck check among them (`--deck`). A `MISS` is fixed, or
  explained to the owner before a target in `audit.json` is changed; never changed quietly.

### 7. Check your own words

```sh
$A lines $D --study <sid> --since $(cat $B/base.txt) --sf > $B/lines.txt   # every new comment's lines, with Stockfish
$A lint  $D --study <sid> --since $(cat $B/base.txt)                       # moves outside parentheses, prose inside
$A lint  --notes $B/notes.json                                             # partial lines in your notes
```

Read `lines.txt` against each comment: the line shows what the words claim, the score moves the way
the words say, and a `FLAG` on a move of ours is either the point of the line (the natural move
that loses) or a mistake. `scripts/ideas/cv.ts engine`, `grade` and `look` answer a single position.

### 8. The second reader

Before anything is committed, a fresh reader goes over the batch: a subagent that has not seen your
reasoning (the Agent tool, a general-purpose agent, not a fork). Give it only the rules and the
diff:

```sh
node scripts/chapter-diff.ts $D@$(cat $B/base.txt) $D --study <sid> --max-lines 0 --no-links > $B/diff.md
```

> You are the second reader of one batch of an opening repertoire audit. Read
> `<path>/rules.md` in full, then `<path>/diff.md` (what the batch changed, every line in full),
> `<path>/notes.json` (the words the owner will read on each change) and `<path>/lines.txt`
> (Stockfish on every new comment's lines). Check, item by item:
> 1. **Every claim a new or changed comment or note makes** ("loses", "wins a pawn", "the only
>    move", "traps", "hits", "is forced", a number): is there a line that shows it, and does
>    Stockfish agree? Check for yourself, from the repworks checkout at `<path>`:
>    `node scripts/ideas/cv.ts engine "<moves from move 1>" --depth 20 --lines 3`,
>    `... grade "<moves>" <move> <move>`, `... look "<moves>"` (STOCKFISH is set).
> 2. **The format rules:** in notes and messages every line in full from move 1, never cut; in a
>    comment, moves inside parentheses and prose outside; one comment a position, a guideline
>    sentence first.
> 3. **Each changed move** against the rules' tests for choosing moves (section 2 of the rules):
>    does the note give a reason the rules accept, with its numbers?
> 4. **Each reply made a clickable or dropped** against section 3: is the reason one the rules
>    accept (never "the position is equal")?
> Report a list: the item's full line, what is wrong, how you checked (the command and its
> output), and what you would do. Say plainly which items you checked and found right, and which
> you could not check. Change no file.

Fix what it finds, or write down why a finding does not hold; both go into
`second-reader.md`. Run steps 6 and 7 again after any fix.

### 9. Commit, list, ledger, scan, push

```sh
git -C $D add studies/<sid> && git -C $D commit -m "session: <study>, <batch>"
node scripts/chapter-diff.ts $D@$(cat $B/base.txt) $D --study <sid> --review <name> --title "<Study>: <batch>" --notes $B/notes.json
$A lint $D --study <sid> --list <name>
```

- One review list a batch, the lock held (step 0). The app shows the items at one move as one position, answered once
  (PLAN.md §5.218), so never split a position's items over two lists. A note attaches to a change by the change's own move (a reply: the new
  move; an added part: its first move; a removed part: the first removed move; a comment: the
  commented move); any other note becomes a question at its move. Reasons, numbers and open
  questions go in the notes, each question with your recommendation, not in the chat.
- **Mark what he should look at first**: `"first": true` on the note (PLAN.md §5.220). The panel
  shows a marked position first with "Look first", counts them in the list's head, and "OK all
  open" leaves them waiting, so the mark decides what he reads and what he may wave through. It
  goes on:
  - a move of his changed or questioned;
  - a decision the tools left to judgement: a difficulty number within about 1 of a class limit,
    the guide and the measure disagreeing, Practical within 3 points, a ChessDB eval still shallow;
  - a claim the second reader questioned, whether you changed it or kept it;
  - a kind of change he has corrected before (`corrections.md`);
  - every question, a proposed rule among them.

  Nothing else. `lint --list` warns on a list with no marked position, with more than about a
  third marked, and on a question without the mark: a mark on everything points to nothing.
- Update `audit.json` (the subtree is `open`, with the batch's name; new flags; flags dealt with
  removed), then `$A ledger $D --study <sid>` and `$A ledger $D --study <sid> --check`.
- **Start ChessDB's exploration of the next two subtrees** (the section "ChessDB explored ahead"):
  `explore-start` for each of the ledger's first two under "What is next" writes their files into
  the notes, which go out with this push; the exploring session is started after it.
- `$A unlock $D --study <sid>` as the last thing: it removes the lock, commits and pushes.
- `$A scan $D` before **every** push: a token, an email address or a path of a personal computer
  stops the push (exit 1). A container's path only warns, but doesn't belong in a new file either.
- `node scripts/validate-data.ts $D`, commit the list, the notes and the ledger (`session: …`), and
  `git -C $D push`. No force push. Rejected: he pushed meanwhile; `git pull`, and if a chapter file
  conflicts, take his (`git checkout --theirs`, or reset your commit) and run `apply` again with the
  same `--base`: it merges his new edits.
- Leave your answers for the next session: `$A cache-push --store ../<testing repo>/audit-cache
  --cache ~/cache/a` (every cache folder you used, comma-separated), then commit and push that repo
  (`session: audit cache`). Rejected: `git fetch`, `git reset --hard origin/main`, `cache-push`
  again; the store is a union by key, so nothing is lost. Do it after a long warm-up too, not only
  at the end.

### 10. Report, and stop

To the owner, short. **Its first line is what he sees as a notification**: `<study>: <batch> is
ready: N positions, M to look at first` (or, when nothing was done, the reason: `status`'s first
line). Then: the subtree in full, what changed in numbers (positions, replies and single-move
branches before and after), the positions marked "look first", each in full with why (the same
ones the list marks: nothing is named here that is not marked there), every question (they are in
the list too), what each check gave, what the second reader found, what ChessDB's exploration
showed and whether one was started for the next subtrees (with its session's link), the
"Batches" table's last rows when a list was merged, and what was checked live, by tests, or taken
from a document. Then stop: the next batch starts when he has answered. Stop earlier, and say
exactly what is needed, when:

- his lists are open and he has not said he is done (step 1);
- a finding changes the shape of the plan (a rule that can't be applied, a chapter that should be
  split, a move of his the data questions strongly): to him before anything is built on it;
- a check misses its target for a reason you can't remove;
- the explorer or ChessDB can't be reached, so numbers would be guesses.

## ChessDB explored ahead

ChessDB's eval far into a line is often one search with a few plies behind it. q_extension's
cdbexplore builds ChessDB's own tree below a file's line ends and the close decisions of our side,
so every later lookup there is deeper. It runs ahead of the review, in a session of its own, since
a subtree takes hours.

**After a batch is pushed**, for each of the first two subtrees of the ledger's "What is next"
(for a chapter with no review: the whole chapter, before its close calls):

```sh
$A explore-start $D --study <sid> --chapter <cid> --line "<the subtree's moves>" --cache ~/cache/a --session <the new session's id, once known; or leave it out>
```

It writes `notes/<sid>/cdbexplore/<name>.pgn` (the subtree with the moves that lead to it, the
opponent's moves carrying their share, the lines that end in a "transposes to" note left out) and
the start into `audit.json`; it says "Not started" for a subtree explored in the last 7 days, and
then there is nothing to do for that one. Run `$A ledger`, commit and push the notes (they are
part of the batch's push), then start **one** session for the names it wrote, with
`create_session` (claude-code-remote): `model: "sonnet"`, `effort: "low"` (it only runs commands
and waits on them; CLAUDE.md), the repworks repo as its source, a title like `cdbexplore: <names>`,
and this prompt with the three values filled in:

> You run one tool for the owner's chess repertoire: cdbexplore, which makes ChessDB's analysis
> deeper for the part of the repertoire that is reviewed next. You only run the commands below,
> wait for them and say what they printed. Change no file by hand, and push nothing but what the
> commands push.
>
> **Set up** (once, and again whenever the container was replaced and a folder is gone):
> 1. `add_repo` (claude-code-remote) for `<owner>/<data repo>` with push access, and clone it
>    beside repworks as the tool's result says; then `git -C ../<data repo> fetch --depth=500
>    origin main`.
> 2. `git clone --branch claude/gifted-cori-2whjds https://github.com/skAeglund/q_extension
>    ../q_extension && git -C ../q_extension checkout -q a396b4d` (a public repo; read-only for
>    you: change, commit and push nothing there).
> 3. In repworks, if `node_modules` is missing: `npm ci`.
>
> **Run**, from the repworks folder, as a background command (it takes up to two hours; you are
> woken when it ends):
>
> `git -C ../<data repo> pull -q --rebase --autostash; node scripts/audit/audit.ts explore-run ../<data repo>
> --study <sid> --names <names, comma-separated> --hours 1.9 --push`
>
> It explores each file in turn, writes the report of each into the data repo
> (`notes/<sid>/cdbexplore/<name>.md`) and pushes it. When it ends, read its last lines:
> - `LEFT: run the same command again.` Run it again, the same way. Positions already explored
>   are skipped, so each run goes on where the last stopped.
> - `NOTHING LEFT`: you are done. Reply with the lines it printed for each name, and stop.
> - A line saying ChessDB refused requests: add `--rate 240` to every later run.
> - `NOT PUSHED`, or any error: run `git -C ../<data repo> status` and `git -C ../<data repo>
>   pull --rebase`, then the command again. If the same error comes three times, reply with it
>   word for word and stop.
>
> Stop after 30 hours in all, whatever is left, and say what the last run printed. Don't ask
> questions: nobody reads your replies until the end. Never print a token or write one to a file.

Then put the new session's id into `audit.json`'s entry if you left it out, and name its link in
the report. `status` shows each of the next subtrees with its exploration: finished, how many
positions are left, or started with no report yet. A session that has reported nothing six hours
after its start has probably died: look at it (`get_session`, `list_events`), and start another
with the same prompt (the tool's record is in the data repo, so nothing explored is lost).

What an exploration changes for a batch: ChessDB answers cached before its last explored position
are stale. `practical`, `close-calls` and `chessdb` drop those from the cache folder themselves
before they ask (they say how many), so a batch cannot decide on them; `cache-pull` may bring old
ones back from the store, and they are dropped again at the next command.

## An unattended run

Nobody starts these by hand. A scheduled task wakes a small standing session every three hours,
the dispatcher: it pulls both repos, runs `audit.ts status`, and when there is work (and no
worker of its own is still running) starts the worker with `create_session`. (A session the
schedule started directly would have no `add_repo` and could not reach the private data repo.)
The worker is the session this section is for. Its run is the batch as written above, with these
differences:

1. **`status` first, before reading anything else** (after the data repo is cloned and pulled):
   `node scripts/audit/audit.ts status ../repworks-data --study <sid>`. Its first line starts with
   `<study>: nothing done:` (exit code 3; work is 0) → reply with that line alone, and stop. No
   lock is taken, nothing is read or written. The dispatcher has asked the same already, so this
   is rare for a worker: the owner synced meanwhile, or another session took the lock.
2. Otherwise it says what the work is (`merge the answers of …, then audit …`). Read the rules,
   the ledger and the corrections as always, take the lock (step 0), and run the batch: steps 1
   to 10.
3. **Nobody can be asked.** Wherever a step says "ask" or "stop and say":
   - a question that can wait (an unclear note of his, a judgement between two fair options, a
     proposed rule, a target a check misses by his own edit): decide on the best guess, say in
     the note what you assumed, and put it into the list as a question marked "look first";
   - one that cannot (the data repo can't be pushed, the explorer or ChessDB can't be reached, a
     finding that changes the shape of the plan, his lists and the chapters contradicting each
     other so that a merge would lose his work, a `REFUSED` you can't explain): stop the run.
     Undo what is not pushed (`git reset --hard origin/main` in the data repo, after making sure
     no commit of yours is worth keeping), release the lock, and make the last message say
     exactly what is needed from him, in words he can act on from his phone.
4. A list he left partly unanswered never starts a run (`status` says he is reviewing), so an
   unattended merge always has every position answered or edited.
5. The exploration of this batch's own subtree still running: `status` reports no work for up to
   24 hours after its start; after that the batch goes on with what there is and says so.
6. Start the exploring session for the next two subtrees as an attended run does. Start no other
   session, and create, change or fire no scheduled task.
7. **The notification is yours to send**: the schedule gives none. When the batch is pushed and
   the lock released, send the owner one line with the `PushNotification` tool: `<study>: <batch>
   is ready: N positions, M to look at first`; when the run stopped for something he must do, that,
   in one line. **Your last message starts with the same line.** Nothing before it: no greeting,
   no summary of the steps. The rest of the report follows as in step 10. A run with nothing to do
   sends no notification.

## Preparing later subtrees in parallel

Reading is free of the one-writer rule. While one session writes a batch, others (or background
commands of the same session) may run `inventory`, `screen`, `difficulty` and Practical warm-ups
for the next subtrees, each on its own Lichess token with **its own cache folder** (a folder holds
its limiter's state; two runs on one folder or one token trip the rate limit). `cache-push` takes
all the folders at once, and `cache-pull` brings the union into each. Their output is evidence for the
later batch, not a decision: inventories are run again after any batch that changes the chapter.

## A chapter that has had no review

Its moves were never judged, so the close calls come before the branch audit, and ChessDB's
exploration of the whole chapter before the close calls (`explore-start` with `--chapter` and no
`--line`, then its session as in "ChessDB explored ahead"; the close calls read ChessDB at every
move of ours, and wait for the exploration as a batch does):

```sh
$A add-chapters $D --study <sid> --from <file.pgn> --names "<chapter>"    # if it is in no study yet; then add it to audit.json
$A close-calls  $D --study <sid> --chapter <cid> --cache ~/cache/a --out cc.json --practical positions.json
$A practical $D --study <sid> --positions positions.json --cache ~/cache/a --out cc_practical.json --ort-node ~/ort
```

`close-calls` lists the moves the agreed triggers flag (ChessDB clearly higher with the win rate
close; the win rate clearly higher with ChessDB close; a critical reply; the most reached line
ends), and `check` the positions met with two moves. Settle each as in step 4, hand the owner the
close calls as a review list with a recommendation each, and only then audit the chapter subtree by
subtree.

## Mistakes already made (don't repeat them)

- A merge from a base two commits old, which would have read the session's own later changes as
  the owner's. `apply` refuses it now; don't work around the refusal.
- A reply made a clickable "because the position is level". An equal eval is never a reason.
- "The most common reply always stays drilled", applied mechanically. It is a judgement.
- An explanation that sounded right and was wrong (what ...c5 does to c7; which knight moves are
  double checks). Each is in `corrections.md`.
- Moves chosen by ChessDB or Stockfish alone in thin positions. Practical with Maia decides.
- Practical run without two of the study's flags, in every batch of one audit. `audit.ts practical`
  passes them all.
- Prose inside a line's parentheses, and moves in a comment outside any: neither is clickable.
- A list of 119 items. A batch is about 25 positions.
- A PC's path, with the owner's user name in it, nearly copied into a file. `scan` before every push.
- What to look at first said only in the chat, which he does not see in the app. It is a mark on
  the list's notes now, and the report names the same positions.
- cdbexplore named in the rules and run by nothing, for five batches. It runs ahead from step 9,
  and on demand in step 4.
- A decision on a ChessDB answer cached before the position was explored. The commands drop those.

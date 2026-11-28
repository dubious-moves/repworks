---
name: repertoire-audit
description: Audit one part of the owner's opening repertoire (a study in his data repo) and hand it to him for review - merge his answers and edits from the last round first, then take one subtree, decide what is drilled and what becomes a clickable line in a comment, check every move and every claim with the explorer, Practical with Maia, Stockfish and the difficulty measure, have a second reader go over the result, and push the chapter, one review list and the updated ledger. The repertoire's own rules and state are in the data repo, notes/<study id>/ (rules.md, ledger.md, audit.json); the tools are scripts/audit/audit.ts. Use when the owner asks to audit, review or continue the repertoire review, to merge his review answers, to run "the next batch", or to review a chapter that has had none. PLAN.md section 5.219.
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
- A cache folder outside both repos (`--cache ~/cache/<name>`), shared by Practical, the inventory,
  the close calls and the deck check. The ledger says where earlier sessions' caches are, if any.
  A cold cache is slow, not wrong: an inventory asks about 50 positions, the deck check's shares
  about 600, once.

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
6. **One session writes to the study at a time**, and never while he is reviewing.

## One batch

### 1. Merge his answers and edits

```sh
git -C ../repworks-data pull
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
  wording, format), with the full line and his words. `git rm` each list whose answers are merged,
  update `audit.json` (a subtree he accepted is `closed`), and commit: `session: <study>, answers
  merged`.

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
  class limit is a judgement. Don't pass `--engine` here: another engine's numbers are not the
  classes'.
- **judge**: the guide and the measure side by side for every reply. A suggestion, not a verdict.

### 4. Settle the moves

Every flagged move, every move you would change, and every line end goes to Practical with Maia,
with the command line `rules.md` gives (all of its flags; depth 5, then 7 when candidates are
close). The positions file is `[{ "moves": "<the full line>", "candidates": ["ours", "other"] }]`;
keep it and the report in `practical/`. A flag is settled by Practical, then by the repertoire's
own tests in `rules.md` (for the 1.Nc3 study: the system test, and no pure engine moves outside
sharp only-move lines). A Practical edge that rests on no games is said to be so.

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

- One review list a batch. The app shows the items at one move as one position, answered once
  (PLAN.md §5.218), so never split a position's items over two lists. A note attaches to a change by the change's own move (a reply: the new
  move; an added part: its first move; a removed part: the first removed move; a comment: the
  commented move); any other note becomes a question at its move. Reasons, numbers and open
  questions go in the notes, each question with your recommendation, not in the chat.
- Update `audit.json` (the subtree is `open`, with the batch's name; new flags; flags dealt with
  removed), then `$A ledger $D --study <sid>` and `$A ledger $D --study <sid> --check`.
- `$A scan $D` before **every** push: a token, an email address or a path of a personal computer
  stops the push (exit 1). A container's path only warns, but doesn't belong in a new file either.
- `node scripts/validate-data.ts $D`, commit the list, the notes and the ledger (`session: …`), and
  `git -C $D push`. No force push. Rejected: he pushed meanwhile; `git pull`, and if a chapter file
  conflicts, take his (`git checkout --theirs`, or reset your commit) and run `apply` again with the
  same `--base`: it merges his new edits.

### 10. Report, and stop

To the owner, short: the subtree in full, what changed in numbers (positions, replies and
single-move branches before and after), the few changes he should look at first and why, every
question (they are in the list too), what each check gave, what the second reader found, and what
was checked live, by tests, or taken from a document. Then stop: the next batch starts when he has
answered. Stop earlier, and say exactly what is needed, when:

- his lists are open and he has not said he is done (step 1);
- a finding changes the shape of the plan (a rule that can't be applied, a chapter that should be
  split, a move of his the data questions strongly): to him before anything is built on it;
- a check misses its target for a reason you can't remove;
- the explorer or ChessDB can't be reached, so numbers would be guesses.

## Preparing later subtrees in parallel

Reading is free of the one-writer rule. While one session writes a batch, others (or background
commands of the same session) may run `inventory`, `screen`, `difficulty` and Practical warm-ups
for the next subtrees, each on its own Lichess token with **its own cache folder** (a folder holds
its limiter's state; two runs on one folder or one token trip the rate limit). Copy the folders'
`explorer.jsonl` and `chessdb.jsonl` lines together afterwards. Their output is evidence for the
later batch, not a decision: inventories are run again after any batch that changes the chapter.

## A chapter that has had no review

Its moves were never judged, so the close calls come before the branch audit:

```sh
$A add-chapters $D --study <sid> --from <file.pgn> --names "<chapter>"    # if it is in no study yet; then add it to audit.json
$A close-calls  $D --study <sid> --chapter <cid> --cache ~/cache/a --out cc.json --practical positions.json
node scripts/practical.ts --positions positions.json … (rules.md's command)
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
- Prose inside a line's parentheses, and moves in a comment outside any: neither is clickable.
- A list of 119 items. A batch is about 25 positions.
- A PC's path, with the owner's user name in it, nearly copied into a file. `scan` before every push.

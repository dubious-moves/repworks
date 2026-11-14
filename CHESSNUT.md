# Repworks: the Chessnut Move (a robotic board)

Status: planned 2026-11-06 at the owner's request; **being built since 2026-11-14** at the owner's
word ("Go ahead and build it"), before the board arrives. Built: parts (a) and (b) (2026-11-14). What each
part changed from this plan is in `PLAN.md` §5.153's "As built" notes. Everything here can be built
and tested before the board arrives (a simulated board in the tests), and part (a)'s spike page
checks on the first day what only the real board can show. Read with
`CLAUDE.md`, `PLAN.md` (§5.153 points here) and `DECISIONS.md` (its revision log of 2026-11-06).

The owner's words: "I'm planning on buying the 'Chessnut Move' board and I want to be able to use
it with Repworks. The most important part is that Storm (not timed) and practice mode works."
Then: "Make it extensive and make it as easy as possible to implement, whenever the time comes."

**For a build session**: read §1, §4 and §5 once, then the part of §6 you were given. Each part
lists the files to create or change, the steps in order, the tests to write (named), and what
"done" means. The core code in Appendix A is written and tested already (scratch, 2026-11-06,
against this repo's chessops 0.15.1 and its strict TypeScript settings): copy it into place, copy
its tests from Appendix B, and run them before writing anything new. §8 has the prompt for each
part's session. Follow `CLAUDE.md` as always (push to `main` when `npm run check`, `npm test` and
`npm run e2e` pass; start the next part's session when a part is pushed, until the owner's live
checks are all that's left).

Contents:
1. Summary
2. The board and its protocol
3. What was checked, and how
4. Design: the decisions and why
5. The sessions on the board: what the user sees
6. Build plan, part by part
7. Live checks, and what to change for each answer
8. Prompts for the build sessions
9. Risks and fallbacks
10. Not in this plan
- Appendix A: reference code (tested)
- Appendix B: reference tests and the simulated board
- Appendix C: byte vectors
- Appendix D: TESTING.md entries, to add as each part is pushed

---

## 1. Summary

The Chessnut Move is a robotic electronic board: each piece drives itself, the board knows every
piece by kind and place, and each square has a light. Chessnut publishes its Bluetooth protocol,
and Chrome on Android and Windows can talk Bluetooth from a web page (Web Bluetooth), so Repworks
can drive the board directly: no app, no bridge, no server.

How it works, in one paragraph: **the site stays the truth, and the board mirrors the board on the
screen.** Whatever position a storm card or a practice game shows, the board's robot sets up. A
move made on the board is read (the board's report compared with each legal move's result) and
goes in exactly as a move on the screen does (`answerMove`, `practiceMove`); a move made on the
screen, or by the opponent, is driven on the board. What the screen draws (the last move, the
best-move arrow, the verdict's colour, a hint) is lit on the squares. Nothing new is written or
synced: answers given on the board are ordinary events.

For the owner:
- **Browser.** Brave has Web Bluetooth **off by default** on every platform (read in Brave's own
  source). Either turn on `brave://flags/#brave-web-bluetooth-api` and relaunch, on each device
  that will drive the board, or use Chrome (Edge on Windows works too). Chrome on the phone
  (Android 10) needs nothing. No iPhone or iPad browser has Web Bluetooth.
- **One connection.** The board talks to one app at a time: close or disconnect Chessnut's own
  app first.
- **After a reload** the board is picked again in Chrome's device list (one tap); while the app
  stays open, a dropped link reconnects by itself.

Scope, in the owner's order: the storm's untimed sessions (Set of 6, show and grade, with
puzzles) and practice (with the advantage and checklist drills and the endgames, which are
practice games), then the timed storm (its clock stopped while the board sets up) and the
storm's review.

---

## 2. The board and its protocol

From Chessnut's pages and its published API (`chessnutech/chess_move_api`), checked against
Chessnut's own app (ChessnutNext) and the `chessnut-move` SDK (§3). Nothing here was seen live.

**The board.** 34 pieces (a spare queen a side), each with its own motor, battery and wheels; the
board tracks every piece by identity and place (1 mm, 10 Hz, by Chessnut's specs) and lights each
square. Bluetooth 5.0 and Wi-Fi. The board charges by USB-C, the pieces on a pad. One Bluetooth
connection at a time. Chessnut says a full setup takes seconds and a move under 3 s on average
(no independent timing found). Its reset button sends every piece home by itself; no button
press is reported over Bluetooth.

**Bluetooth Low Energy (GATT).**

| What | UUID | Use |
| --- | --- | --- |
| Device name | `Chessnut Move` | the chooser's filter |
| Position service | `1b7e8261-2877-41c3-b46e-cf057c562023` | |
| … position reports | `1b7e8262-2877-41c3-b46e-cf057c562023` | notify |
| Command service | `1b7e8271-2877-41c3-b46e-cf057c562023` | |
| … commands | `1b7e8272-2877-41c3-b46e-cf057c562023` | write |
| … answers | `1b7e8273-2877-41c3-b46e-cf057c562023` | notify |

The UUIDs are those of Chessnut's other boards (Air, Pro, Evo); the commands differ.

**Squares on the wire.** 32 bytes hold the 64 squares, two a byte, in the order h8, g8, f8 … a8,
h7 … a1, the first of each pair in the low nibble. With chessops's square numbers (a1 = 0, b1 = 1
… h8 = 63), square `s` is wire index `k = 63 − s`: byte `k >> 1` of the block, the high nibble when
`k` is odd. Piece codes:

| Code | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Piece | empty | q | k | b | p | n | R | P | r | B | N | Q | K |

**Messages.**

| Message | Bytes | Write kind | Notes |
| --- | --- | --- | --- |
| Start the reports | `21 01 00` | with response | the board answers `23 …` on the answers characteristic (undocumented; seen by the SDK) |
| Position report (board → site) | 38 bytes: `[0..1]` ?, `[2..33]` the squares, `[34..37]` ? | notify | the unknown bytes are ignored; sent when the position changes |
| Drive (the robot) | `42 21` + 32 square bytes + flag: 35 bytes | without response | flag 0 = force (a hand doesn't stop it; Chessnut's app's default), 1 = a piece moved by hand halts the drive. The board plans the paths itself. Nothing says "done": done is the report equal to the position sent |
| Stop a drive | `42 21` + 33 zeros | without response | |
| Lights | `43 20` + 32 bytes, a colour code a square, same order: 34 bytes | without response | 0 off, 1 red, 2 green, 3 blue (README); 4 dark green, 5 bright green, 6 yellow, 7 orange (Chessnut's app only) |
| Battery | `41 01 0c` → `41 03 0c <charging 0/1> <percent>` | with response | |
| Pieces | `41 01 0b` → `41 89 0b` + 34 × (kind, x, y, battery %) | with response | kinds 1–6 White P R N B Q K, 7–12 Black; the order White's P×8 R×2 N×2 B×2 Q×2 K then Black's; x, y 0–255 over the board, both 0 when the piece isn't on it |

Two things the sources disagree on: Chessnut's README says the reports **stop** during a drive;
Chessnut's app has a guard against "intermediate FENs while the motor is moving". The design
copes with either (§4.4). Writes: Chessnut's app writes one command at a time, at least 100 ms
apart, the whole command in one write (it splits only when it knows a smaller packet size, which
a web page never does), and tries the other write kind when one fails. Chessnut's app has more
commands (Wi-Fi, firmware, stored games, piece pairing); none is used here.

---

## 3. What was checked, and how

All on 2026-11-06, with clones and scratch code outside the repo.

| Source | What it gave | Where |
| --- | --- | --- |
| Chessnut's Move API | the protocol in §2 | `chessnutech/chess_move_api` at `c9b1dc6` (2025-08-08), `README.md` |
| ChessnutNext, Chessnut's own app (Flutter, **GPL-3.0**, as this repo) | the codecs and the extra light codes; the Move's write rules (a queue, 100 ms apart, the other kind on failure; no packet split on the web); its puzzle and storm screens: a move taken once the board holds it `fenDelay` = 800 ms, a wrong move put back by the robot after `moveRestoreDelay` = 2 s, reports ignored while a position sent isn't reached (`_moveBoardTargetFen`); the 180° `reversed` mapping for a Black player; move-quality lights (green best/great/good, blue inaccuracy, red mistake/blunder); the auto-move flag 0 by default | `chessnutech/ChessnutNext` at `6954f72` (2026-09-22): `lib/services/physical_board_protocol.dart`, `universal_ble_board_transport.dart`, `physical_board_orientation.dart`, `move_quality_lights_service.dart`, `board_settings_service.dart`, `lib/screens/puzzle_screen.dart` |
| `chessnut-move` 1.0.2, a Rust SDK (Apache-2.0) | the same bytes; the start order (subscribe to the reports, `21 01 00`, subscribe to the answers); the `23` reply; the one-connection note; test vectors | crates.io, read in full |
| MoveAPiece's sniffer notes | the Move uses the Air's services and report; no button event; its reset button | `egdels/moveapiece` at `7e6129b`, `tools/chessnut-sniffer/CHESSNUT_PROTOCOL.md` |
| Web Bluetooth's status | shipped with no flag in Chrome on Android (6.0+) and Windows (10 1703+), and in Edge; not in Firefox or Safari; `getDevices()` and persistent permissions still behind flags; some GATT operations can't run in parallel | `WebBluetoothCG/web-bluetooth`'s `implementation-status.md` at `2e451c1` (2026-06-03) |
| Brave | `kBraveWebBluetoothAPI` is `FEATURE_DISABLED_BY_DEFAULT`; Brave's Bluetooth delegate answers "globally disabled" unless it is on; the switch `brave-web-bluetooth-api` is on every platform | `brave/brave-core` at `e48ff9a` (2026-11-06): `browser/about_flags.cc`, `chromium_src/third_party/blink/common/features.cc`, `browser/bluetooth/brave_bluetooth_delegate.cc` |
| The byte order | ChessnutNext's encoder and the README's decoder agree; the reference codec round-trips positions and decodes the SDK's example (byte 2 = `0x21` → h8 black queen, g8 black king) | scratch checks; Appendix B's tests |
| The reference code (Appendix A) | 23 tests pass (Appendix B); it type-checks under this repo's `tsconfig.base.json` (core alone with no DOM, and the platform module with the DOM), and `scripts/check-boundaries.mjs` passes on it; the platform module runs against the simulated board in Node | scratch project linked to this repo's `node_modules` |
| The site | where a move enters (`answerMove` in `src/app/storm.ts`, `practiceMove` in `src/app/practice.ts`); which components draw the boards to mirror (`MoveBoard` and `PracticeBoard` in `src/ui/Practice.tsx`, `CardBoard` in `src/ui/Storm.tsx`, `EndgameGame`, `ChecklistDrill`); the storm's phases and timers; the existing wake lock (`useWakeLock` in `src/ui/Train.tsx`); the header (`src/ui/App.tsx`) | read at `aa4baa6` |

Not checked (only the board can show it; §7 says what to change for each answer): whether the
board reports during a drive; whether a 35-byte write goes through from a web page; how long a
card takes to set up; which light codes light; how the 600 ms window feels; castling, en passant
and promotion read by hand; the robot with a hand in the way; the link after the board's idle
power-off and after the phone's screen locks; whether Chrome on Android 10 asks for Location in
the chooser (Android's rule for Bluetooth scans before Android 12; not read here).

---

## 4. Design: the decisions and why

Each is a technical call (`CLAUDE.md`), recorded in `DECISIONS.md`'s revision log.

### 4.1 Web Bluetooth from the page

No native app, no bridge, no server (D2). The board is opened from the site through
`navigator.bluetooth`. Only if a device can't use Web Bluetooth would a bridge make sense (a small
local program on the Rust SDK, reached on localhost as explorerdb is, `PLAN.md` §5.25); not planned.

### 4.2 The site is the truth; the board mirrors the screen's board

- A screen that wants the board says so with one prop on its board component (`mirror`, §6 part
  (c)). It hands over what it already computes: the position (FEN), whether the user may move
  now, the side the board is seen from, the move shown as last, the arrows drawn, and the
  callback a move goes to.
- Each new position is sent to the board whole; the robot drives there. **Force mode** (flag 0),
  Chessnut's own default: the site's position wins over a stray hand.
- A move read on the board goes to the screen's own callback (`answerMove`, `practiceMove`), so
  everything after it (grading, the repertoire check, the opponent, events) is unchanged.
- A move made on the screen changes the position, which is driven on the board. Both ways work at
  any time.
- One mirror at a time: the latest board mounted with `mirror` wins; unmounting it clears it.
- **Nothing new is written.** Answers from the board are ordinary `storm` and `practice` events,
  with no new field; no data format changes; the board's settings stay on the device.

### 4.3 Reading a move

- The board reports its squares. The site compares them with the result of each legal move from
  the position it expects (chessops); the move whose result matches is the move. This is
  Chessnut's own method (`_normalMoveFromFen`).
- **Held 600 ms first** (`settleMs`; Chessnut's app uses 800). A capture is two steps (the captured
  piece off, then the piece onto its square); castling is two pieces; a hand hovers. Only a
  position the board keeps that long is read. A setting, 300–1500 ms.
- Castling, en passant and promotion come out of the same comparison. A promotion reads the piece
  put down (the board knows each piece's kind), most often the spare queen; **a pawn left on the
  last rank reads as a queen's promotion**, and the robot then swaps the pawn for the queen.
- **A rook moved first when castling**, then left over 600 ms, is a legal rook move and is read so,
  as on every electronic board. The screen says once per session "Castle with the king first".
- Moves are handed over in standard UCI (castling as the king's two squares, `e1g1`), which is
  what `MoveBoard` already hands to `practiceMove`; `answerMove` accepts it too (the storm's lists
  are standard UCI).

### 4.4 The link: never reading the robot's own driving

The link is a pure reducer (`src/core/board/link.ts`, Appendix A): a report, a position wanted or a
tick goes in; the next state and what to do come out. Its phases:

| Phase | Meaning | Reports | On a tick |
| --- | --- | --- | --- |
| `idle` | no mirror | kept as the last seen | nothing |
| `driving` | a position sent, not yet reported | compared with the position sent only; equal → `synced` | 20 s (`driveMs`) without it → `stuck` |
| `synced` | the board showed the position | kept, with when it last changed | see below |
| `stuck` | the drive didn't arrive | equal to the position → `synced` (fixed by hand, or the drive finished late) | nothing; the screen offers Send again |
| `unmakeable` | the pieces can't make it (§4.8) | ignored | nothing; the screen plays on alone |

In `synced`, when the board differs from the position wanted, on each tick:
1. A move handed to the site that left its position unchanged after 500 ms (`refusedMs`; the
   repertoire check refused it): **put back at once**.
2. Held under 600 ms: wait.
3. If the user may move and the board shows one legal move's result: **hand the move over** (once
   for that report).
4. If the screen offers a take-back (`undoFen`, a held storm card) and the board shows that
   position: **undo** (Try again).
5. Held 2 s (`putBackMs`, Chessnut's default) and something was **put down** wrong: **put back**
   (the robot sets the position again). Pieces only **lifted** (squares emptied, nothing put down
   elsewhere) are never put back: a hand still holds them. During the opponent's turn and while
   the site grades, every hand move falls here.

Two guards make it safe: a report acted on is never acted on again (`actedOn`), and a drive's
reports are only compared with its position, whether the board reports on the way or not.

### 4.5 The port and the platform

- `PhysicalBoard` (`src/core/board/port.ts`) is a port in core, as `Remote` and `Clock` are:
  reports, a drop, reconnect, drive, stop, lights, battery, pieces, close.
- `src/platform/chessnut.ts` implements it over Web Bluetooth: the chooser filtered to
  `Chessnut Move` with both services, the start order from the SDK, a write queue (one at a time,
  100 ms apart, the other kind on failure; as Chessnut's app), and queries answered within 3 s.
  TypeScript's DOM library has no Web Bluetooth types; the few used are declared in the file (no
  new dependency).
- A simulated Move (`test/e2e/chessnut.ts`, Appendix B) stands in for `navigator.bluetooth` in
  the browser tests: the GATT services, a robot that reaches a position after a delay with a
  report half-way, a hand the test moves, lights and writes recorded, a drop.

### 4.6 The user's side nearest them

A position the user plays as Black is set up **turned 180°** (square `s` ↔ `63 − s`; Chessnut's
`reversed`), so every card and game comes from the near edge, as the screen turns its board. A
storm changes sides card by card; the robot turns the board while it sets up anyway. Moves read
and lights are turned back the same way. A setting ("Black from the far side") keeps White at the
near edge instead. A 180° turn keeps each square's colour, so the board still looks right.

### 4.7 Lights

From what the screen's board draws (`src/core/board/lights.ts`):
- the last move (the one that reached a card, the opponent's move) **blue** on its two squares;
- the user's move once graded in its **band's colour**: the top move bright green, Great green,
  Good dark green, Inaccuracy yellow, Mistake orange, Blunder red (the storm's band brushes; in
  practice the classification, when "Move feedback" is on);
- each arrow drawn, in its brush's colour (the best move green when shown; a hint blue, its piece
  first); with more than three arrows (show and grade's twelve) only the top move's;
- squares to put right **red** (a stuck drive, or the board differing).

Codes 4–7 aren't in Chessnut's README. They're used unless the spike shows they don't light; then
"Basic colours" (a setting) maps them to the README's three, as Chessnut's own move-quality lights
do (green up to Good, blue an inaccuracy, red worse). A light command is sent only when the
pattern changes.

### 4.8 Positions the pieces can't make

8 pawns, 2 rooks, 2 knights, 2 bishops, 2 queens and a king a side. A position needing a third
queen or knight can't be set up (`missingPieces`). A storm card like that isn't dealt while the
board is linked (rare at the repertoire's frontiers); a practice game that reaches one (a third
queen, an under-promotion's third knight) goes on on the screen, and the status says so.

### 4.9 The screen awake; drops and reconnecting

- While a mirror is set and the board is linked, the screen is kept awake (the Screen Wake Lock,
  `useWakeLock`, moved from `Train.tsx` to a shared file): the eyes are on the board, and a phone
  that sleeps freezes the page and drops the link.
- A drop (`gattserverdisconnected`): the status says "Reconnecting"; the site reconnects to the
  same device with no chooser after 1, 2, 4, 8 and 16 s, and again whenever the page becomes
  visible; when back, the position wanted is sent again (`resend`).
- After a reload the device must be picked again (Chrome keeps `getDevices()` behind a flag): the
  chip says "Connect".

### 4.10 Speech and keys

Speech is optional and off by default (`src/platform/speech.ts`'s `say`): the band and the best
move said after a storm move, the opponent's move said in practice (as voice input does), for a
session played without looking at the screen. Keys and the ring's media keys work as they do now;
the board has no buttons to read.

### 4.11 Settings (on the device)

Kept in `localStorage` under `repworks-board` (one JSON object), as the other preferences are:

| Setting | Default | Range | What it does |
| --- | --- | --- | --- |
| `lights` | on | | the lights at all |
| `basicColours` | off | | only red, green, blue (§4.7) |
| `turnForBlack` | on | | a Black player's positions turned (§4.6) |
| `settleMs` | 600 | 300–1500 | how long the board holds a move before it's read |
| `putBackMs` | 2000 | 1000–5000 | how long a wrong position stays before the robot puts it back; also a held storm card's Try again |
| `speak` | off | | verdicts and the opponent's moves said |
| `autoNext` | on | | a set's next card comes by itself after a verdict while the board is linked |
| `autoRetry` | on | | a held set card's move is taken back after `putBackMs` |
| `playArrival` | off | | a storm card set up one move early, the move that reached it then played |

### 4.12 What stays as it is

The storm's grading, the set's rules (tries, the second pass), puzzles, practice's opponent and
judges, the repertoire check, the events and sync, the screen's board (it keeps taking moves),
and every screen that doesn't opt in.

---

## 5. The sessions on the board: what the user sees

### 5.1 The chip and the dialog

- **The chip** sits in the header beside the sync status (`src/ui/App.tsx`'s `topbar`), on every
  page, when `navigator.bluetooth` exists or the browser is Brave (`navigator.brave`), to say how
  to turn it on. Its states: "♞ Board" (not connected: a click connects), "Connecting…", "♞ 87%"
  with a dot (green in sync, amber setting up, red stuck or differing), "♞ Reconnecting". A click
  when connected opens the dialog.
- **Connect**: the chooser (Chrome's list, filtered to "Chessnut Move"); then the battery is read.
  Errors in plain words: no Web Bluetooth ("This browser has no Web Bluetooth: use Chrome or Edge"
  or, in Brave, "Turn on Web Bluetooth: open brave://flags/#brave-web-bluetooth-api, set it to
  Enabled and relaunch"); Bluetooth off ("Turn Bluetooth on"); nothing picked (silent); a failed
  connection ("The board didn't answer: is Chessnut's app still connected to it?").
- **The dialog**: the board's name and battery (charging or not); the link's state in words; the
  board as reported (a small board: the shared `Board` component, showing only); "Check the
  pieces" (the pieces' batteries, those under 20% named, and pieces not on the board); the
  settings of §4.11; buttons: Set up again (`resend`), Reset the pieces (the start position),
  Lights off, Disconnect.

### 5.2 The set and show and grade (the owner's priority)

| Moment | The screen | The board |
| --- | --- | --- |
| A card dealt | "Setting up the board…" (a new phase, `setup`; the card can't be answered yet; "Play on the screen" skips the wait) | the robot sets up the card, turned to the user; the move that reached it lit blue. With `playArrival`, the position one move earlier first, then that move driven |
| Board in sync | the card asks for a move, as now | waits |
| A move by hand | the move on the screen's board, grading, as if played there | the move stays; nothing driven |
| The verdict | as now | the move's squares in the band's colour; speech says the band if on |
| Great or good | as now; with `autoNext` the next card comes after 1.2 s (2.6 s after a not-clean answer), with the storm's bar and Pause (`P`) | then the next card set up |
| A held card | as now (Try again, Show the move) | after `putBackMs`, with `autoRetry`, the robot takes the move back and the card waits for the next try; taking it back by hand does the same at once |
| Show the move | the best move's arrow, as now | the played move taken back, the best move lit green |
| Show and grade | "Think of a move"; `2` shows the moves; Found and Missed by the keys and the ring | the top move lit bright green once shown; a move played on the board names it and is graded as in a set |
| A puzzle | as now | after the user's right move the robot plays the reply; a wrong move is a held card |
| The review | as now | the board follows the row chosen, a second after the last step (so stepping through doesn't send the robot to and fro); the played move red and the best green, as the arrows |
| Retry from the review | as now | the card set up; the move read |

### 5.3 The timed storm (after the set)

The same, with the clock: `setup` is a phase before the card waits for a move, and the clock runs
only in `solving` (`setPhase`, `src/app/storm.ts`), so setting up never costs time.

### 5.4 Practice, the drills and the endgames

| Moment | The screen | The board |
| --- | --- | --- |
| Start | as now | the robot sets up the start, turned for Black |
| The user's move by hand | as on the screen | the move stays |
| The opponent's move | as now | driven by the robot, lit blue; the next move is read once the board shows it |
| The repertoire check refuses a move | as now ("isn't your repertoire", the study move) | put back at once (§4.4 rule 1), lit red briefly; speech says the study move if on |
| Take back | as now | the robot takes back both moves |
| Hint | as now | the piece lit blue, then its square |
| Move feedback on | as now | the user's move lit in its classification's colour once judged |
| A hand during the opponent's turn | | put back after `putBackMs` |
| The end | the result, as now | left as it is until Reset the pieces or the next game |
| An endgame's slip | as now (Take back or Play on) | follows the screen |

---

## 6. Build plan, part by part

Each part is one session (§8 has the prompts), pushed to `main` when `npm run check`, `npm test`
and `npm run e2e` pass, with a `PLAN.md` §5.153 "As built" note, a `DECISIONS.md` revision entry
where something changed, and its `TESTING.md` entry from Appendix D.

### Part (a): the codec, the platform, the simulated board and the spike page

The first part on purpose: the day the board arrives, the spike checks everything §7 asks, in
minutes, and the answers can change the later parts before they're built.

Files:
- `src/core/board/chessnut.ts` and `src/core/board/port.ts`: Appendix A, as they are.
- `src/platform/chessnut.ts`: Appendix A, plus an optional `onFrame(kind, bytes)` argument to
  `openBoard` for the spike's raw log (kind `report` or `answer`).
- `test/unit/core/board/chessnut.test.ts`: Appendix B's codec tests (the first six), with the
  header naming its controls.
- `test/e2e/chessnut.ts`: Appendix B's simulated Move (`installFakeMove`).
- `test/unit/platform/chessnut.test.ts`: Appendix B's platform test (the simulated Move in Node).
  `npm test`'s glob (`test/unit/**/*.test.ts`) picks it up, and `test/tsconfig.json` already
  type-checks tests with the DOM and Node types.
- `board.html` (root) and `src/spike/board.ts`: the spike page (below); add `board: 'board.html'`
  to `rolldownOptions.input` in `vite.config.ts`, and a "board spike" link beside "remote spike"
  in `App.tsx`'s footer.

The spike page (`board.html`, styled as `spike.html`, plain DOM, no Preact needed):
1. **Can this browser?** `bluetoothMissing()`: "Yes"; or no API (in Brave, the flag's steps; else
   "use Chrome or Edge"); or no adapter ("turn Bluetooth on").
2. **Connect** (a button: the chooser needs a click). Logs the name and every frame as hex.
3. **The board now**: the last report as a board FEN and as an 8×8 grid of letters.
4. **Drive**: a FEN field with Start, three sample positions, and "Stop". "Drive (force)" and
   "Drive (a hand stops it)". Logs the time from the write to the first report equal to the
   position, and every report on the way with its time (answers: reports during a drive?
   how long?). Also logs whether the 35-byte write succeeded, and with which write kind.
5. **Five storm-like setups**: drives through five real middlegame positions (from the start,
   then one to the next), logging each one's time: what a storm card will cost.
6. **Lights**: "Each code": rank 1 off, rank 2 code 1, rank 3 code 2 … rank 8 code 7; "Off".
   The owner notes which ranks light and in what colour.
7. **Battery** and **Pieces** (a table: piece, on the board or not, battery).
8. **The log**, with "Copy log" (the clipboard) for the owner to paste to a session.

Tests: the codec tests (unit); the platform test (unit, the simulated Move); e2e
`test/e2e/boardspike.spec.ts` (desktop and phone): the page with the simulated Move: Connect, a
report shown as FEN, Drive Start with its time logged, the lights command logged; and with no
Bluetooth (an init script that sets `navigator.bluetooth` to undefined): the no-API message.

Done when: the spike page works against the simulated Move in the e2e on both projects, and
TESTING.md has Appendix D's (a) entry.

### Part (b): reading moves and the link (pure)

Files:
- `src/core/board/read.ts`, `src/core/board/link.ts`, `src/core/board/lights.ts`: Appendix A.
- `test/unit/core/board/read.test.ts`, `link.test.ts`, `lights.test.ts`: Appendix B's tests.

Add to the tests (beyond Appendix B), each a named test:
- castling read for Black on both wings when turned (the turned board through `step`);
- en passant for Black;
- a promotion by capture (`exd8=N` with a knight put down);
- a position unchanged after the window: nothing;
- `settleMs` respected exactly (a tick at 599 ms reads nothing, at 600 reads);
- a move read, then the site's new position arriving after 300 ms: synced, nothing driven;
- a `want` changing during a drive: driven again to the new position;
- `resend` while synced and equal: nothing; while differing: a drive;
- the turned board's lights (`lightsFor` with `turned`).

Controls (run once, listed in each file's header, as the repo does): `readMove` without the
pawn-on-the-last-rank pass → the "pawn left" assertion fails; `step` without the `driving`
guard (reports read as moves during a drive) → "reports on the way ignored" fails; `onlyLifted`
always false → "a piece only lifted never put back" fails; `turned` as the identity → the turned
test fails.

Done when: the unit tests pass with their controls listed; nothing in the app uses them yet.

### Part (c): the link in the app, the chip and the dialog, the mirror prop

Files:
- `src/app/boardLink.ts` (new): the connection, the reducer's state, the mirror, the lights, the
  wake lock flag, reconnect. Sketch below.
- `src/app/boardPrefs.ts` (new): `boardPrefs` signal and `setBoardPrefs`, `repworks-board`.
- `src/ui/BoardLink.tsx` (new): `BoardChip` and `BoardDialog` (§5.1).
- `src/ui/wakeLock.ts` (new): `useWakeLock` moved from `src/ui/Train.tsx` (which imports it from
  there now).
- `src/ui/boardMirror.ts` (new): `useBoardMirror(spec)`, the hook the board components call.
- `src/ui/App.tsx`: `<BoardChip />` in the `topbar` (before `SyncStatus`), `<BoardDialog />` with
  the other dialogs.
- `src/ui/Practice.tsx`'s `MoveBoard` and `src/ui/Storm.tsx`'s `CardBoard`: a `mirror` prop (below).
  No screen passes it yet in this part; its e2e drives the chip and the dialog only.
- `app.css`: the chip (as `.status` chips are), the dialog.

`src/app/boardLink.ts`, a sketch (not run; the reducer and the port are Appendix A's):

```ts
import { signal } from '@preact/signals';
import { boardFenOf, LIGHT, type Battery, type Light } from '../core/board/chessnut.ts';
import { differences } from '../core/board/read.ts';
import { lightsFor, type Marks } from '../core/board/lights.ts';
import { initialLink, step, type Action, type Event, type LinkState, type Phase } from '../core/board/link.ts';
import type { PhysicalBoard } from '../core/board/port.ts';
import { pickBoard } from '../platform/chessnut.ts';
import { boardPrefs } from './boardPrefs.ts';

export type BoardStatus =
  | { state: 'off'; error?: string }
  | { state: 'connecting' }
  | { state: 'on'; name: string; battery?: Battery; phase: Phase; missing?: string[]; wrong?: string[] }
  | { state: 'lost'; name: string };
export const boardStatus = signal<BoardStatus>({ state: 'off' });
/** The last report, for the dialog's small board. */
export const boardSeen = signal<string | undefined>(undefined);

export interface MirrorSpec {
  fen: string;
  movable: boolean;
  orientation: 'white' | 'black';
  marks: Marks;
  onMove(uci: string): void;
  /** A held storm card: the position a take-back by hand returns to, and what it does. */
  undo?: { fen: string; run(): void };
  /** Wait this long before driving a new position (the review's stepping). */
  delayMs?: number;
}

let board: PhysicalBoard | undefined;
let link: LinkState = initialLink();
let mirror: { owner: object; spec: MirrorSpec } | undefined;
let lastLights = '';
let ticker: ReturnType<typeof setInterval> | undefined;

export const boardLinked = (): boolean => boardStatus.peek().state === 'on';

function run(e: Event): void {
  const p = boardPrefs.peek();
  const [next, actions] = step(link, e, { settleMs: p.settleMs, putBackMs: p.putBackMs, driveMs: 20000, refusedMs: 500 });
  link = next;
  for (const a of actions) act(a);
  showLights();
  // Waiters checked after every step: a card whose position the board already shows emits no phase.
  for (const w of [...reached]) w();
}

function act(a: Action): void {
  if (a.t === 'drive') void board?.drive(a.squares);
  else if (a.t === 'move') mirror?.spec.onMove(a.uci);
  else if (a.t === 'undo') mirror?.spec.undo?.run();
  else if (a.t === 'phase') {
    const s = boardStatus.peek();
    if (s.state === 'on') boardStatus.value = { ...s, phase: a.phase, ...(a.missing ? { missing: a.missing } : {}) };
  }
}

/** Called by the mirror hook on every render of the board that opted in. */
export function setMirror(owner: object, spec: MirrorSpec | undefined): void {
  if (!spec) {
    if (mirror?.owner === owner) {
      mirror = undefined;
      run({ t: 'want', want: undefined, now: Date.now() });
    }
    return;
  }
  const before = mirror?.owner === owner ? mirror.spec : undefined;
  mirror = { owner, spec };
  const turned = spec.orientation === 'black' && boardPrefs.peek().turnForBlack;
  const changed = !before || before.fen !== spec.fen || before.movable !== spec.movable || before.orientation !== spec.orientation || before.undo?.fen !== spec.undo?.fen;
  if (!changed) return showLights();
  const want = { fen: spec.fen, movable: spec.movable, turned, ...(spec.undo ? { undoFen: spec.undo.fen } : {}) };
  // The review's stepping: only the position stayed on for `delayMs` is driven. Compared by its
  // FEN, since the spec is a new object on every render (the storm re-renders every 200 ms).
  if (spec.delayMs) setTimeout(() => mirror?.owner === owner && mirror.spec.fen === spec.fen && run({ t: 'want', want, now: Date.now() }), spec.delayMs);
  else run({ t: 'want', want, now: Date.now() });
}

function showLights(): void {
  const p = boardPrefs.peek();
  if (!board) return;
  const spec = mirror?.spec;
  const turned = !!spec && spec.orientation === 'black' && p.turnForBlack;
  const wrong = link.phase === 'stuck' && link.target && link.seen ? differences(link.target, link.seen).map((d) => d.square) : [];
  // `differences` gives physical squares; lightsFor turns logical ones, so turn them back first when turned.
  const l: Light[] = !p.lights || !spec ? new Array(64).fill(LIGHT.off) : lightsFor({ ...spec.marks, wrong: turned ? wrong.map(turnName) : wrong }, { turned, basicOnly: p.basicColours });
  const key = l.join('');
  if (key === lastLights) return;
  lastLights = key;
  void board.lights(l);
}

const reached = new Set<() => void>();
/** Resolves when the board shows `fen` (logical), or can't (unmakeable, off). The storm's setup waits on it. */
export function boardReached(fen: string): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      reached.delete(check);
      resolve(v);
    };
    const check = () => {
      if (boardStatus.peek().state !== 'on' || link.phase === 'unmakeable') return done(false);
      if (link.phase === 'synced' && link.want?.fen === fen) done(true);
    };
    reached.add(check);
    check();
  });
}
// Also call the waiters when the status changes (connect, lost, off), so none waits on a gone board.

export async function connectBoard(): Promise<void> {
  boardStatus.value = { state: 'connecting' };
  try {
    board = await pickBoard();
  } catch (e) {
    boardStatus.value = { state: 'off', ...(isCancel(e) ? {} : { error: words(e) }) };
    return;
  }
  board.onReport((s) => {
    boardSeen.value = boardFenOf(s);
    run({ t: 'report', squares: s, now: Date.now() });
  });
  board.onGone(() => void reconnect());
  boardStatus.value = { state: 'on', name: board.name, phase: link.phase };
  ticker ??= setInterval(() => run({ t: 'tick', now: Date.now() }), 100);
  void board.battery().then((battery) => { const s = boardStatus.peek(); if (s.state === 'on' && battery) boardStatus.value = { ...s, battery }; });
  run({ t: 'resend', now: Date.now() });
}
// reconnect(): status 'lost', board.reconnect() after 1, 2, 4, 8, 16 s and on visibilitychange →
// 'visible'; when back: status 'on' and run({ t: 'resend' }). disconnectBoard(): lights off,
// stopDrive, close, status 'off', ticker cleared.
```

(`turnName` turns a square name half round; `words` and `isCancel` turn a `DOMException` into the
§5.1 messages: `NotFoundError` with "cancelled" is a cancel; `NotFoundError` "globally disabled"
is Brave's flag; `NotFoundError` "Bluetooth adapter not available" is Bluetooth off; else the
message.)

The mirror prop. In `MoveBoard` (`src/ui/Practice.tsx`) add
`mirror?: boolean | { played?: { uci: string; brush: string } }` and call, **before** its early
`if (!pos) return null;` (hooks run on every render):

```ts
useBoardMirror(
  props.mirror
    ? { fen: props.fen, movable: props.movable, orientation: props.orientation, onMove: props.onMove,
        marks: { lastUci: props.lastUci, arrows: props.arrows, ...(typeof props.mirror === 'object' ? props.mirror : {}) } }
    : undefined,
);
```

In `CardBoard` (`src/ui/Storm.tsx`) add `mirror?: { played?: …; undo?: { fen: string; run(): void }; delayMs?: number; fen?: string }`
the same way, with `fen` the card's `fen` (or `mirror.fen` when given: the setup's earlier
position, part (e)), `movable` = `props.asking && mine && fen === base`, `orientation` = `p.side`,
and `marks.lastUci` = its `lastUci`, `marks.arrows` = `props.arrows`.

`src/ui/boardMirror.ts`:

```ts
import { useEffect, useRef } from 'preact/hooks';
import { boardStatus, setMirror, type MirrorSpec } from '../app/boardLink.ts';
import { useWakeLock } from './wakeLock.ts';

export function useBoardMirror(spec: MirrorSpec | undefined): void {
  const owner = useRef({});
  // Every render: the latest position, marks and callbacks (setMirror only drives when they change).
  useEffect(() => setMirror(owner.current, spec));
  useEffect(() => () => setMirror(owner.current, undefined), []);
  useWakeLock(!!spec && boardStatus.value.state === 'on');
}
```

Tests (e2e `test/e2e/chessnut.spec.ts`, desktop and phone, with `installFakeMove`):
- the chip: "Board" → Connect → "87%" (the simulated battery) and a green dot;
- the dialog: the small board shows the simulated position; Check the pieces names the piece at
  12%; a setting changed is kept after a reload (`repworks-board`);
- a drop (`__move.drop()`): "Reconnecting", then back by itself;
- no chip when there's no `navigator.bluetooth` and the browser isn't Brave;
- in Brave without the flag (an init script with `navigator.brave` and no `bluetooth`): the chip
  explains the flag.

Done when: the e2e passes on both projects; no screen mirrors yet.

### Part (d): practice on the board

Changes:
- `PracticeBoard` (`src/ui/Practice.tsx:169` today): `mirror` on its `MoveBoard`, with `played`
  when "Move feedback" shows (`cls`): `{ uci: lastUser.uci, brush: FEEDBACK_BRUSH[lastUser.classification] }`
  where `FEEDBACK_BRUSH` maps best→`bandBest`, great→`bandGreat`, excellent and good→`bandGood`,
  book→`green`, inaccuracy→`bandOk`, mistake→`bandBad`, miss and blunder→`bandBlunder`. Only while
  the user's move is the last one (once the opponent answers, the last move is the opponent's).
- `EndgameGame` (`src/ui/Endgames.tsx:425`): `mirror` on its `MoveBoard`.
- `ChecklistDrill` (`src/ui/Checklist.tsx:501`): `mirror` on its `MoveBoard`.
- `src/app/boardLink.ts`: after a `move` action, when the move read is a rook's from h1→f1, a1→d1,
  h8→f8 or a8→d8 and castling on that wing was legal, a one-time note "Castle with the king first"
  (in the chip's status and the dialog).
- Speech (`speak` setting): the opponent's move said in practice, unless voice input is on (it says
  them already).

Nothing changes in `src/app/practice.ts`: the refused move is put back by the link's rule 1, Take
back and the opponent's moves change the position, which is driven.

Tests (e2e, `test/e2e/chessnut.spec.ts`, desktop and phone; the practice setup copied from
`practice.spec.ts`: `serveSite` with the fake engine, the fake explorer, a Lichess login):
- a game from a position: the start driven (the simulated board's `drives()` holds it);
- a move by hand (`__move.hand(fen)`) read after the window and played (the move list shows it);
- the opponent's answer driven, lit blue (`__move.lights()`);
- a hand move during the opponent's turn put back after 2 s;
- the repertoire check's refusal (as `practice.spec.ts`'s 2...e6): put back within a second;
- Take back: both moves driven back;
- the hint: the piece's square lit blue, then both;
- a game as Black: the drive turned (`drives()` shows the position turned 180°), a move read
  turned back;
- a third queen (a practice position with two white queens and a pawn on the seventh, promoted):
  "can't set this up" and the game goes on on the screen.

Done when: these pass on both projects.

### Part (e): the set, show and grade, puzzles

Changes in `src/app/storm.ts`:
- `type Phase = 'setup' | 'solving' | …`. Search `phase ===` and `phase !==` in `src/app/storm.ts`
  (about 23 places) and `src/ui/Storm.tsx`: `setup` shows the card as `solving` does but takes no move
  (`asking` stays `phase === 'solving'`, line 1014 today) and says "Setting up the board…" with
  "Play on the screen" (which calls `setPhase('solving')`).
- `deal()`: when `boardLinked()`, a position whose pieces can't be made (`missingPieces`) is
  skipped (dealt again from the queue); else `setPhase('setup')` and then
  `void setUp(item)`: with `playArrival` and `item.card.arrived`, `update({ setupAt: 'before' })`,
  `await boardReached(arrived.before)`, then `update({ setupAt: 'card' })`; then
  `await boardReached(fenOfItem(item))`; then, if the session still holds this card in `setup`,
  `setPhase('solving')`. `boardReached` resolves `false` at once when the board isn't linked or
  the position is unmakeable, so the session never waits on a missing board. Without the board:
  `setPhase('solving')` as today.
- `settle()`, the set's branch: when `boardLinked()` and not held and `autoNext`, schedule
  `nextCard()` as the storm schedules `deal()` (`nextAt`, `nextIn`, `verdictTimer`, the waits
  `STORM.verdictFastMs` after a clean answer and `STORM.verdictMs` else); `pauseVerdict` works
  unchanged. When held and `autoRetry` and `canTryAgain`, `verdictTimer = setTimeout(tryAgain,
  putBackMs)`.
- Show and grade's named move: the same `autoNext` after the verdict.
- Speech (`speak` setting): after a move read from the board, the band's word and, when it wasn't
  the top move, the best move (`v.bestSan`, through `moveToSpeech` from `src/core/games/voice.ts`).
- `boardReached(fen)` (in `boardLink.ts`): resolves `true` when the link reports `synced` with that
  position wanted, `false` when the link isn't `on` or the position is `unmakeable` or the link
  goes off; no timeout (a `stuck` board waits for Send again, a fix by hand, or "Play on the
  screen").

Changes in `src/ui/Storm.tsx`:
- The card's `CardBoard` (line 1062 today): `mirror` with `played` = the verdict's band brush
  (`bandBest` for a top move by `isTopMove`, else `band${Great|Good|Ok|Bad|Blunder}`) once
  answered; `undo` = `{ fen: base, run: tryAgain }` while the card is held and `canTryAgain`;
  `fen` = `card.arrived.before` while `setupAt === 'before'`.
- Show the move: nothing new (the screen drops `played` and draws the best arrow; the board
  follows: the move taken back, the best lit).
- Since this plan was written (PLAN.md §5.154, 2026-11-06), `CardBoard` also takes a `view`: an
  engine line shown on the card (Show refutation, Show line). The mirror follows `view.fen` while
  it is there, and a move read from the board then goes to `view.onMove` (it branches the line),
  not `answerMove`. A continued card (Continue) needs nothing: it is a card of its own, its
  `arrived` the opponent's reply, driven as any card's arrival.
- The setup state: "Setting up the board…" in the status block, the dot in the head.

Tests (e2e, the storm's seeded store and ladder from `storm.spec.ts`):
- a set of 6 with the board: each card driven before it can be answered (the screen's board takes
  no move during `setup`), the arriving move lit blue;
- a great move by hand: graded (the event as from the screen), lit in its band, the next card by
  itself after 1.2 s;
- a held card: the robot takes the move back after 2 s and the card takes a second try; a held
  card taken back by hand: Try again at once;
- Show the move: the move driven back, the best lit green;
- show and grade: the top move lit once shown; a move named on the board graded "#3 of 12";
- a puzzle: the reply driven after the right move;
- `playArrival`: the earlier position driven first, then the card;
- "Play on the screen" during a slow setup (`driveMs: 5000`): the card answers on the screen;
- a card that needs a third queen isn't dealt while linked.

Done when: these pass on both projects. This is the part the owner asked for first: after it, the
owner can test sets and practice on the board.

### Part (f): the timed storm, the review and the retry

- The timed storm's cards: as part (e); the clock stands still during `setup` (it runs only in
  `solving`); check that `startStorm`'s tick ignores `setup`.
- The review's `CardBoard` (line 1383): `mirror` with `delayMs: 1000`, not movable, the review's
  arrows lit.
- The retry from the review (line 1381): `mirror`, movable as it is.

Tests: the clock unchanged across a 2 s setup (`driveMs: 2000`); the review stepped quickly
drives only the row stopped on; a retry by hand graded.

Done when: these pass; then the plan's build is complete and only §7's live checks remain.

---

## 7. Live checks, and what to change for each answer

The spike (part (a)) first, on the device that will drive the board. Report the copied log to any
session.

| Question | How (spike step) | If so | If not |
| --- | --- | --- | --- |
| Does this browser have Web Bluetooth? | 1 | go on | Brave: the flag; else Chrome |
| Does the chooser find the board? Does Android 10 ask for Location? | 2 | go on | Location on and allowed for Chrome; Chessnut's app disconnected; the board on |
| Do reports come during a drive? | 4 | nothing to change: the guard ignores them | nothing to change: the first report after is the result |
| Does a 35-byte write work? Which kind? | 4 | go on | split commands into 20-byte writes in `send` (as Chessnut's app does above its packet size) and try again |
| How long does a storm-like setup take? | 5 | under ~8 s: as planned | longer: say so in the setup state with a progress bar; keep `playArrival` off; the timed storm stays usable since setup doesn't count |
| Which light codes light? | 6 | all eight: as planned | set `basicColours` on by default |
| Force mode with a hand on a piece: safe and sensible? | 4 | keep force | make the flag a setting, default 1, and `resend` on a stopped drive |
| Does the board report a lifted piece at once? | 3 | as planned | nothing to change |
| Pieces' batteries and positions sensible? | 7 | as planned | the dialog shows what it gets |

Then, once parts (d) and (e) are built, the owner's session on the board (TESTING.md, Appendix D):
a set of 6, a show and grade and a practice game, on the phone and on the desktop: how the 600 ms
window and the 2 s put-back feel, the lights, ten minutes with the screen untouched (the wake
lock), and the link after the board's own sleep.

---

## 8. Prompts for the build sessions

Each session starts from the repo; this text is all it needs besides it. Replace the part letter.

> Build CHESSNUT.md part (a) (the codec, the platform module, the simulated board and the spike
> page). Read CLAUDE.md, then CHESSNUT.md §1, §2, §4 and §6 part (a), then PLAN.md §5.153 and
> DECISIONS.md's 2026-11-06 entries. Appendix A's code and Appendix B's tests are tested already:
> copy them in and run them first. When the part is pushed (CLAUDE.md's rules), start the session
> for part (b) with this prompt changed to name it.

Parts (b) to (f) the same, naming the part. After (f), stop and tell the owner the build is
complete and that §7's checks and TESTING.md's entries wait for the board. If the owner has run
the spike before a part is built, the session reads the owner's log first and applies §7's table.

---

## 9. Risks and fallbacks

| Risk | Effect | What the plan does |
| --- | --- | --- |
| A card takes long to set up | the untimed sessions wait | setup never counts on the clock; "Play on the screen"; §7's row |
| Brave's flag | no Bluetooth in Brave | the chip says how; Chrome needs nothing |
| A phone that sleeps | the link drops | the wake lock; reconnect on visibility |
| 35-byte writes refused | no robot, no lights | split writes (§7) |
| Undocumented parts (the `23` reply, codes 4–7, the trailing bytes) | | only the documented parts are relied on; `basicColours` |
| A firmware update changes the protocol | reports unreadable | an unreadable report is dropped, never acted on; the dialog shows "no reports" |
| A piece's battery flat | a drive stuck | `stuck` names the squares; "Check the pieces" names the piece |
| A position the set can't make | no setup | not dealt (storm) or the screen alone (practice) |
| Chessnut's app holding the board | Connect fails | the error says so |
| A rook-first castle | read as a rook move | the note; Take back in practice |

---

## 10. Not in this plan

The repertoire trainer and Learn on the board (the robot playing the line's other side: natural,
not asked), the study page and the analysis board followed by the board, the board's Wi-Fi, its
stored games, Chessnut's other boards (the same UUIDs, other commands), voice combined with the
board beyond speaking the opponent's move, and a local bridge (§4.1).

---

## Appendix A: reference code (tested)

Written and tested 2026-11-06 in a scratch project linked to this repo's `node_modules` (chessops
0.15.1, TypeScript 7.0.2): Appendix B's 23 tests pass; core type-checks alone with no DOM;
the platform module type-checks with the DOM; `scripts/check-boundaries.mjs` passes. Paths are
where each file goes.

### `src/core/board/chessnut.ts`

```ts
// The Chessnut Move's bytes (CHESSNUT.md §2): Chessnut's published Move API, checked against its
// own app (ChessnutNext) and the chessnut-move SDK's tests. Pure: no Bluetooth here.
//
// Squares are chessops's numbers (a1 = 0, b1 = 1 … h8 = 63). On the wire the board runs h8, g8 …
// a8, h7 … a1, two squares a byte from byte 2, the first in the low nibble: wire index 63 − s.

export const MOVE_NAME = 'Chessnut Move';
export const UUIDS = {
  positionService: '1b7e8261-2877-41c3-b46e-cf057c562023',
  position: '1b7e8262-2877-41c3-b46e-cf057c562023',
  commandService: '1b7e8271-2877-41c3-b46e-cf057c562023',
  write: '1b7e8272-2877-41c3-b46e-cf057c562023',
  response: '1b7e8273-2877-41c3-b46e-cf057c562023',
} as const;

/** Starts the position reports (written with response); the board answers a frame starting 0x23. */
export const START_REPORTS = Uint8Array.of(0x21, 0x01, 0x00);
export const ASK_BATTERY = Uint8Array.of(0x41, 0x01, 0x0c);
export const ASK_PIECES = Uint8Array.of(0x41, 0x01, 0x0b);

/** The nibble codes: 0 empty, 1 q, 2 k, 3 b, 4 p, 5 n, 6 R, 7 P, 8 r, 9 B, 10 N, 11 Q, 12 K. */
const CODES = ['', 'q', 'k', 'b', 'p', 'n', 'R', 'P', 'r', 'B', 'N', 'Q', 'K'] as const;
const CODE_OF: Record<string, number> = Object.fromEntries(CODES.map((c, i) => [c, i]).filter(([c]) => c));

/** 64 FEN letters ('' empty), a1 first: the board as the site handles it. */
export type Squares = string[];

const wire = (s: number) => 63 - s;
const nibble = (bytes: Uint8Array, at: number, s: number): number => {
  const k = wire(s);
  const b = bytes[at + (k >> 1)]!;
  return k & 1 ? b >> 4 : b & 0x0f;
};

/** The 64 squares of a 32-byte board block starting at `at`; undefined on an unknown code. */
export function readSquares(bytes: Uint8Array, at: number): Squares | undefined {
  if (bytes.length < at + 32) return undefined;
  const out: Squares = [];
  for (let s = 0; s < 64; s++) {
    const c = CODES[nibble(bytes, at, s)];
    if (c === undefined) return undefined;
    out.push(c);
  }
  return out;
}

/** A position report (38 bytes; 34 at least): its squares, or undefined when it can't be read. */
export const readReport = (bytes: Uint8Array): Squares | undefined => readSquares(bytes, 2);

/** The 32-byte block for 64 squares (codes taken from `code`). */
function block(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(32);
  for (let s = 0; s < 64; s++) {
    const k = wire(s);
    const v = values[s]! & 0x0f;
    out[k >> 1]! |= k & 1 ? v << 4 : v;
  }
  return out;
}

/** The robot: drive the pieces to `squares` (35 bytes). `force` (Chessnut's app's default): a hand
 *  doesn't stop it; else a piece moved by hand halts the drive. */
export function driveTo(squares: Squares, force = true): Uint8Array {
  const out = new Uint8Array(35);
  out.set([0x42, 0x21]);
  out.set(block(squares.map((c) => CODE_OF[c] ?? 0)), 2);
  out[34] = force ? 0 : 1;
  return out;
}

/** Stops a drive under way: `42 21` and 33 zeros. */
export const STOP_DRIVE: Uint8Array = (() => {
  const out = new Uint8Array(35);
  out.set([0x42, 0x21]);
  return out;
})();

/** A square's light: 0–3 in Chessnut's README, 4–7 seen in Chessnut's own app only. */
export const LIGHT = { off: 0, red: 1, green: 2, blue: 3, darkGreen: 4, brightGreen: 5, yellow: 6, orange: 7 } as const;
export type Light = (typeof LIGHT)[keyof typeof LIGHT];

/** The colours the README promises, for a board that shows only those (CHESSNUT.md §4.7). */
export const basic = (l: Light): Light => (l === 4 || l === 5 ? 2 : l === 6 ? 3 : l === 7 ? 1 : l);

/** The lights (34 bytes): one colour a square, a1 first; every other square off. */
export function lightsCommand(lights: readonly Light[]): Uint8Array {
  const out = new Uint8Array(34);
  out.set([0x43, 0x20]);
  out.set(block(Array.from({ length: 64 }, (_, s) => lights[s] ?? 0)), 2);
  return out;
}

export interface Battery {
  charging: boolean;
  percent: number;
}
/** `41 03 0c <charging> <percent>`. */
export function readBattery(bytes: Uint8Array): Battery | undefined {
  if (bytes.length < 5 || bytes[0] !== 0x41 || bytes[2] !== 0x0c) return undefined;
  return { charging: bytes[3] === 1, percent: Math.min(100, bytes[4]!) };
}

/** The pieces in the order the board lists them: White's P×8 R×2 N×2 B×2 Q×2 K, then Black's. */
export const PIECE_ORDER = 'PPPPPPPPRRNNBBQQKpppppppprrnnbbqqk';
export interface PieceState {
  /** Its FEN letter. */
  piece: string;
  /** 0–255 across the board; both 0 when it isn't on it. */
  x: number;
  y: number;
  battery: number;
  onBoard: boolean;
}
/** `41 89 0b` then 34 × (kind, x, y, battery). */
export function readPieces(bytes: Uint8Array): PieceState[] | undefined {
  if (bytes.length < 3 + 34 * 4 || bytes[0] !== 0x41 || bytes[2] !== 0x0b) return undefined;
  const KIND = ' PRNBQKprnbqk';
  return Array.from({ length: 34 }, (_, i) => {
    const at = 3 + i * 4;
    const x = bytes[at + 1]!;
    const y = bytes[at + 2]!;
    return { piece: KIND[bytes[at]!]?.trim() || PIECE_ORDER[i]!, x, y, battery: Math.min(100, bytes[at + 3]!), onBoard: x !== 0 || y !== 0 };
  });
}

/** The board's answer to START_REPORTS (undocumented, seen by the chessnut-move SDK). */
export const isReportsAck = (bytes: Uint8Array): boolean => bytes[0] === 0x23;

/** Squares from a board FEN (its first field) and back. */
export function squaresOf(boardFen: string): Squares | undefined {
  const rows = boardFen.split(' ')[0]!.split('/');
  if (rows.length !== 8) return undefined;
  const out: Squares = new Array(64).fill('');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]!) {
      if (ch >= '1' && ch <= '8') f += Number(ch);
      else if (CODE_OF[ch] !== undefined && f < 8) out[(7 - r) * 8 + f++] = ch;
      else return undefined;
    }
    if (f !== 8) return undefined;
  }
  return out;
}
export function boardFenOf(squares: Squares): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = squares[r * 8 + f]!;
      if (!c) empty++;
      else {
        if (empty) row += empty;
        row += c;
        empty = 0;
      }
    }
    rows.push(row + (empty || ''));
  }
  return rows.join('/');
}
```

### `src/core/board/read.ts`

```ts
// Reading the board (CHESSNUT.md §4): the user's side turned to them, a move from the squares the
// board reports, whether the pieces can make a position, and what differs. Pure, on chessops.
import { Chess, type Position } from 'chessops/chess';
import { makeBoardFen, parseFen } from 'chessops/fen';
import { makeSquare, makeUci } from 'chessops/util';
import type { NormalMove, Role } from 'chessops/types';
import { castlingSide } from 'chessops/chess';
import { kingCastlesTo } from 'chessops/util';
import { squaresOf, type Squares } from './chessnut.ts';

/** The board turned half round: a1 ↔ h8 (square s ↔ 63 − s). Its own inverse. */
export const turned = (squares: Squares): Squares => squares.map((_, s) => squares[63 - s]!);
export const turnSquare = (s: number): number => 63 - s;

/** The squares of a full FEN's position. */
export function squaresOfFen(fen: string): Squares | undefined {
  return squaresOf(fen.split(' ')[0]!);
}

const same = (a: Squares, b: Squares): boolean => a.every((c, s) => c === b[s]);

/** Standard UCI (castling as the king's two-square step), as the site writes moves. */
function uciOf(pos: Position, m: NormalMove): string {
  const side = castlingSide(pos, m);
  return side ? makeUci({ from: m.from, to: kingCastlesTo(pos.turn, side) }) : makeUci(m);
}

const PROMOTIONS: Role[] = ['queen', 'knight', 'rook', 'bishop'];

/** Every legal move of `pos`, promotions to each piece. */
function legalMoves(pos: Position): NormalMove[] {
  const out: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from)!;
      const last = to >> 3 === 0 || to >> 3 === 7;
      if (piece.role === 'pawn' && last) for (const promotion of PROMOTIONS) out.push({ from, to, promotion });
      else out.push({ from, to });
    }
  }
  return out;
}

/**
 * The legal move from `fen` that leaves the board as `seen` shows it (chessops's comparison, as
 * Chessnut's own app reads a move), in standard UCI; undefined when no move does. A pawn left on
 * the last rank, nothing swapped for it, reads as a queen's promotion (§4.3).
 */
export function readMove(fen: string, seen: Squares): string | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const p = pos.value;
  for (const m of legalMoves(p)) {
    const next = p.clone();
    next.play(m);
    const after = squaresOf(makeBoardFen(next.board));
    if (after && same(after, seen)) return uciOf(p, m);
  }
  // The pawn on the last rank, as itself.
  for (const m of legalMoves(p)) {
    if (m.promotion !== 'queen') continue;
    const next = p.clone();
    next.play({ from: m.from, to: m.to });
    next.board.set(m.to, { role: 'pawn', color: p.turn });
    const after = squaresOf(makeBoardFen(next.board));
    if (after && same(after, seen)) return uciOf(p, m);
  }
  return undefined;
}

/** How many of each piece a side has on the Move: two queens (the spare), as Chessnut sells it. */
export const PIECES_ON_THE_BOARD: Record<string, number> = { P: 8, R: 2, N: 2, B: 2, Q: 2, K: 1, p: 8, r: 2, n: 2, b: 2, q: 2, k: 1 };

/** The pieces a position needs beyond the Move's set (none: it can be set up). */
export function missingPieces(squares: Squares): string[] {
  const count: Record<string, number> = {};
  for (const c of squares) if (c) count[c] = (count[c] ?? 0) + 1;
  return Object.entries(count).flatMap(([c, n]) => Array.from({ length: Math.max(0, n - (PIECES_ON_THE_BOARD[c] ?? 0)) }, () => c));
}

export interface Difference {
  square: string;
  /** What the board should have there ('' empty) and what it has. */
  want: string;
  has: string;
}
/** The squares where the board differs from the position wanted. */
export function differences(want: Squares, has: Squares): Difference[] {
  const out: Difference[] = [];
  for (let s = 0; s < 64; s++) if (want[s] !== has[s]) out.push({ square: makeSquare(s), want: want[s]!, has: has[s]! });
  return out;
}

/** Only pieces lifted (squares emptied), nothing put down wrong: a hand still moving, never put back. */
export const onlyLifted = (want: Squares, has: Squares): boolean => has.every((c, s) => c === want[s] || c === '');
```

### `src/core/board/link.ts`

```ts
// The link (CHESSNUT.md §4.4): what to do with each report from the board, each position the site
// wants shown and each tick of the clock. A reducer: the state and an event in, the next state and
// what to do out. Pure: the time comes in the events.
import { differences, missingPieces, onlyLifted, readMove, squaresOfFen, turned } from './read.ts';
import type { Squares } from './chessnut.ts';

export interface LinkSettings {
  /** A move is read once the board has held it this long (ms). */
  settleMs: number;
  /** A wrong position held this long is put back by the robot (ms). */
  putBackMs: number;
  /** A drive not reached in this long is stuck (ms). */
  driveMs: number;
  /** A move handed to the site that leaves its position as it was (refused) is put back after this (ms). */
  refusedMs: number;
}
export const LINK_DEFAULTS: LinkSettings = { settleMs: 600, putBackMs: 2000, driveMs: 20000, refusedMs: 500 };

/** What the site shows on the board mirrored (one at a time). */
export interface Want {
  /** The position, a full FEN. */
  fen: string;
  /** The user may move now (the screen's board takes a move). */
  movable: boolean;
  /** Set up turned half round (the user plays Black from the near edge). */
  turned: boolean;
  /** The position a move taken back by hand returns to (a storm card's Try again), if any. */
  undoFen?: string;
}

export type Phase = 'idle' | 'driving' | 'synced' | 'stuck' | 'unmakeable';

export interface LinkState {
  want?: Want;
  /** What the board must show for `want` (turned when asked). */
  target?: Squares;
  phase: Phase;
  /** When the drive under way was sent. */
  sentAt?: number;
  /** The board's last report, and when it last changed. */
  seen?: Squares;
  seenAt?: number;
  /** A move handed to the site, and when; cleared when the site's position changes. */
  handed?: { uci: string; at: number };
  /** The report a put-back or a move was last acted on, so one report is acted on once. */
  actedOn?: Squares;
}

export type Action =
  | { t: 'drive'; squares: Squares }
  | { t: 'move'; uci: string }
  | { t: 'undo' }
  | { t: 'phase'; phase: Phase; missing?: string[] };

export type Event =
  | { t: 'want'; want: Want | undefined; now: number }
  | { t: 'report'; squares: Squares; now: number }
  | { t: 'tick'; now: number }
  /** The link came back, or Send again: drive to the position wanted if the board differs. */
  | { t: 'resend'; now: number };

const same = (a: Squares | undefined, b: Squares | undefined): boolean => !!a && !!b && a.every((c, s) => c === b[s]);
const physical = (fen: string, turn: boolean): Squares | undefined => {
  const s = squaresOfFen(fen);
  return s && (turn ? turned(s) : s);
};

export const initialLink = (): LinkState => ({ phase: 'idle' });

export function step(state: LinkState, e: Event, o: LinkSettings = LINK_DEFAULTS): [LinkState, Action[]] {
  const out: Action[] = [];
  let s: LinkState = { ...state };
  const setPhase = (phase: Phase, missing?: string[]) => {
    if (s.phase !== phase) out.push(missing ? { t: 'phase', phase, missing } : { t: 'phase', phase });
    s.phase = phase;
  };
  const drive = (now: number) => {
    out.push({ t: 'drive', squares: s.target! });
    s.sentAt = now;
    s.actedOn = s.seen;
    setPhase('driving');
  };

  if (e.t === 'want') {
    const was = s.want;
    s.want = e.want;
    if (!e.want) {
      const { target: _t, handed: _h, sentAt: _a, ...rest } = s;
      s = { ...rest, want: undefined };
      setPhase('idle');
      return [s, out];
    }
    const target = physical(e.want.fen, e.want.turned);
    if (!target) return [s, out];
    const moved = !same(target, s.target);
    s.target = target;
    if (moved || !was) {
      delete s.handed;
      const missing = missingPieces(target);
      if (missing.length) {
        setPhase('unmakeable', missing);
        return [s, out];
      }
      if (same(s.seen, target)) setPhase('synced');
      else drive(e.now);
    }
    return [s, out];
  }

  if (e.t === 'resend') {
    if (s.target && s.phase !== 'unmakeable' && !same(s.seen, s.target)) drive(e.now);
    return [s, out];
  }

  if (e.t === 'report') {
    if (!same(e.squares, s.seen)) {
      s.seen = e.squares;
      s.seenAt = e.now;
    }
    // A drive is done when the board shows its position; reports on the way are only watched.
    if ((s.phase === 'driving' || s.phase === 'stuck') && same(s.seen, s.target)) setPhase('synced');
    return [s, out];
  }

  // A tick.
  const now = e.now;
  if (s.phase === 'driving') {
    if (s.sentAt !== undefined && now - s.sentAt >= o.driveMs) setPhase('stuck');
    return [s, out];
  }
  if (s.phase !== 'synced' || !s.want || !s.target || !s.seen || s.seenAt === undefined) return [s, out];
  if (same(s.seen, s.target)) return [s, out];
  // A move handed over that the site turned down (its position unchanged): put back at once.
  if (s.handed && now - s.handed.at >= o.refusedMs && same(s.seen, s.actedOn)) {
    delete s.handed;
    drive(now);
    return [s, out];
  }
  if (s.handed || same(s.seen, s.actedOn)) {
    // Acted on already: wait for the site, or for the hand to change something.
    if (!s.handed && now - s.seenAt >= o.putBackMs && !onlyLifted(s.target, s.seen)) drive(now);
    return [s, out];
  }
  const held = now - s.seenAt;
  if (held < o.settleMs) return [s, out];
  const logical = s.want.turned ? turned(s.seen) : s.seen;
  if (s.want.movable) {
    const uci = readMove(s.want.fen, logical);
    if (uci) {
      s.handed = { uci, at: now };
      s.actedOn = s.seen;
      out.push({ t: 'move', uci });
      return [s, out];
    }
  }
  if (s.want.undoFen) {
    const back = squaresOfFen(s.want.undoFen);
    if (back && same(back, logical)) {
      s.actedOn = s.seen;
      out.push({ t: 'undo' });
      return [s, out];
    }
  }
  // Something put down wrong (not just lifted), held: the robot sets the position again.
  if (held >= o.putBackMs && !onlyLifted(s.target, s.seen)) drive(now);
  return [s, out];
}

export { differences };
```

### `src/core/board/lights.ts`

```ts
// The board's lights from what the screen's board shows (CHESSNUT.md §4.7): the last move blue,
// each arrow in its brush's colour on its two squares, at most a few. Pure.
import { parseSquare } from 'chessops/util';
import { basic, LIGHT, type Light } from './chessnut.ts';

export interface Marks {
  /** The move that led to the position shown (UCI). */
  lastUci?: string | undefined;
  /** The arrows drawn by the site (not the user's sketch); one with no `dest` is a circle (a hint's piece). */
  arrows?: readonly { orig: string; dest?: string | undefined; brush: string }[] | undefined;
  /** The user's move once graded, lit in its band's brush (the storm's verdict, practice's feedback). */
  played?: { uci: string; brush: string } | undefined;
  /** Squares lit red: where the board differs from the position (CHESSNUT.md §4.4). */
  wrong?: readonly string[] | undefined;
}

/** A brush's light: chessground's own brushes and the storm's bands (Board.tsx's BAND_BRUSHES). */
export const BRUSH_LIGHT: Record<string, Light> = {
  green: LIGHT.green,
  paleGreen: LIGHT.green,
  red: LIGHT.red,
  paleRed: LIGHT.red,
  blue: LIGHT.blue,
  paleBlue: LIGHT.blue,
  yellow: LIGHT.yellow,
  bandBest: LIGHT.brightGreen,
  bandGreat: LIGHT.green,
  bandGood: LIGHT.darkGreen,
  bandOk: LIGHT.yellow,
  bandBad: LIGHT.orange,
  bandBlunder: LIGHT.red,
};

/** More arrows than this (show and grade's twelve): only the top move's are lit. */
export const MAX_LIT_ARROWS = 3;

export function lightsFor(m: Marks, o: { turned: boolean; basicOnly: boolean }): Light[] {
  const out: Light[] = new Array(64).fill(LIGHT.off);
  const put = (name: string | undefined, l: Light) => {
    const s = name === undefined ? undefined : parseSquare(name);
    if (s === undefined) return;
    out[o.turned ? 63 - s : s] = o.basicOnly ? basic(l) : l;
  };
  if (m.lastUci) {
    put(m.lastUci.slice(0, 2), LIGHT.blue);
    put(m.lastUci.slice(2, 4), LIGHT.blue);
  }
  if (m.played) {
    const l = BRUSH_LIGHT[m.played.brush] ?? LIGHT.blue;
    put(m.played.uci.slice(0, 2), l);
    put(m.played.uci.slice(2, 4), l);
  }
  let arrows = [...(m.arrows ?? [])];
  if (arrows.length > MAX_LIT_ARROWS) arrows = arrows.filter((a) => a.brush === 'bandBest' || a.brush === 'green').slice(0, MAX_LIT_ARROWS);
  for (const a of arrows) {
    const l = BRUSH_LIGHT[a.brush] ?? LIGHT.blue;
    put(a.orig, l);
    put(a.dest, l);
  }
  for (const w of m.wrong ?? []) put(w, LIGHT.red);
  return out;
}
```

### `src/core/board/port.ts`

```ts
// The physical board as core sees it (CHESSNUT.md §4.5): a port, as Remote and Clock are,
// implemented over Web Bluetooth in src/platform/chessnut.ts and faked in the tests.
import type { Battery, Light, PieceState, Squares } from './chessnut.ts';

export interface PhysicalBoard {
  /** The device's name as the chooser showed it. */
  readonly name: string;
  /** Every position report, read (unreadable ones are dropped). */
  onReport(f: (squares: Squares) => void): void;
  /** The link dropped (the board off, out of range, the page hidden). */
  onGone(f: () => void): void;
  /** Connects again to the same board, with no chooser; false when it can't. */
  reconnect(): Promise<boolean>;
  /** The robot drives the pieces to `squares` (force mode unless `force` is false). */
  drive(squares: Squares, force?: boolean): Promise<boolean>;
  stopDrive(): Promise<boolean>;
  lights(lights: readonly Light[]): Promise<boolean>;
  battery(): Promise<Battery | undefined>;
  pieces(): Promise<PieceState[] | undefined>;
  close(): void;
}
```

### `src/platform/chessnut.ts`

```ts
// The Chessnut Move over Web Bluetooth (CHESSNUT.md §4.5): the chooser, the two services, the
// reports, and a write queue (one write at a time, 100 ms apart, as Chessnut's own app writes; the
// other write kind tried when one fails). TypeScript's DOM library has no Web Bluetooth, so the
// little used is declared here.
import { ASK_BATTERY, ASK_PIECES, driveTo, isReportsAck, lightsCommand, MOVE_NAME, readBattery, readPieces, readReport, START_REPORTS, STOP_DRIVE, UUIDS, type Battery, type Light, type PieceState, type Squares } from '../core/board/chessnut.ts';
import type { PhysicalBoard } from '../core/board/port.ts';

interface BtCharacteristic extends EventTarget {
  readonly value?: DataView | undefined;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>;
}
interface BtServer {
  readonly connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BtService>;
}
export interface BtDevice extends EventTarget {
  readonly name?: string | undefined;
  readonly gatt?: BtServer | undefined;
}
interface Bluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: { filters: { name: string }[]; optionalServices: string[] }): Promise<BtDevice>;
}

export const bluetooth = (): Bluetooth | undefined => (globalThis.navigator as (Navigator & { bluetooth?: Bluetooth }) | undefined)?.bluetooth;

/** Why the board can't be used here, or undefined when it can be tried. */
export async function bluetoothMissing(): Promise<'api' | 'adapter' | undefined> {
  const bt = bluetooth();
  if (!bt) return 'api';
  try {
    return (await bt.getAvailability()) ? undefined : 'adapter';
  } catch {
    return undefined;
  }
}

/** The chooser (a click must start it), then the board opened. Throws when nothing is picked. */
export async function pickBoard(): Promise<PhysicalBoard> {
  const bt = bluetooth();
  if (!bt) throw new Error('No Web Bluetooth in this browser');
  const device = await bt.requestDevice({ filters: [{ name: MOVE_NAME }], optionalServices: [UUIDS.positionService, UUIDS.commandService] });
  return openBoard(device);
}

const GAP_MS = 100;
const ANSWER_MS = 3000;

export async function openBoard(device: BtDevice, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<PhysicalBoard> {
  const reportFns: ((s: Squares) => void)[] = [];
  const goneFns: (() => void)[] = [];
  const answerFns = new Set<(b: Uint8Array) => void>();
  let write: BtCharacteristic | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let lastWrite = 0;
  let closed = false;

  const bytesOf = (e: Event): Uint8Array | undefined => {
    const v = (e.target as BtCharacteristic).value;
    return v && new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
  };
  const onReport = (e: Event) => {
    const b = bytesOf(e);
    const squares = b && readReport(b);
    if (squares) for (const f of reportFns) f(squares);
  };
  const onAnswer = (e: Event) => {
    const b = bytesOf(e);
    if (b && !isReportsAck(b)) for (const f of answerFns) f(b);
  };

  async function connect(): Promise<void> {
    const server = await device.gatt!.connect();
    const positions = await (await server.getPrimaryService(UUIDS.positionService)).getCharacteristic(UUIDS.position);
    const commands = await server.getPrimaryService(UUIDS.commandService);
    write = await commands.getCharacteristic(UUIDS.write);
    const answers = await commands.getCharacteristic(UUIDS.response);
    // The SDK's order: the reports subscribed, the reports started, then the answers subscribed.
    positions.addEventListener('characteristicvaluechanged', onReport);
    await positions.startNotifications();
    await send(START_REPORTS, true);
    answers.addEventListener('characteristicvaluechanged', onAnswer);
    await answers.startNotifications();
  }

  /** One write at a time, 100 ms after the last; the other kind of write when one fails. */
  function send(bytes: Uint8Array, withResponse = false): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      const wait = lastWrite + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      for (const response of withResponse ? [true, false] : [false, true]) {
        try {
          if (!write) return false;
          const data = bytes.slice().buffer;
          await (response ? write.writeValueWithResponse(data) : write.writeValueWithoutResponse(data));
          lastWrite = Date.now();
          return true;
        } catch {
          // the other kind next
        }
      }
      return false;
    };
    const p = queue.then(run, run);
    queue = p;
    return p;
  }

  /** A query, and the first answer of its type within 3 s. */
  function ask<T>(query: Uint8Array, read: (b: Uint8Array) => T | undefined): Promise<T | undefined> {
    return new Promise((resolve) => {
      const done = (v: T | undefined) => {
        answerFns.delete(f);
        clearTimeout(timer);
        resolve(v);
      };
      const f = (b: Uint8Array) => {
        const v = read(b);
        if (v !== undefined) done(v);
      };
      const timer = setTimeout(() => done(undefined), ANSWER_MS);
      answerFns.add(f);
      void send(query, true).then((ok) => !ok && done(undefined));
    });
  }

  device.addEventListener('gattserverdisconnected', () => {
    write = undefined;
    if (!closed) for (const f of goneFns) f();
  });
  await connect();

  return {
    name: device.name ?? MOVE_NAME,
    onReport: (f) => void reportFns.push(f),
    onGone: (f) => void goneFns.push(f),
    async reconnect() {
      try {
        await connect();
        return true;
      } catch {
        return false;
      }
    },
    drive: (squares, force = true) => send(driveTo(squares, force)),
    stopDrive: () => send(STOP_DRIVE),
    lights: (l: readonly Light[]) => send(lightsCommand(l)),
    battery: (): Promise<Battery | undefined> => ask(ASK_BATTERY, readBattery),
    pieces: (): Promise<PieceState[] | undefined> => ask(ASK_PIECES, readPieces),
    close() {
      closed = true;
      device.gatt?.disconnect();
    },
  };
}
```

---

## Appendix B: reference tests and the simulated board

The import paths are the scratch project's (`../src/…`); in the repo they become
`../../../../src/core/board/…` from `test/unit/core/board/`, and the e2e helper's own path.

### The core tests (`test/unit/core/board/*.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_BATTERY, boardFenOf, driveTo, LIGHT, lightsCommand, readBattery, readPieces, readReport, squaresOf, STOP_DRIVE, type Squares } from '../src/core/board/chessnut.ts';
import { differences, missingPieces, onlyLifted, readMove, squaresOfFen, turned } from '../src/core/board/read.ts';
import { initialLink, step, type Action, type Event, type LinkState } from '../src/core/board/link.ts';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const report = (boardFen: string) => {
  const r = new Uint8Array(38);
  r.set(driveTo(squaresOf(boardFen)!).slice(2, 34), 2);
  return r;
};

test('the start position, byte for byte', () => {
  const d = driveTo(squaresOf(START)!);
  console.log('drive(start) =', hex(d));
  assert.equal(d.length, 35);
  assert.equal(boardFenOf(readReport(report(START))!), START);
});

test('the SDK example: byte 2 = 0x21 is h8 black queen, g8 black king', () => {
  const r = new Uint8Array(38);
  r[2] = 0x21;
  assert.equal(boardFenOf(readReport(r)!), '6kq/8/8/8/8/8/8/8');
});

test('round trips', () => {
  for (const f of ['r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1', '8/8/8/8/8/8/8/K6k', 'q7/8/8/8/8/8/8/7Q', '8/P7/8/8/8/8/7p/8'])
    assert.equal(boardFenOf(readReport(report(f))!), f);
});

test('an unknown code is not read', () => {
  const r = report(START);
  r[10] = 0xdd;
  assert.equal(readReport(r), undefined);
  assert.equal(readReport(new Uint8Array(20)), undefined);
});

test('stop and lights', () => {
  assert.equal(hex(STOP_DRIVE), '42 21' + ' 00'.repeat(33));
  const lights: number[] = new Array(64).fill(0);
  lights[63] = LIGHT.red; // h8
  lights[62] = LIGHT.green; // g8
  lights[0] = LIGHT.blue; // a1
  const c = lightsCommand(lights as never);
  console.log('lights(h8 red, g8 green, a1 blue) =', hex(c));
  assert.equal(c.length, 34);
  assert.equal(c[2], 0x21);
  assert.equal(c[33], 0x30);
});

test('battery and pieces', () => {
  assert.deepEqual(readBattery(Uint8Array.of(0x41, 0x03, 0x0c, 0x01, 72)), { charging: true, percent: 72 });
  assert.equal(readBattery(ASK_BATTERY), undefined);
  const b = new Uint8Array(3 + 34 * 4);
  b.set([0x41, 0x89, 0x0b]);
  b.set([1, 10, 20, 90], 3);
  b.set([12, 0, 0, 5], 3 + 33 * 4);
  const p = readPieces(b)!;
  assert.deepEqual(p[0], { piece: 'P', x: 10, y: 20, battery: 90, onBoard: true });
  assert.deepEqual(p[33], { piece: 'k', x: 0, y: 0, battery: 5, onBoard: false });
});

const S = (fen: string): Squares => squaresOfFen(fen)!;
const after = (fen: string) => S(fen);

test('moves read from the squares', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')), 'e2e4');
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1')), 'g1f3');
  // A piece lifted reads as nothing.
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1')), undefined);
  // Castling, both wings, both sides, as the king's two-square step.
  const castle = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 b kq - 1 1')), 'e1g1');
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/2KR3R b kq - 1 1')), 'e1c1');
  const castleB = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1';
  assert.equal(readMove(castleB, after('r4rk1/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2')), 'e8g8');
  assert.equal(readMove(castleB, after('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2')), 'e8c8');
  // The rook moved first and left: a rook move (the screen says to castle with the king first).
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3KR2 b Qkq - 1 1')), 'h1f1');
  // The king alone on g1: no move yet.
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R5KR w KQkq - 0 1')), undefined);
  // En passant.
  const ep = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
  assert.equal(readMove(ep, after('rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3')), 'e5f6');
  // Promotions: the spare queen put down, a knight put down, the pawn left on the last rank.
  const promo = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
  assert.equal(readMove(promo, after('4Q3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8q');
  assert.equal(readMove(promo, after('4N3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8n');
  assert.equal(readMove(promo, after('4P3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8q');
  // A capture.
  const cap = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
  assert.equal(readMove(cap, after('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2')), 'e4d5');
  // Only the captured pawn taken off: nothing yet.
  assert.equal(readMove(cap, after('rnbqkbnr/ppp1pppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')), undefined);
});

test('the pieces a position needs', () => {
  assert.deepEqual(missingPieces(S('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')), []);
  assert.deepEqual(missingPieces(S('k7/8/8/8/8/8/8/QQQ1K3 w - - 0 1')), ['Q']);
  assert.deepEqual(missingPieces(S('k7/8/8/8/8/8/8/NNN1K3 w - - 0 1')), ['N']);
});

test('differences and lifted pieces', () => {
  const want = S('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
  const lifted = S('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w - - 0 1');
  assert.deepEqual(differences(want, lifted), [{ square: 'e2', want: 'P', has: '' }]);
  assert.equal(onlyLifted(want, lifted), true);
  assert.equal(onlyLifted(want, S('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 1')), false);
});

// The link, driven through scripted events.
function run(events: Event[], state: LinkState = initialLink()): { state: LinkState; actions: Action[] } {
  const actions: Action[] = [];
  for (const e of events) {
    const [s, a] = step(state, e);
    state = s;
    actions.push(...a);
  }
  return { state, actions };
}
const FEN0 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const FEN2 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const sq = (fen: string) => S(fen);
const kinds = (a: Action[]) => a.map((x) => (x.t === 'phase' ? `phase:${x.phase}` : x.t === 'move' ? `move:${x.uci}` : x.t));

test('a position sent, reports on the way ignored, then in sync', () => {
  const { state, actions } = run([
    { t: 'report', squares: sq('8/8/8/8/8/8/8/K6k w - - 0 1'), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 10 },
    // On the way: a position one legal move from nothing; never read.
    { t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/8/8/8/K6k w - - 0 1'), now: 500 },
    { t: 'tick', now: 2000 },
    { t: 'report', squares: sq(FEN0), now: 4000 },
  ]);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving', 'phase:synced']);
  assert.equal(state.phase, 'synced');
});

test('a move by hand read after the window, once', () => {
  const start = run([
    { t: 'report', squares: sq(FEN0), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
  ]);
  assert.equal(start.state.phase, 'synced');
  const { state, actions } = run(
    [
      { t: 'report', squares: sq(FEN1), now: 1000 },
      { t: 'tick', now: 1300 },
      { t: 'tick', now: 1700 },
      { t: 'tick', now: 1900 },
    ],
    start.state,
  );
  assert.deepEqual(kinds(actions), ['move:e2e4']);
  // The site shows the move: in sync, nothing driven.
  const next = run([{ t: 'want', want: { fen: FEN1, movable: false, turned: false }, now: 2000 }], state);
  assert.deepEqual(kinds(next.actions), []);
  assert.equal(next.state.phase, 'synced');
  // The opponent's answer: driven.
  const reply = run([{ t: 'want', want: { fen: FEN2, movable: true, turned: false }, now: 2500 }], next.state);
  assert.deepEqual(kinds(reply.actions), ['drive', 'phase:driving']);
});

test('a move the site turns down is put back at once', () => {
  const start = run([
    { t: 'report', squares: sq(FEN0), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
    { t: 'report', squares: sq(FEN1), now: 1000 },
    { t: 'tick', now: 1700 },
  ]);
  assert.deepEqual(kinds(start.actions), ['phase:synced', 'move:e2e4']);
  const { actions } = run([{ t: 'tick', now: 2100 }, { t: 'tick', now: 2300 }], start.state);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving']);
});

test('a hand during the opponent\'s turn put back after 2 s; a piece only lifted never', () => {
  const start = run([
    { t: 'report', squares: sq(FEN1), now: 0 },
    { t: 'want', want: { fen: FEN1, movable: false, turned: false }, now: 0 },
  ]);
  const lifted = run([{ t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1'), now: 100 }, { t: 'tick', now: 5000 }], start.state);
  assert.deepEqual(kinds(lifted.actions), []);
  const moved = run([{ t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1'), now: 100 }, { t: 'tick', now: 1500 }, { t: 'tick', now: 2200 }], start.state);
  assert.deepEqual(kinds(moved.actions), ['drive', 'phase:driving']);
});

test('a Black player\'s board is turned, and moves are read turned back', () => {
  const blackToMove = FEN1;
  const { state, actions } = run([
    { t: 'report', squares: turned(sq(blackToMove)), now: 0 },
    { t: 'want', want: { fen: blackToMove, movable: true, turned: true }, now: 0 },
    { t: 'report', squares: turned(sq('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')), now: 100 },
    { t: 'tick', now: 800 },
  ]);
  assert.equal(state.phase, 'synced');
  assert.deepEqual(kinds(actions), ['phase:synced', 'move:c7c5']);
});

test('a held card\'s move taken back by hand is Try again', () => {
  const card = FEN0;
  const { actions } = run([
    { t: 'report', squares: sq(FEN1), now: 0 },
    { t: 'want', want: { fen: FEN1, movable: false, turned: false, undoFen: card }, now: 0 },
    { t: 'report', squares: sq(card), now: 100 },
    { t: 'tick', now: 800 },
  ]);
  assert.deepEqual(kinds(actions), ['phase:synced', 'undo']);
});

test('a drive not reached in 20 s is stuck; fixed by hand it is in sync', () => {
  const { state, actions } = run([
    { t: 'report', squares: sq('8/8/8/8/8/8/8/K6k w - - 0 1'), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
    { t: 'tick', now: 20000 },
    { t: 'report', squares: sq(FEN0), now: 25000 },
  ]);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving', 'phase:stuck', 'phase:synced']);
  assert.equal(state.phase, 'synced');
});

test('a position the pieces can\'t make is never driven', () => {
  const { actions } = run([{ t: 'want', want: { fen: 'k7/8/8/8/8/8/8/QQQ1K3 w - - 0 1', movable: true, turned: false }, now: 0 }]);
  assert.deepEqual(actions, [{ t: 'phase', phase: 'unmakeable', missing: ['Q'] }]);
});
```

### The lights' tests

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightsFor } from '../src/core/board/lights.ts';
import { LIGHT } from '../src/core/board/chessnut.ts';

const lit = (l: number[]) => Object.fromEntries(l.flatMap((v, s) => (v ? [['abcdefgh'[s & 7]! + ((s >> 3) + 1), v]] : [])));

test('the last move blue, arrows over it, the wrong squares red', () => {
  assert.deepEqual(lit(lightsFor({ lastUci: 'e2e4' }, { turned: false, basicOnly: false })), { e2: LIGHT.blue, e4: LIGHT.blue });
  assert.deepEqual(lit(lightsFor({ lastUci: 'e7e5', arrows: [{ orig: 'g1', dest: 'f3', brush: 'green' }, { orig: 'e5', dest: 'd4', brush: 'red' }] }, { turned: false, basicOnly: false })), { e7: 3, e5: 1, g1: 2, f3: 2, d4: 1 });
  assert.deepEqual(lit(lightsFor({ wrong: ['c3'] }, { turned: false, basicOnly: false })), { c3: 1 });
});

test('turned for a Black player; the four basic colours when asked', () => {
  assert.deepEqual(lit(lightsFor({ lastUci: 'e2e4' }, { turned: true, basicOnly: false })), { d7: 3, d5: 3 });
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'a1', dest: 'a2', brush: 'bandBad' }] }, { turned: false, basicOnly: true })), { a1: 1, a2: 1 });
});

test('twelve arrows: the top move only', () => {
  const arrows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((f, i) => ({ orig: `${f}2`, dest: `${f}3`, brush: i === 2 ? 'bandBest' : 'bandOk' }));
  assert.deepEqual(lit(lightsFor({ arrows }, { turned: false, basicOnly: false })), { c2: 5, c3: 5 });
});

test('a graded move in its band', () => {
  assert.deepEqual(lit(lightsFor({ lastUci: 'g1f3', played: { uci: 'g1f3', brush: 'bandBad' } }, { turned: false, basicOnly: false })), { g1: 7, f3: 7 });
});

test('a hint: the piece, then its square', () => {
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'g1', brush: 'blue' }] }, { turned: false, basicOnly: false })), { g1: 3 });
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'g1', dest: 'f3', brush: 'blue' }] }, { turned: false, basicOnly: false })), { g1: 3, f3: 3 });
});
```

### The simulated Move (`test/e2e/chessnut.ts`)

In a browser test: `await page.addInitScript(installFakeMove, { driveMs: 300 })` before
`page.goto`, then `page.evaluate(() => (window as any).__move.hand('<board FEN>'))` for a hand, and
`__move.drives()`, `__move.lights()`, `__move.writes()`, `__move.position()`, `__move.drop()` to
look and to break.

```ts
// A simulated Chessnut Move for the browser tests (CHESSNUT.md §6.3), put in place of
// `navigator.bluetooth` by `page.addInitScript(installFakeMove, options)`. Self-contained (an init
// script can't import): its own small codec. The test drives it through `window.__move`.
export interface FakeMoveOptions {
  /** The board's position when the page opens (a board FEN). */
  start?: string;
  /** How long the robot takes to reach a position, ms. */
  driveMs?: number;
  /** Report a position half-way through a drive (Chessnut's app says the board does). */
  reportOnTheWay?: boolean;
  /** The chooser finds no board. */
  none?: boolean;
}

export function installFakeMove(o: FakeMoveOptions = {}): void {
  const CODES = ['', 'q', 'k', 'b', 'p', 'n', 'R', 'P', 'r', 'B', 'N', 'Q', 'K'];
  const squaresOf = (fen: string): string[] => {
    const out: string[] = new Array(64).fill('');
    fen.split(' ')[0]!.split('/').forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') f += Number(ch);
        else out[(7 - r) * 8 + f++] = ch;
      }
    });
    return out;
  };
  const fenOf = (sq: string[]): string => {
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let row = '';
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const c = sq[r * 8 + f]!;
        if (!c) e++;
        else {
          row += (e || '') + c;
          e = 0;
        }
      }
      rows.push(row + (e || ''));
    }
    return rows.join('/');
  };
  const pack = (values: number[]): number[] => {
    const out = new Array(32).fill(0);
    for (let s = 0; s < 64; s++) {
      const k = 63 - s;
      out[k >> 1] |= k & 1 ? values[s]! << 4 : values[s]!;
    }
    return out;
  };
  const unpack = (bytes: Uint8Array, at: number): number[] =>
    Array.from({ length: 64 }, (_, s) => {
      const k = 63 - s;
      const b = bytes[at + (k >> 1)]!;
      return k & 1 ? b >> 4 : b & 15;
    });

  let squares = squaresOf(o.start ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  let lights: number[] = new Array(64).fill(0);
  let reporting = false;
  let connected = false;
  let driveTimers: ReturnType<typeof setTimeout>[] = [];
  const writes: string[] = [];
  const drives: string[] = [];

  class Char extends EventTarget {
    value: DataView | undefined;
    onWrite: ((b: Uint8Array) => void) | undefined;
    constructor(onWrite?: (b: Uint8Array) => void) {
      super();
      this.onWrite = onWrite;
    }
    async startNotifications() {
      return this;
    }
    emit(bytes: number[]) {
      this.value = new DataView(Uint8Array.from(bytes).buffer);
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    }
    async writeValueWithResponse(v: ArrayBuffer) {
      if (!connected) throw new Error('GATT Server is disconnected');
      this.onWrite?.(new Uint8Array(v));
    }
    async writeValueWithoutResponse(v: ArrayBuffer) {
      return this.writeValueWithResponse(v);
    }
  }
  const position = new Char();
  const response = new Char();
  const report = () => reporting && connected && position.emit([0x01, 0x24, ...pack(squares.map((c) => CODES.indexOf(c))), 0, 0, 0, 0]);
  const command = new Char((b) => {
    writes.push(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' '));
    if (b[0] === 0x21) {
      reporting = true;
      response.emit([0x23, 0x01, 0x00]);
      report();
    } else if (b[0] === 0x42) {
      driveTimers.forEach(clearTimeout);
      driveTimers = [];
      const target = unpack(b, 2).map((c) => CODES[c]!);
      if (b.slice(2).every((x) => x === 0)) return;
      drives.push(fenOf(target));
      const ms = o.driveMs ?? 300;
      if (o.reportOnTheWay !== false)
        driveTimers.push(
          setTimeout(() => {
            // Half the squares that differ, as a drive on its way.
            let n = 0;
            squares = squares.map((c, s) => (c !== target[s] && n++ % 2 === 0 ? target[s]! : c));
            report();
          }, ms / 2),
        );
      driveTimers.push(
        setTimeout(() => {
          squares = target;
          report();
        }, ms),
      );
    } else if (b[0] === 0x43) {
      lights = unpack(b, 2);
    } else if (b[0] === 0x41 && b[2] === 0x0c) {
      response.emit([0x41, 0x03, 0x0c, 0x00, 87]);
    } else if (b[0] === 0x41 && b[2] === 0x0b) {
      const kinds = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];
      response.emit([0x41, 0x89, 0x0b, ...kinds.flatMap((k, i) => [k, 10 + i, 10 + i, i === 3 ? 12 : 90])]);
    }
  });
  const service = (uuid: string) => ({
    async getCharacteristic(c: string) {
      if (uuid.startsWith('1b7e8261') && c.startsWith('1b7e8262')) return position;
      if (uuid.startsWith('1b7e8271') && c.startsWith('1b7e8272')) return command;
      if (uuid.startsWith('1b7e8271') && c.startsWith('1b7e8273')) return response;
      throw new Error('NotFoundError: no characteristic ' + c);
    },
  });
  const device = Object.assign(new EventTarget(), { name: 'Chessnut Move', gatt: undefined as unknown });
  const server = {
    get connected() {
      return connected;
    },
    async connect() {
      connected = true;
      return server;
    },
    disconnect() {
      connected = false;
      reporting = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    async getPrimaryService(uuid: string) {
      return service(uuid);
    },
  };
  device.gatt = server;
  const bluetooth = {
    async getAvailability() {
      return true;
    },
    async requestDevice() {
      if (o.none) throw new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError');
      return device;
    },
  };
  Object.defineProperty(globalThis.navigator, 'bluetooth', { value: bluetooth, configurable: true });
  (globalThis as unknown as { __move: unknown }).__move = {
    /** A hand puts the board as `fen` shows (a board FEN). */
    hand(fen: string) {
      squares = squaresOf(fen);
      report();
    },
    position: () => fenOf(squares),
    lights: () => lights.slice(),
    writes: () => writes.slice(),
    drives: () => drives.slice(),
    /** The board goes away (off, out of range). */
    drop: () => server.disconnect(),
  };
}
```

### The platform test (`test/unit/platform/chessnut.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeMove } from './fakeMove.ts';
import { boardFenOf, LIGHT, squaresOf, type Squares } from '../src/core/board/chessnut.ts';
import { bluetoothMissing, pickBoard } from '../src/platform/chessnut.ts';

type Fake = { hand(f: string): void; position(): string; lights(): number[]; writes(): string[]; drives(): string[]; drop(): void };
const fake = () => (globalThis as unknown as { __move: Fake }).__move;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('the platform module against the simulated board', async () => {
  installFakeMove({ driveMs: 200 });
  assert.equal(await bluetoothMissing(), undefined);
  const board = await pickBoard();
  const seen: string[] = [];
  let gone = 0;
  board.onReport((s: Squares) => seen.push(boardFenOf(s)));
  board.onGone(() => gone++);
  // Reports started; the first arrives on connect (it came before onReport here: a hand now).
  assert.equal(fake().writes()[0], '21 01 00');
  fake().hand('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  assert.equal(seen.at(-1), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
  // A drive: a report on the way, then the position.
  await board.drive(squaresOf('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR')!);
  await wait(300);
  assert.equal(seen.at(-1), 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
  assert.ok(seen.length >= 3);
  // Lights, battery, pieces.
  const l = new Array(64).fill(0);
  l[12] = LIGHT.green; // e2
  await board.lights(l);
  assert.equal(fake().lights()[12], LIGHT.green);
  assert.deepEqual(await board.battery(), { charging: false, percent: 87 });
  const pieces = (await board.pieces())!;
  assert.equal(pieces.length, 34);
  assert.equal(pieces[3]!.battery, 12);
  // Writes 100 ms apart at least.
  // Gone, then back with no chooser.
  fake().drop();
  assert.equal(gone, 1);
  assert.equal(await board.drive(squaresOf('8/8/8/8/8/8/8/K6k')!), false);
  assert.equal(await board.reconnect(), true);
  assert.equal(await board.drive(squaresOf('8/8/8/8/8/8/8/K6k')!), true);
  board.close();
});
```

---

## Appendix C: byte vectors

From the reference codec (checked against Chessnut's app's encoder and the README's decoder):

- Drive to the start position (force):
  `42 21 58 23 31 85 44 44 44 44 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 77 77 77 77 a6 c9 9b 6a 00`
- Stop: `42 21` and 33 × `00`.
- Lights, h8 red, g8 green, a1 blue:
  `43 20 21 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 30`
- A report whose byte 2 is `0x21` (all else 0): h8 black queen, g8 black king (`6kq/8/8/8/8/8/8/8`).
- Battery `41 03 0c 01 48`: charging, 72%.

---

## Appendix D: TESTING.md entries, to add as each part is pushed

**(a)**:
```
## The Chessnut Move's spike page (CHESSNUT.md part (a))
- Nothing live yet; the simulated board only. When the board arrives: on the device that will drive
  it (Chrome, or Brave with brave://flags/#brave-web-bluetooth-api enabled), close Chessnut's app,
  open the footer's "board spike", and go through its steps 1–8. Copy the log and give it to any
  session: CHESSNUT.md §7 says what each answer changes.
```

**(c)**:
```
## The board's chip and dialog (CHESSNUT.md part (c))
- Connect from the header's ♞ chip; the battery; the dialog's small board follows the real board
  as you move pieces; Check the pieces. Turn the board off and on: "Reconnecting", then back.
```

**(d)**:
```
## Practice on the Chessnut Move (CHESSNUT.md part (d))
- A practice game from a position, as White and as Black (the board turned to you): your moves by
  hand, the opponent's driven; a move outside the repertoire put back; Take back; the hint's
  lights; Move feedback's colours. Does 0.6 s before a move is read feel right? Does 2 s before a
  wrong position is put back? (Both are in the dialog's settings.) Castle with the king first.
```

**(e)**:
```
## The storm's untimed sessions on the Chessnut Move (CHESSNUT.md part (e))
- A set of 6 with the board: how long each card takes to set up; the verdict's colours; a held
  card taken back by the robot and tried again; Show the move's light; the next card by itself.
  A show and grade: the top move's light. Ten minutes with the screen untouched: still connected?
```

**(f)**:
```
## The timed storm and the review on the Chessnut Move (CHESSNUT.md part (f))
- A timed storm: the clock stands still while the board sets up. The review: the board follows the
  row you stop on.
```

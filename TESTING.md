# Repworks: waiting for the owner's testing session

What has been built but not yet checked live on the owner's devices. Sessions add to it when they
push something only the owner can check, and remove an item once the owner reports it. Each
item names its `PLAN.md` section, which says what to check. Report findings to any session; it
fixes them and updates this file.

## Phase 0

Reported by the owner on 2026-10-06: the spike's desktop run (all steps passed, §4.2), the
Qchess and Lichess imports on the desktop (§4.10), and the study editor on desktop and phone
("the current version is good"; their requests became §5.15).

- §4.2: the spike from the installed app (S2's second half, and `persist()` there).
- §4.5 (a): the owner's Lichess test study run through the round-trip suite (its export in the
  data repo, by `REPWORKS_FIXTURES`), and our output imported back into Lichess and compared.
- §4.10: the Lichess OAuth flow from the installed app on the phone.
- §4.11: Phase 0's acceptance test (desktop and Android phone).

## Phase 1

Reported by the owner on 2026-10-06 (build `95b0b76`): the study cards, making and managing a
study (synced to the phone), the chapter ⚙ on the phone, the transposition badges and the
clickable lines work (§5.11, §5.12, §5.15 in part). Their requests became §5.16; training itself
couldn't be tested then (the day's limit was used up), so the training items below still stand.

- §5.16: the line list on desktop and phone (a chapter opened, a line picked, due or not: its due
  moves graded, its new moves taught, the rest asked with nothing recorded; "Learn" on a
  chapter; "Next line"); the daily limit changed from ⚙ and the same on the other device after a
  sync; the "Nothing to train" screen; "Study" from it and from a line; "1" and the button
  switching a review to show and grade and back; the move's wider hitbox, the badge pills and
  the bold blue lines in the notation.

- §5.1: the index build time on the phone, with the real repertoire.
- §5.5: the queue simulation on the real repertoire, to choose the default daily limit (needs
  the data repo, by `REPWORKS_FIXTURES`).
- §5.7: a real day's training session with the real repertoire (phone, then desktop): moving by
  tap and by drag at the pace, the feedback line, the screen staying on (wake lock), the time a
  session takes; the home screen's counts the same on both devices after a sync. The index
  build time is in the debug panel (§5.1's target: under 300 ms on the phone).
- §5.8: a session's mistakes retried and drilled on the phone; a pin made on the phone appears
  on the desktop after a sync, and comes due 30 minutes after it was made.
- §5.9: show and grade on the phone with the owner's ring: whether its buttons arrive as key
  events or through the Media Session API (and whether the silent loop keeps that routing), with
  the screen on and off; speech on Android.
- §5.10: the Read and Interactive views on the phone and the desktop, from the chapter view and
  the move menu: reading a long line with comments (the text size, ← →), playing a line by tap
  and drag, and the walk following a variation's move.
- §5.11: the transposition badges on the real repertoire (how many moves carry `⇄` or `+k`,
  whether the marks crowd the notation on the phone, the time the chapter view takes to open a
  big chapter); copy continuation pasted where the owner uses it.
- §5.12: clickable lines in the owner's real comments (Qchess's and Chessable's notation): which
  groups become lines and which stay remarks, where each line starts, line jumping with → at a
  line's end; previews on the phone (tap a move, ◀ ▶ Back, tap the board) and during training.
- §5.15: the study cards on the real repertoire (the counts, the side tags); a study made with
  no import, renamed, its chapters renamed, turned, moved and deleted through the ⚙ dialogs, and
  deleted from its card, then synced to the other device; train ↔ study during a real session
  (desktop and phone): "Study" from the training screen opens the line at the board's move, an
  edit there, and "Train" takes the session up again with the edit in it and nothing asked
  twice. Whether the chapter ⚙ by the phone's chapter menu is easy to find.

## Phase 2

- §5.23: the explorer panel with the owner's Lichess login, on desktop and phone: on 1. e4 c5
  2. Nf3 the Lichess tab beside Qchess's Lichess tab with the same filter (moves, shares, counts,
  bars) and the Eval column beside Qchess's; Masters and ChessDB; a row tapped playing its move;
  the ⛁ button turning the panel off and on (and remembered); the settings' filter; the phone's
  layout (the panel after the notation, rows readable and tappable). If the login was made before
  this build, the explorer uses the same token: no new login is needed.
- §5.22: a reload answering from the cache (the panel fills at once on a position seen before).
- §5.24: the Practical column on the desktop beside q_extension's column (same positions, filter
  and token; the values within a point at the same depth, the prepared bars likewise); the
  request counts after ten minutes of use (Explorer settings shows this tab's); on
  the phone, a search's time and the battery over a session; a long-press on a cell leaving a
  move out.

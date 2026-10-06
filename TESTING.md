# Repworks: waiting for the owner's testing session

What has been built but not yet checked live on the owner's devices. Sessions add to it when they
push something only the owner can check, and remove an item once the owner reports it. Each
item names its `PLAN.md` section, which says what to check. Report findings to any session; it
fixes them and updates this file.

## Phase 0

- §4.2: the remote spike's re-run (desktop).
- §4.5 (a): a round trip of the owner's own Lichess test study.
- §4.10: the real Qchess and Lichess imports.
- §4.11: the study editor, its layout and the long-press menu (phone and desktop), and the
  sync against the real GitHub.
- §4.11: Phase 0's acceptance test (desktop and Android phone).

## Phase 1

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

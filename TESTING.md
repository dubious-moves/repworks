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
- §5.15: the study cards, a study made and managed without an import, and train ↔ study during
  a real session (desktop and phone).

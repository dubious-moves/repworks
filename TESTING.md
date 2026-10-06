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

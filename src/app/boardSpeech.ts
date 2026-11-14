// Speech on the Chessnut Move (CHESSNUT.md §4.10, §5.4): with the board's "Say verdicts and the
// opponent's moves" on, a game on the board (practice, a drill, an endgame) says the opponent's
// moves as they come, and the study move when the repertoire check takes one back, so the game can
// be played without looking at the screen. Voice input (src/app/voice.ts) says both already: while
// it is on, nothing is said here. Started once by the composition root.
import { effect } from '@preact/signals';
import { NOTHING_HEARD, spokenFor, type Heard } from '../core/board/speech.ts';
import { say } from '../platform/speech.ts';
import { boardLink } from './boardLink.ts';
import { boardPrefs } from './boardPrefs.ts';
import { practice } from './practice.ts';
import { voice } from './voice.ts';

let started = false;

export function startBoardSpeech(): void {
  if (started) return;
  started = true;
  let heard: Heard = NOTHING_HEARD;
  effect(() => {
    const [words, next] = spokenFor(heard, practice.value);
    heard = next;
    // Only a game on the board: linked, a screen's board mirrored, the setting on, voice input off.
    if (!words.length || !boardPrefs.peek().speak || !boardLink.linked() || !boardLink.mirrored.peek() || voice.peek().on) return;
    say(words.join(' '));
  });
}

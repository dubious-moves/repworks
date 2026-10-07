// Voice input in practice games (PLAN.md §5.63), mistake-lab's voice mode: the heard alternatives
// matched against the legal moves (the first that names one), the move confirmed first when
// "Confirm moves" is on ("Knight f, 3?" then yes or no), else played; the opponent's moves spoken.
// Off at every start, as mistake-lab's is; nothing heard while the app is speaking.
import { effect, signal } from '@preact/signals';
import { heardToValues, matchMove, moveToSpeech } from '../core/games/voice.ts';
import { positionOf } from '../core/storm/walk.ts';
import { speak, stopSpeaking } from '../platform/speech.ts';
import { keepAudioAlive, listen, voiceSupported, type Listening } from '../platform/voice.ts';
import { practice, practiceMove } from './practice.ts';

export interface VoiceState {
  on: boolean;
  /** A move waiting for yes or no. */
  pending?: { san: string; uci: string };
  /** What was last heard or said, for the line under the board. */
  note?: string;
}
export const voice = signal<VoiceState>({ on: false });

const CONFIRM_KEY = 'repworks-voice-confirm';
export const voiceConfirm = signal<boolean>((() => {
  try {
    return localStorage.getItem(CONFIRM_KEY) === '1';
  } catch {
    return false;
  }
})());
export function setVoiceConfirm(on: boolean): void {
  voiceConfirm.value = on;
  try {
    localStorage.setItem(CONFIRM_KEY, on ? '1' : '0');
  } catch {
    // this page only
  }
}

let listening: Listening | undefined;
let stopKeepAlive: (() => void) | undefined;
let speaking = false;
let lastOpponent: string | undefined;
/** The moves already looked at for the opponent's (the index after the last one spoken). */
let seen = 0;

async function say(text: string): Promise<void> {
  speaking = true;
  try {
    await speak(text);
  } finally {
    speaking = false;
  }
}

const set = (patch: Partial<VoiceState>) => (voice.value = { ...voice.value, ...patch });

async function heard(alts: string[]): Promise<void> {
  if (speaking || !voice.peek().on) return;
  const p = practice.peek();
  if (!p || p.phase === 'over') return voiceOff();
  const fen = p.moves.length ? p.moves[p.moves.length - 1]!.fen : p.setup.fen;
  const pos = positionOf(fen);
  if (!pos) return;
  let meaningful = false;
  let result: ReturnType<typeof matchMove> = null;
  for (const alt of alts) {
    const values = heardToValues(alt);
    if (!values.length) continue;
    meaningful = true;
    result = matchMove(values, pos, !!voice.peek().pending);
    if (result) break;
  }
  if (!result) {
    if (meaningful) {
      set({ note: `Heard “${alts[0]}”: no move` });
      await say('No match. Try again.');
    }
    return;
  }
  const pending = voice.peek().pending;
  if (result.type === 'confirm' && pending) {
    const { pending: _p, ...rest } = voice.peek();
    voice.value = rest;
    if (result.value) return play(pending.uci, pending.san);
    set({ note: 'Cancelled' });
    return say('Cancelled');
  }
  if (pending) {
    const { pending: _p, ...rest } = voice.peek();
    voice.value = rest;
  }
  if (result.type === 'ambiguous') {
    set({ note: `Ambiguous: ${result.moves.slice(0, 3).join(', ')}` });
    return say(`Ambiguous. ${result.moves.slice(0, 3).map(moveToSpeech).join(', or ')}.`);
  }
  if (result.type !== 'move') return;
  if (p.phase !== 'user') return;
  if (voiceConfirm.peek()) {
    set({ pending: { san: result.san, uci: result.uci }, note: `${result.san}?` });
    return say(`${moveToSpeech(result.san)}?`);
  }
  return play(result.uci, result.san);
}

function play(uci: string, san: string): void {
  set({ note: san });
  void practiceMove(uci);
}

export function voiceOn(): void {
  if (voice.peek().on) return;
  if (!voiceSupported()) {
    set({ note: 'Speech recognition isn’t available in this browser (Chrome and Edge have it).' });
    return;
  }
  listening = listen(
    (alts) => void heard(alts),
    (error) => set({ note: error === 'not-allowed' || error === 'service-not-allowed' ? 'The microphone is blocked for this site: allow it in the browser’s site settings.' : error === 'network' ? 'Voice needs the network (the browser sends the audio to its service).' : `Voice: ${error}` }),
  );
  if (!listening) return;
  stopKeepAlive = keepAudioAlive();
  const p = practice.peek();
  lastOpponent = p?.moves.filter((m) => !m.isUser).at(-1)?.san;
  seen = p?.moves.length ?? 0;
  voice.value = { on: true, note: 'Listening' };
}

export function voiceOff(): void {
  listening?.stop();
  listening = undefined;
  stopKeepAlive?.();
  stopKeepAlive = undefined;
  stopSpeaking();
  voice.value = { on: false };
}

/** Says the opponent's last move again (mistake-lab's 1 key). */
export function repeatOpponent(): void {
  if (voice.peek().on && lastOpponent) void say(moveToSpeech(lastOpponent));
}

/** Yes or no to a pending move from the keyboard (2 or Enter, 4 or Backspace). */
export function answerPending(yes: boolean): void {
  void heard([yes ? 'yes' : 'no']);
}

let lastDeviation: unknown;
// The opponent's moves spoken while voice is on; voice ends with the game.
effect(() => {
  const p = practice.value;
  if (!voice.peek().on) return;
  if (!p || p.phase === 'over') return voiceOff();
  // A move taken back by the repertoire check (mistake-lab says the study move).
  if (p.deviation && p.deviation !== lastDeviation) void say(`Repertoire deviation. Study move is ${moveToSpeech(p.deviation.repSan)}.`);
  lastDeviation = p.deviation;
  for (; seen < p.moves.length; seen++) {
    const m = p.moves[seen]!;
    if (m.isUser) continue;
    lastOpponent = m.san;
    void say(moveToSpeech(m.san));
  }
});

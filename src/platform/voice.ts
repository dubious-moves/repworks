// Speech recognition for voice input (PLAN.md §5.63), over the Web Speech API as mistake-lab uses
// it: continuous, final results only, five alternatives, English, the chess words boosted where
// the browser takes phrase hints. Chrome sends the audio to Google: it needs the network.
import { BIAS } from '../core/games/voice.ts';

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  length: number;
  [i: number]: SpeechAlternative;
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  phrases?: unknown;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionClass = new () => Recognition;

const recognitionClass = (): RecognitionClass | undefined => {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const voiceSupported = () => !!recognitionClass();

export interface Listening {
  stop(): void;
}

/** Listens until stopped (restarting when the browser ends a session), each final result's alternatives to `heard`. */
export function listen(heard: (alternatives: string[]) => void, failed: (error: string) => void): Listening | undefined {
  const R = recognitionClass();
  if (!R) return undefined;
  const r = new R();
  r.continuous = true;
  r.interimResults = false;
  r.lang = 'en-US';
  r.maxAlternatives = 5;
  const Phrase = (globalThis as unknown as { SpeechRecognitionPhrase?: new (p: string, b: number) => unknown }).SpeechRecognitionPhrase;
  if (Phrase && 'phrases' in r) {
    try {
      r.phrases = BIAS.map(([p, b]) => new Phrase(p, b));
    } catch {
      // no hints, then
    }
  }
  let on = true;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      if (!res.isFinal) continue;
      const alts: string[] = [];
      for (let j = 0; j < res.length; j++) if (res[j]!.transcript.trim()) alts.push(res[j]!.transcript.trim());
      if (alts.length) heard(alts);
    }
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') on = false;
    failed(e.error);
  };
  r.onend = () => {
    if (!on) return;
    try {
      r.start();
    } catch {
      // started already
    }
  };
  try {
    r.start();
  } catch (e) {
    failed(e instanceof Error ? e.message : String(e));
    return undefined;
  }
  return {
    stop() {
      on = false;
      try {
        r.stop();
      } catch {
        // stopped already
      }
    },
  };
}

/**
 * mistake-lab's Bluetooth keep-alive: a silent tone (gain 0.0001) while voice is on, so a
 * Bluetooth headset doesn't sleep between the moves spoken. Returns its stop.
 */
export function keepAudioAlive(): () => void {
  const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => undefined;
  try {
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    return () => {
      try {
        osc.stop();
        void ctx.close();
      } catch {
        // closed already
      }
    };
  } catch {
    return () => undefined;
  }
}

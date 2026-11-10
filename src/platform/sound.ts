// Sounds and a buzz (PLAN.md §5.159): made with Web Audio, no files and no licences. A move is a
// short knock, a capture a lower and longer one; a right answer (the best move found) two rising
// notes; a wrong one a low buzz, with a short vibration where the device has one.
export type Sound = 'move' | 'capture' | 'right' | 'wrong';

let ctx: AudioContext | undefined;
function audio(): AudioContext | undefined {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return undefined;
  }
}

/** One note: a frequency gliding to `to`, `ms` long, its volume falling away. */
function note(a: AudioContext, at: number, o: { freq: number; to?: number; ms: number; gain: number; type: OscillatorType }): void {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + o.ms / 1000);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(o.gain, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + o.ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + o.ms / 1000 + 0.02);
}

export function playSound(s: Sound): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (s) {
    case 'move':
      note(a, t, { freq: 520, to: 260, ms: 60, gain: 0.25, type: 'triangle' });
      break;
    case 'capture':
      note(a, t, { freq: 300, to: 110, ms: 120, gain: 0.35, type: 'triangle' });
      note(a, t + 0.03, { freq: 180, to: 90, ms: 90, gain: 0.2, type: 'sine' });
      break;
    case 'right':
      note(a, t, { freq: 660, ms: 120, gain: 0.18, type: 'sine' });
      note(a, t + 0.11, { freq: 990, ms: 220, gain: 0.18, type: 'sine' });
      break;
    case 'wrong':
      note(a, t, { freq: 150, to: 120, ms: 220, gain: 0.16, type: 'square' });
      break;
  }
}

/** A short vibration, where the device has one (Android's browsers; not iOS). */
export function buzz(ms = 120): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // no vibration here
  }
}

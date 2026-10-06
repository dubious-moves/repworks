// The media keys of a Bluetooth ring (PLAN.md §5.9). A web page receives them only through the
// Media Session API, which Chrome on Android routes to the page that is playing media. So the
// page plays a silent loop while the mode runs and registers the handlers; a ring that sends
// ordinary key events is caught by the screen's own key listener instead. Which of the two the
// owner's ring reaches is a live question (TESTING.md).
export interface MediaKeys {
  stop(): void;
}

/**
 * A second of silence as a WAV blob: 8 kHz, mono, 8-bit. A zero-length clip on loop spins the
 * browser's media thread (it crashed the e2e runs), so the clip has real samples.
 */
function silence(): string {
  const rate = 8000;
  const samples = rate;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // the format chunk's length
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // bytes a second
  view.setUint16(32, 1, true); // bytes a frame
  view.setUint16(34, 8, true); // bits a sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  // 8-bit PCM is unsigned: 128 is silence.
  bytes.fill(128, 44);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/** Starts the silent loop and routes the ring's buttons to `onNext` and `onPrevious`. */
export function holdMediaKeys(handlers: { onNext(): void; onPrevious(): void }): MediaKeys {
  let audio: HTMLAudioElement | undefined;
  let url: string | undefined;
  try {
    url = silence();
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.01;
    void audio.play().catch(() => undefined);
  } catch {
    audio = undefined;
  }
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  try {
    session?.setActionHandler('nexttrack', () => handlers.onNext());
    session?.setActionHandler('previoustrack', () => handlers.onPrevious());
    // Pause and play would stop the loop, which would end the routing.
    session?.setActionHandler('pause', () => undefined);
    session?.setActionHandler('play', () => undefined);
    if (session) session.playbackState = 'playing';
  } catch {
    // An older browser: the key events are the only way in.
  }
  return {
    stop() {
      try {
        session?.setActionHandler('nexttrack', null);
        session?.setActionHandler('previoustrack', null);
        session?.setActionHandler('pause', null);
        session?.setActionHandler('play', null);
        if (session) session.playbackState = 'none';
      } catch {
        // Already gone.
      }
      audio?.pause();
      audio = undefined;
      if (url) URL.revokeObjectURL(url);
      url = undefined;
    },
  };
}

// Speech (PLAN.md §5.9): the move spoken through the Web Speech API, optional and off by
// default. Nothing here throws: a browser without it (or with no voice) simply says nothing.
export function canSpeak(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Says the text, cutting off whatever was being said. */
export function say(text: string): void {
  if (!canSpeak()) return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    speechSynthesis.speak(utterance);
  } catch {
    // A browser that refuses to speak is no reason to stop a session.
  }
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  try {
    speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}

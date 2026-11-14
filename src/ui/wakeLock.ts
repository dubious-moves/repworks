// The screen kept awake (the Screen Wake Lock) while a session runs, or while the Chessnut Move
// mirrors a board (CHESSNUT.md §4.9): a phone that sleeps freezes the page and drops the board's link.
import { useEffect } from 'preact/hooks';

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let stopped = false;
    const take = () => {
      if (document.visibilityState !== 'visible' || lock) return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (stopped) return void l.release();
          lock = l;
          l.addEventListener('release', () => (lock = undefined));
        },
        () => undefined,
      );
    };
    take();
    // The browser releases the lock when the page is hidden; it is taken again on return.
    document.addEventListener('visibilitychange', take);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [active]);
}

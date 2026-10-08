// The app's mode (src/core/app/fsm.ts), kept in step with the address bar's hash. Opening
// something adds a history entry, so the browser's back button works; the move shown only
// replaces the address, so stepping through a line doesn't fill the history.
// Each entry is stamped with its place among this tab's entries of the app and a key of its own,
// and the tab keeps the page each place shows (`pageOf`). The app's ← goes back past the entries
// of the page shown to the page it was opened from (the owner's request, 2026-10-08), and a screen
// with something under way (a storm, a practice game, the game cards) keeps it for the entry it
// was started on, so coming back by ← finds it as it was.
import { signal } from '@preact/signals';
import { modeHash, pageOf, parseHash, transition, type Mode, type ModeEvent } from '../core/app/fsm.ts';

interface Stamp {
  /** The entry's place: how many of the app's entries lie behind it in this tab. */
  rw: number;
  key: string;
}
const stampOf = (state: unknown): Stamp | undefined => {
  const s = state as Partial<Stamp> | null;
  return s && typeof s.rw === 'number' && s.rw >= 0 && typeof s.key === 'string' ? { rw: s.rw, key: s.key } : undefined;
};
let made = 0;
const newKey = () => `${Date.now().toString(36)}.${(made++).toString(36)}`;

/** The page shown at each place, kept per tab across reloads. */
const TRAIL_KEY = 'repworks.trail';
function readTrail(): string[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? '[]');
    return Array.isArray(v) ? v.map((p) => (typeof p === 'string' ? p : '')) : [];
  } catch {
    return [];
  }
}
const trail = readTrail();
/** The page at `rw` is `m`'s; a new entry ends the trail there (the entries ahead are gone). */
function mark(rw: number, m: Mode, fresh: boolean): void {
  trail[rw] = pageOf(m);
  if (fresh) trail.length = rw + 1;
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail));
  } catch {
    // Kept for this page only.
  }
}

export const mode = signal<Mode>(parseHash(location.hash));

/** The entry shown: kept across a reload, as the browser keeps an entry's state. */
const kept = stampOf(history.state);
let here: Stamp = kept ?? { rw: 0, key: newKey() };
history.replaceState(here, '', location.href);
mark(here.rw, mode.peek(), !kept);

/** The history entry shown, for a screen that keeps its work for it. */
export const entryKey = (): string => here.key;

addEventListener('hashchange', () => {
  // Back or forward to an entry of the app's: its stamp. A new one (a link followed, an address
  // typed): the next place.
  const stamp = stampOf(history.state);
  here = stamp ?? { rw: here.rw + 1, key: newKey() };
  if (!stamp) history.replaceState(here, '', location.href);
  const next = parseHash(location.hash);
  mark(here.rw, next, !stamp);
  mode.value = next;
});

export function dispatch(event: ModeEvent): void {
  // Read without subscribing: an effect that dispatches must not re-run on the mode it sets.
  const current = mode.peek();
  const next = transition(current, event);
  if (next === current) return;
  const hash = modeHash(next);
  if (event.type === 'at' || event.type === 'missing') {
    history.replaceState(here, '', location.pathname + location.search + hash);
    mark(here.rw, next, false);
  } else if (location.hash !== hash) {
    here = { rw: here.rw + 1, key: newKey() };
    history.pushState(here, '', location.pathname + location.search + hash);
    mark(here.rw, next, true);
  }
  mode.value = next;
}

export const open = (to: Mode) => dispatch({ type: 'open', mode: to });

/**
 * The app's ←: back to the page this one was opened from, past this page's own entries (a study's
 * other chapters, the lines trained), as the browser's back goes; up to `parent` when the page was
 * opened from outside the app (a link, a bookmark) and there is none.
 */
export function goBack(parent: Mode): void {
  const page = trail[here.rw] ?? pageOf(mode.peek());
  let n = 1;
  while (n <= here.rw && trail[here.rw - n] === page) n++;
  if (n <= here.rw) history.go(-n);
  else open(parent);
}

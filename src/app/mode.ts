// The app's mode (src/core/app/fsm.ts), kept in step with the address bar's hash. Opening
// something adds a history entry, so the browser's back button works; the move shown only
// replaces the address, so stepping through a line doesn't fill the history.
import { signal } from '@preact/signals';
import { modeHash, parseHash, transition, type Mode, type ModeEvent } from '../core/app/fsm.ts';

export const mode = signal<Mode>(parseHash(location.hash));

addEventListener('hashchange', () => (mode.value = parseHash(location.hash)));

export function dispatch(event: ModeEvent): void {
  // Read without subscribing: an effect that dispatches must not re-run on the mode it sets.
  const current = mode.peek();
  const next = transition(current, event);
  if (next === current) return;
  const hash = modeHash(next);
  if (event.type === 'at' || event.type === 'missing') history.replaceState(null, '', location.pathname + location.search + hash);
  else if (location.hash !== hash) location.hash = hash;
  mode.value = next;
}

export const open = (to: Mode) => dispatch({ type: 'open', mode: to });

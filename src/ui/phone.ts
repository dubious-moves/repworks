// A phone's width (app.css's 599 px), where the training screens put the button that goes on right
// under the board: the panel's buttons are below the fold there (the owner's request, 2026-10-27).
import { signal } from '@preact/signals';

const phoneQuery = typeof matchMedia === 'function' ? matchMedia('(max-width: 599px)') : undefined;
export const phone = signal(phoneQuery?.matches ?? false);
phoneQuery?.addEventListener('change', (e) => (phone.value = e.matches));

// The app's ← (the owner's request, 2026-10-08): back to the page this one was opened from, past
// its own entries (app/mode.ts `goBack`); up to `parent` when it was opened from outside the app.
import type { Mode } from '../core/app/fsm.ts';
import { modeHash } from '../core/app/fsm.ts';
import { goBack } from '../app/mode.ts';

export function Back(props: { parent: Mode; title?: string; label?: string; onBack?: () => void }) {
  return (
    <a
      href={modeHash(props.parent)}
      class="back"
      aria-label={props.label ?? 'Back'}
      title={props.title ?? 'Back to where you came from'}
      onClick={(e) => {
        e.preventDefault();
        if (props.onBack) props.onBack();
        else goBack(props.parent);
      }}
    >
      ←
    </a>
  );
}

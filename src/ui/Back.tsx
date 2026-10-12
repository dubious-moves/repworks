// The app's ← (the owner's request, 2026-10-08): back to the page this one was opened from, past
// its own entries (app/mode.ts `goBack`); up to `parent` when it was opened from outside the app.
// Next to it on a wide screen, Home (§5.97); on a narrow one Home is in the top bar (App.tsx).
import type { ComponentChildren } from 'preact';
import type { Mode } from '../core/app/fsm.ts';
import { modeHash } from '../core/app/fsm.ts';
import { goBack, open } from '../app/mode.ts';

export function Back(props: { parent: Mode; title?: string; label?: string; onBack?: () => void }) {
  return (
    <>
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
      <HomeLink class="head-home" />
    </>
  );
}

/** To the start page, from any page (§5.97). */
export function HomeLink(props: { class: string }) {
  return (
    <a
      href={modeHash({ name: 'list' })}
      class={`home-link ${props.class}`}
      aria-label="Home"
      title="Home: the studies and the training card"
      onClick={(e) => {
        e.preventDefault();
        open({ name: 'list' });
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
  );
}

/** A page that can't be shown (its line, study or checklist gone): why, under ← and Home. */
export function Stuck(props: { parent: Mode; children: ComponentChildren }) {
  return (
    <div class="stuck">
      <div class="chapter-head">
        <Back parent={props.parent} />
      </div>
      <p class="warn">{props.children}</p>
    </div>
  );
}

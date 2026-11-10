// "?" lists the screen's keys (PLAN.md §5.158): a dialog with the keys each screen's own handler
// takes, written here from those handlers (Train.tsx, Storm.tsx, Games.tsx, ChapterView.tsx,
// Read.tsx, Ideas.tsx, Endgames.tsx, Practice.tsx). While it is open no key reaches the screen;
// Escape or ? closes it.
import { useEffect, useRef, useState } from 'preact/hooks';
import { mode } from '../app/mode.ts';
import type { Mode } from '../core/app/fsm.ts';

type Section = { title: string; keys: readonly (readonly [string, string])[] };

const LINE_ON_BOARD: Section = {
  title: 'A line from a comment, on the board',
  keys: [
    ['← →', 'Step it'],
    ['Escape', 'Put it away'],
  ],
};

const TRAINING: readonly Section[] = [
  {
    title: 'Training',
    keys: [
      ['Space', 'Hint'],
      ['Backspace', 'A misclick: take the wrong move back, not counted'],
      ['1', 'Switch to show and grade'],
      ['Escape', 'Stop the session'],
    ],
  },
  {
    title: 'Show and grade',
    keys: [
      ['2', 'Right: the next move (a headset’s next)'],
      ['4', 'Wrong (a headset’s previous)'],
      ['1', 'Repeat'],
      ['Space', 'The alternatives saved here'],
    ],
  },
  LINE_ON_BOARD,
];

const STUDY: readonly Section[] = [
  {
    title: 'The moves',
    keys: [
      ['← →', 'Back and on (→ at a branch opens its moves)'],
      ['↑ ↓', 'Between variations; at a branch, choose; ↓ enters a comment’s line'],
      ['Enter / Escape', 'At a branch: go on / close'],
      ['Home End', 'The start, the end'],
      ['w', 'The threat, on and off'],
      ['Ctrl+Z, Ctrl+Y', 'Undo, redo an edit'],
    ],
  },
  LINE_ON_BOARD,
];

/** The keys of the screen `m` shows; none for a screen with no keys of its own. */
export function keysOf(m: Mode): readonly Section[] {
  switch (m.name) {
    case 'train':
    case 'learn':
    case 'show':
    case 'difficult':
    case 'play':
    case 'practice':
      return TRAINING;
    case 'chapter':
      return STUDY;
    case 'analysis':
      return [{ ...STUDY[0]!, keys: [...STUDY[0]!.keys, ['f', 'Flip the board']] }, LINE_ON_BOARD];
    case 'read':
      return [
        {
          title: 'Read',
          keys: [
            ['← →', 'Back and on'],
            ['↓', 'Into the first line of the move’s comments'],
            ['Home End', 'The start, the end'],
            ['Escape', 'Leave a line'],
          ],
        },
      ];
    case 'storm':
      return [
        {
          title: 'A position',
          keys: [
            ['Space / Enter', 'Next position'],
            ['t', 'Try again'],
            ['s', 'Show the move'],
            ['r', 'Show the refutation'],
            ['l', 'Show the line'],
            ['c', 'Continue against Maia’s reply'],
            ['p', 'Pause before the next'],
            ['a', 'Analyse'],
            ['Escape', 'End the storm'],
          ],
        },
        {
          title: 'Show and grade',
          keys: [
            ['Space / Enter', 'Show the moves'],
            ['2', 'Mine was good (a headset’s next)'],
            ['4', 'Mine wasn’t (a headset’s previous)'],
          ],
        },
        {
          title: 'The review',
          keys: [
            ['↑ ↓ (or j k)', 'The positions'],
            ['b', 'Show the board'],
            ['t', 'Try again'],
            ['a', 'Analyse'],
          ],
        },
      ];
    case 'gamesReview':
      return [
        {
          title: 'Game cards',
          keys: [
            ['h', 'Hint'],
            ['t', 'Try again'],
            ['n', 'Next card'],
            ['← →', 'Step the engine’s line'],
          ],
        },
        LINE_ON_BOARD,
      ];
    case 'games':
      return m.id
        ? [
            {
              title: 'A game',
              keys: [
                ['← →', 'Back and on'],
                ['Home End', 'The start, the end'],
              ],
            },
          ]
        : [];
    case 'ideas':
      return [
        {
          title: 'Idea cards',
          keys: [
            ['Space / Enter', 'Show, Ask me, or Next'],
            ['1 2 3 4', 'A grade'],
          ],
        },
      ];
    case 'endgames':
      return m.id
        ? [
            {
              title: 'An endgame',
              keys: [
                ['h', 'Hint'],
                ['Backspace', 'Take back'],
              ],
            },
          ]
        : [];
    case 'history':
      return [
        {
          title: 'The review',
          keys: [
            ['← →', 'Back and on'],
            ['Home End', 'The start, the end'],
          ],
        },
      ];
    case 'playOn':
    case 'checklist':
      return [
        {
          title: 'Practice',
          keys: [
            ['h', 'Hint'],
            ['Space', 'Voice on and off'],
            ['1', 'Voice: say the opponent’s move again'],
            ['2 / Enter, 4 / Backspace', 'Voice: yes, no'],
          ],
        },
        {
          title: 'The review',
          keys: [
            ['← →', 'Back and on'],
            ['Home End', 'The start, the end'],
          ],
        },
      ];
    default:
      return [];
  }
}

const ALWAYS: Section = { title: 'Everywhere', keys: [['?', 'This list']] };

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

/** The dialog, opened by ? outside a text field when no other dialog is open. */
export function KeysHelp() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const isOpen = useRef(open);
  isOpen.current = open;
  useEffect(() => {
    // Caught first, so that while the list is open no key reaches the screen's own handlers.
    const onKey = (e: KeyboardEvent) => {
      if (isOpen.current) {
        if (e.key === 'Escape' || e.key === '?') {
          e.preventDefault();
          setOpen(false);
        }
        if (e.key !== 'Tab') e.stopPropagation();
        return;
      }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  const sections = open ? [...keysOf(mode.value), ALWAYS] : [];
  return (
    <dialog ref={ref} class="keys-help" aria-labelledby="keys-help-title" data-testid="keys-help" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)}>
      <h2 id="keys-help-title">Keys</h2>
      {sections.length === 1 && <p class="muted">This screen has no keys of its own.</p>}
      {sections.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          <dl>
            {s.keys.map(([k, what]) => (
              <div key={k + what}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div class="actions">
        <button type="button" class="primary" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </dialog>
  );
}

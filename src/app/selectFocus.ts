// A <select> that a pointer (or Enter in its list) has just set lets go of the keyboard, so the
// arrow keys go on to the page, to move and branch navigation in a study, and no longer step the
// select's value. Stepping a closed select with the keys themselves keeps the focus: that is how
// it is used from the keyboard.

/** Keys that change a closed select's value in place; the focus stays while they do. */
const STEPPING = /^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down)|.)$/u;

let stepped = false;

export function installSelectFocusRelease(doc: Document = document): void {
  doc.addEventListener(
    'keydown',
    (e) => {
      stepped = !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ' && STEPPING.test(e.key);
    },
    true,
  );
  doc.addEventListener('keyup', () => (stepped = false), true);
  doc.addEventListener('pointerdown', () => (stepped = false), true);
  doc.addEventListener('change', (e) => {
    const t = e.target;
    if (!stepped && t instanceof HTMLSelectElement) t.blur();
  });
}

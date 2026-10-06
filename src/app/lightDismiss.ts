// A click on the backdrop of a modal dialog closes it, as Escape does (the owner's third notes):
// the dialog gets a `cancel` event, which each dialog already answers. A press that starts inside
// the dialog (a text selection dragged out of it) doesn't count, nor does one in its padding.
let pressedOutside = false;

function outside(d: HTMLDialogElement, e: MouseEvent): boolean {
  const r = d.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

function backdropOf(e: MouseEvent): HTMLDialogElement | undefined {
  const d = e.target;
  return d instanceof HTMLDialogElement && d.open && d.matches(':modal') && outside(d, e) ? d : undefined;
}

export function closeDialogsOnBackdrop(root: Document = document): void {
  root.addEventListener('pointerdown', (e) => (pressedOutside = backdropOf(e) !== undefined), true);
  root.addEventListener('click', (e) => {
    const d = backdropOf(e);
    if (!d || !pressedOutside) return;
    pressedOutside = false;
    // As Escape: the dialog's own handler decides (one downloading stays open).
    const cancel = new Event('cancel', { cancelable: true });
    if (d.dispatchEvent(cancel)) d.close();
  });
}

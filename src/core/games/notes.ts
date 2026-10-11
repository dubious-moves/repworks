// A game card's note (PLAN.md §5.91): a PGN comment on the card's position, kept as `note` events
// on the card (`m|<pid>`), the latest one the note and '' none. One text, as a study's comment is
// written (D3): the words, with `(12. Bxf7+ Kxf7)` groups for its lines, then its circles and
// arrows as `[%csl …][%cal …]`. Any game card takes one: a game's mistake or tactic, a practice or
// storm mistake, a sequence.
import { parseComment, sameShape, sanitizeComment, shapesCommand } from '../pgn/comment.ts';
import type { Shape } from '../study/model.ts';
import type { DeviceEvent } from '../progress/replay.ts';

export interface CardNote {
  /** The words, with their lines; the shape commands taken out. */
  text: string;
  shapes: Shape[];
}

/** The card's note from its events (in order, as the replay keeps them), or undefined when it has none. */
export function noteOf(events: readonly DeviceEvent[]): CardNote | undefined {
  let raw = '';
  for (const e of events) if (e.event?.k === 'note') raw = e.event.text;
  if (!raw) return undefined;
  const { text, shapes } = parseComment(raw);
  return text || shapes.length ? { text, shapes } : undefined;
}

/** The comment a note is stored as: the words tidied as Lichess tidies a comment, then the shapes. '' for an empty note. */
export function noteComment(text: string, shapes: readonly Shape[]): string {
  // Shape commands typed in the words are read as shapes too, so they aren't written twice.
  const typed = parseComment(text);
  const words = sanitizeComment(typed.text).text;
  const all = [...shapes];
  for (const s of typed.shapes) if (!all.some((t) => sameShape(s, t))) all.push(s);
  const command = shapesCommand(all);
  return [words, command].filter(Boolean).join(' ');
}

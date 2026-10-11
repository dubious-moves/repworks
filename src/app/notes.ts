// Game cards' notes (PLAN.md §5.91): read from the card's `note` events, written as a new one.
import { recordEvent } from './state.ts';
import { trainData } from './train.ts';
import { noteComment, noteOf, type CardNote } from '../core/games/notes.ts';
import type { Shape } from '../core/study/model.ts';

/** The card's note, or undefined when it has none (read in a render, it follows the card's events). */
export function cardNote(card: string): CardNote | undefined {
  const data = trainData.value;
  return data ? noteOf(data.eventsOf(card)) : undefined;
}

/** Writes the card's note ('' and no shapes removes it); nothing when it is unchanged. */
export async function saveNote(card: string, text: string, shapes: readonly Shape[]): Promise<void> {
  const before = cardNote(card);
  const comment = noteComment(text, shapes);
  if (comment === (before ? noteComment(before.text, before.shapes) : '')) return;
  await recordEvent({ t: new Date().toISOString(), k: 'note', card, text: comment });
}

// Opening names (PLAN.md §5.181): Lichess's list, bundled as a chunk of its own and read when a
// page first asks for a name (the analysis board, a game, the search page), then kept. The chunk
// is part of the app's shell, so it is there offline.
import { signal } from '@preact/signals';
import { parseOpenings, type OpeningBook } from '../core/openings/names.ts';

/** The book; undefined until read. */
export const openingBook = signal<OpeningBook | undefined>(undefined);

let loading: Promise<void> | undefined;

/** Reads the list once; a page that shows names calls it when it opens. */
export function loadOpenings(): void {
  loading ??= import('../../vendor/openings/openings.tsv?raw')
    .then((file) => {
      openingBook.value = parseOpenings(file.default);
    })
    .catch(() => {
      // Offline before the shell was cached, or a new version's chunk gone: asked again next time.
      loading = undefined;
    });
}

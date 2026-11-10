// The home's Today card (PLAN.md §5.158): what is due everywhere, one row a kind of work, in the
// order "Next" takes them: the repertoire's moves, the idea cards, the game cards, the endgames,
// the checklist's next line, the storm's positions ready. A kind with nothing to do is left out;
// one whose count isn't known yet (its store still being read) too.

export type TodayKind = 'repertoire' | 'ideas' | 'games' | 'endgames' | 'checklist' | 'storm';

export interface TodayInput {
  repertoire?: { due: number; fresh: number };
  ideas?: { due: number; fresh: number };
  games?: { due: number; fresh: number };
  /** The endgames due, and the hash of the first of them. */
  endgames?: { due: number; first?: string };
  /** The checklist's next line: its name, and the hash of its drill at the first level not won. */
  checklist?: { name: string; href: string };
  storm?: { ready: number };
}

export interface TodayRow {
  kind: TodayKind;
  label: string;
  /** "23 due · 18 new", "2 due", "40 ready", or the checklist line's name. */
  detail: string;
  /** Where the row's link goes. */
  href: string;
  /** Where Next goes from this row: the first item itself where there is one, else `href`. */
  next: string;
}

const dueNew = (c: { due: number; fresh: number }) => (c.fresh ? `${c.due} due · ${c.fresh} new` : `${c.due} due`);

/** The rows with something to do, in Next's order. */
export function todayRows(i: TodayInput): TodayRow[] {
  const rows: TodayRow[] = [];
  const counted = (kind: TodayKind, label: string, c: { due: number; fresh: number } | undefined, href: string) => {
    if (c && c.due + c.fresh > 0) rows.push({ kind, label, detail: dueNew(c), href, next: href });
  };
  counted('repertoire', 'Repertoire', i.repertoire, '#/train');
  counted('ideas', 'Ideas', i.ideas, '#/ideas');
  counted('games', 'Game cards', i.games, '#/games/review');
  if (i.endgames && i.endgames.due > 0) rows.push({ kind: 'endgames', label: 'Endgames', detail: `${i.endgames.due} due`, href: '#/endgames', next: i.endgames.first ?? '#/endgames' });
  if (i.checklist) rows.push({ kind: 'checklist', label: 'Checklist', detail: i.checklist.name, href: '#/checklist', next: i.checklist.href });
  if (i.storm && i.storm.ready > 0) rows.push({ kind: 'storm', label: 'Storm', detail: `${i.storm.ready} ready`, href: '#/storm', next: '#/storm' });
  return rows;
}

/**
 * The checklist's next line: in the checklists' order (the most recently drilled first), the first
 * line still in its study with a level not yet won, at that level. Levels open in order, so the
 * first not won is the one to play.
 */
export function nextChecklistLine<L extends { gone: boolean }, P extends string>(
  views: readonly { lines: readonly L[] }[],
  doneOf: (view: number, line: L) => ReadonlySet<P>,
  order: readonly P[],
): { view: number; line: L; preset: P } | undefined {
  for (let v = 0; v < views.length; v++)
    for (const line of views[v]!.lines) {
      if (line.gone) continue;
      const done = doneOf(v, line);
      const preset = order.find((p) => !done.has(p));
      if (preset) return { view: v, line, preset };
    }
  return undefined;
}

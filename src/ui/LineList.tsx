// The training screen's line list (PLAN.md §5.16), after Qchess's Move Trainer sidebar (read
// live, 2026-10-06): each chapter with "Learn k/n" while it has new lines, opening to its lines,
// "Line n" with a state dot and "Due now" / "Due in 3 days"; a line clicked is trained at once,
// due or not. Here each line also shows its own moves, from where it leaves the line before it.
import { decidingNow } from '../app/time.ts';
import { signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import type { Position } from 'chessops/chess';
import { open } from '../app/mode.ts';
import { dayOf, type TrainData } from '../app/train.ts';
import { chapterRows, type ChapterRows, type LineRow } from '../core/train/browse.ts';
import { header } from '../core/study/model.ts';
import { startPosition } from '../core/study/tree.ts';

/** Chapters opened in the list, by `sid/cid`; kept while the app runs, as Qchess keeps them. */
const expanded = signal<ReadonlySet<string>>(new Set());
const toggle = (key: string) => {
  const next = new Set(expanded.peek());
  if (!next.delete(key)) next.add(key);
  expanded.value = next;
};

const DAY_MS = 86_400_000;

/** "Due now", "Due in 3 days", "New: 4 moves", as Qchess labels its lines. */
function label(row: LineRow, today: { start: number; end: number }): { text: string; tone: string } {
  if (row.state === 'new') return { text: `New · ${row.fresh}`, tone: 'new' };
  if (row.due > 0) return { text: 'Due now', tone: 'due' };
  if (row.next === undefined) return { text: '', tone: 'learned' };
  if (row.next < today.end) return { text: `Due ${new Date(row.next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, tone: row.state };
  const days = Math.max(1, Math.round((new Date(row.next).setHours(0, 0, 0, 0) - today.start) / DAY_MS));
  return { text: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, tone: row.state };
}

/** The line's moves from `from`, numbered from the chapter's start: `6... Qxc5 7. Nf3`. */
export function movesFrom(start: Position | undefined, path: readonly string[], from: number): string {
  const first = start?.fullmoves ?? 1;
  const blackFirst = start?.turn === 'black';
  const out: string[] = [];
  for (let i = from; i < path.length; i++) {
    const ply = i + (blackFirst ? 1 : 0);
    const number = first + Math.floor(ply / 2);
    if (ply % 2 === 0) out.push(`${number}. ${path[i]}`);
    else out.push(i === from ? `${number}... ${path[i]}` : path[i]!);
  }
  return out.join(' ');
}

export function LineList(props: {
  data: TrainData;
  /** One study, or the whole repertoire. */
  scope?: string;
  /** The line on the board, highlighted, its chapter opened. */
  active?: { sid: string; cid: string; path: readonly string[] };
}) {
  const { data, scope, active } = props;
  const day = dayOf(decidingNow());
  const groups = useMemo(() => chapterRows(data.index, data.states, data.settings, day, scope), [data, scope, day.start]);
  const activeKey = active && `${active.sid}/${active.cid}`;
  useEffect(() => {
    if (activeKey && !expanded.peek().has(activeKey)) toggle(activeKey);
  }, [activeKey]);
  const open_ = expanded.value;
  if (groups.length === 0) return <p class="muted line-list-empty">No repertoire lines here yet.</p>;
  let study: string | undefined;
  return (
    <div class="line-list" role="list" aria-label="Lines">
      {groups.map((g) => {
        const heading = scope === undefined && g.sid !== study ? (study = g.sid) : undefined;
        return (
          <div key={`${g.sid}/${g.cid}`} role="listitem">
            {heading && <div class="line-list-study">{data.studyNames.get(heading) ?? heading}</div>}
            <ChapterBlock group={g} data={data} open={open_.has(`${g.sid}/${g.cid}`)} active={active} day={day} />
          </div>
        );
      })}
    </div>
  );
}

function ChapterBlock(props: { group: ChapterRows; data: TrainData; open: boolean; active: { sid: string; cid: string; path: readonly string[] } | undefined; day: { start: number; end: number } }) {
  const { group: g, data, open: isOpen, active, day } = props;
  const key = `${g.sid}/${g.cid}`;
  const chapter = data.chapters.get(key);
  const name = chapter ? (header(chapter, 'ChapterName') ?? g.cid) : g.cid;
  const start = useMemo(() => (chapter ? startPosition(chapter) : undefined), [chapter]);
  const total = g.lines.length;
  const here = active && active.sid === g.sid && active.cid === g.cid;
  return (
    <>
      <div class={`line-list-chapter${isOpen ? ' open' : ''}${here ? ' active' : ''}`}>
        <button type="button" class="line-list-toggle" aria-expanded={isOpen} onClick={() => toggle(key)}>
          <span class="caret" aria-hidden="true">
            ▶
          </span>
          <span class="line-list-name">{name}</span>
        </button>
        {g.dueLines > 0 && (
          <span class="line-list-due" title={`${g.dueLines} line${g.dueLines === 1 ? '' : 's'} due`}>
            {g.dueLines} due
          </span>
        )}
        {g.learned < total ? (
          <button type="button" class="line-list-learn" title="Learn this chapter's new lines" onClick={() => open({ name: 'learn', sid: g.sid, cid: g.cid })}>
            Learn {g.learned}/{total}
          </button>
        ) : (
          <span class="line-list-count">
            {g.learned}/{total}
          </span>
        )}
      </div>
      {isOpen && (
        <div class="line-list-lines">
          {g.lines.map((row) => {
            const l = label(row, day);
            const current = here && row.line.path.length === active!.path.length && row.line.path.every((m, i) => m === active!.path[i]);
            return (
              <button
                type="button"
                key={row.number}
                class={`line-list-line${current ? ' current' : ''}`}
                aria-current={current ? 'true' : undefined}
                title={movesFrom(start, row.line.path, 0)}
                onClick={() => open({ name: 'train', sid: row.line.sid, cid: row.line.cid, at: [...row.line.path] })}
              >
                <span class={`dot dot-${row.due > 0 ? 'due' : row.state}`} aria-hidden="true" />
                <span class="line-list-number">Line {row.number}</span>
                <span class="line-list-moves">{movesFrom(start, row.line.path, Math.min(row.fork, row.line.path.length - 1))}</span>
                {l.text && <span class={`line-list-label tone-${l.tone}`}>{l.text}</span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The next line after `path` in the list's order (its chapter's, then the next chapter's). */
export function nextLine(data: TrainData, scope: string | undefined, at: { sid: string; cid: string; path: readonly string[] }): LineRow | undefined {
  const rows = chapterRows(data.index, data.states, data.settings, dayOf(decidingNow()), scope).flatMap((g) => g.lines);
  const i = rows.findIndex((r) => r.line.sid === at.sid && r.line.cid === at.cid && r.line.path.length === at.path.length && r.line.path.every((m, j) => m === at.path[j]));
  return i >= 0 ? rows[i + 1] : undefined;
}

/** The first line of the list with new moves: "Learn the next line". */
export function firstNewLine(data: TrainData, scope: string | undefined): LineRow | undefined {
  for (const g of chapterRows(data.index, data.states, data.settings, dayOf(decidingNow()), scope)) for (const r of g.lines) if (r.state === 'new') return r;
  return undefined;
}

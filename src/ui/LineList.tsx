// The training screen's line list (PLAN.md §5.16), after Qchess's Move Trainer sidebar (read
// live, 2026-10-06): each chapter with "Learn k/n" while it has new lines, opening to its lines,
// "Line n" with a state dot and "Due now" / "Due in 3 days"; a line clicked is trained at once,
// due or not. Here each line also shows its own moves, from where it leaves the line before it.
// Each line's menu (⋯, or a right-click) pauses it or marks it must-learn (§5.70); a paused line
// shows ⏸ for its dot, and the chapter's menu pauses or unpauses all its lines. A line's menu also
// adds it to its study's variation checklist, or takes it off (§5.142).
import { decidingNow } from '../app/time.ts';
import { signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import type { Position } from 'chessops/chess';
import { chapterLine, isPicked, pickLine } from '../app/checklist.ts';
import { open } from '../app/mode.ts';
import { setMark, setMarks } from '../app/lineMarks.ts';
import { addNext, growError, growing, openPriority } from '../app/priority.ts';
import { dayOf, type TrainData } from '../app/train.ts';
import { chapterRows, type ChapterRows, type LineRow } from '../core/train/browse.ts';
import { header } from '../core/study/model.ts';
import { startPosition } from '../core/study/tree.ts';
import type { LineMark } from '../core/progress/events.ts';
import type { Line } from '../core/repertoire/index.ts';
import type { Chapter } from '../core/study/model.ts';

/** Chapters opened in the list, by `sid/cid`; kept while the app runs, as Qchess keeps them. */
const expanded = signal<ReadonlySet<string>>(new Set());
const toggle = (key: string) => {
  const next = new Set(expanded.peek());
  if (!next.delete(key)) next.add(key);
  expanded.value = next;
};

const DAY_MS = 86_400_000;

/** The one menu open in the list: a line's (`sid/cid/n`) or a chapter's (`sid/cid`). */
const menuFor = signal<string | undefined>(undefined);
const toggleMenu = (key: string) => (menuFor.value = menuFor.peek() === key ? undefined : key);

/** "Due now", "Due in 3 days", "New: 4 moves", as Qchess labels its lines. */
function label(row: LineRow, today: { start: number; end: number }): { text: string; tone: string } {
  if (row.state === 'paused') return { text: 'Paused', tone: 'paused' };
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
    <>
    {scope !== undefined && <PriorityBar groups={groups} scope={scope} />}
    {pickSaid.value && (
      <p class="muted line-list-said" role="status" data-testid="line-list-said">
        {pickSaid.value}
      </p>
    )}
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
    </>
  );
}

/**
 * A study's list (§5.70): Prioritize…, and while lines are paused, their count and "Add the next
 * 10 by priority", saying so when the active lines have nothing new left.
 */
function PriorityBar(props: { groups: ChapterRows[]; scope: string }) {
  const { groups, scope } = props;
  const paused = groups.reduce((a, g) => a + g.paused, 0);
  const fresh = groups.some((g) => g.lines.some((r) => r.state === 'new'));
  const busy = growing.value?.sid === scope ? growing.value : undefined;
  return (
    <div class="line-list-bar" role="group" aria-label="Priority">
      {paused > 0 && (
        <span class="muted">
          {!fresh && 'No new lines · '}
          {paused} paused
        </span>
      )}
      {paused > 0 && (
        <button type="button" class="secondary" disabled={!!busy} onClick={() => void addNext(scope, 10)}>
          {busy ? `Ranking… ${busy.done}/${busy.total || '…'}` : 'Add the next 10'}
        </button>
      )}
      <button type="button" class="secondary" onClick={() => openPriority(scope)}>
        Prioritize…
      </button>
      <button type="button" class="secondary" title="The lines that matter most, drilled against the explorer and Maia" onClick={() => open({ name: 'checklists', sid: scope })}>
        Checklist…
      </button>
      {growError.value && (
        <span class="error" role="alert">
          {growError.value}
        </span>
      )}
    </div>
  );
}

function ChapterBlock(props: { group: ChapterRows; data: TrainData; open: boolean; active: { sid: string; cid: string; path: readonly string[] } | undefined; day: { start: number; end: number } }) {
  const { group: g, data, open: isOpen, active, day } = props;
  const key = `${g.sid}/${g.cid}`;
  const chapter = data.chapters.get(key);
  const name = chapter ? (header(chapter, 'ChapterName') ?? g.cid) : g.cid;
  const start = useMemo(() => (chapter ? startPosition(chapter) : undefined), [chapter]);
  const total = g.lines.length - g.paused;
  const here = active && active.sid === g.sid && active.cid === g.cid;
  const menuOpen = menuFor.value === key;
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
        {g.paused > 0 && (
          <span class="line-list-paused" title={`${g.paused} line${g.paused === 1 ? '' : 's'} paused`}>
            {g.paused} paused
          </span>
        )}
        {g.learned < total ? (
          <button type="button" class="line-list-learn" title="Learn this chapter's new lines" onClick={() => open({ name: 'learn', sid: g.sid, cid: g.cid })}>
            Learn {g.learned}/{total}
          </button>
        ) : (
          total > 0 && (
            <span class="line-list-count">
              {g.learned}/{total}
            </span>
          )
        )}
        <button type="button" class="line-list-more" aria-label="Chapter menu" title="Pause, unpause, prioritize" aria-expanded={menuOpen} onClick={() => toggleMenu(key)}>
          ⋯
        </button>
      </div>
      {menuOpen && (
        <div class="line-list-menu" role="group" aria-label="Chapter actions">
          {g.paused < g.lines.length && (
            <button type="button" class="secondary" onClick={() => void chapterMark(g, 'paused')}>
              Pause all lines
            </button>
          )}
          {g.paused > 0 && (
            <button type="button" class="secondary" onClick={() => void chapterMark(g, 'none')}>
              Unpause all lines
            </button>
          )}
          <button
            type="button"
            class="secondary"
            onClick={() => {
              menuFor.value = undefined;
              openPriority(g.sid, g.cid);
            }}
          >
            Prioritize…
          </button>
          <button
            type="button"
            class="secondary"
            onClick={() => {
              menuFor.value = undefined;
              const side = chapter ? header(chapter, 'Orientation') : undefined;
              open({ name: 'checklists', sid: g.sid, ...(side === 'white' || side === 'black' ? { side } : {}) });
            }}
          >
            Checklist…
          </button>
        </div>
      )}
      {isOpen && (
        <div class="line-list-lines">
          {g.lines.map((row) => {
            const l = label(row, day);
            const current = here && row.line.path.length === active!.path.length && row.line.path.every((m, i) => m === active!.path[i]);
            const rowKey = `${key}/${row.number}`;
            const rowMenu = menuFor.value === rowKey;
            const paused = row.state === 'paused';
            return (
              <div key={row.number} class={`line-list-row${rowMenu ? ' menu-open' : ''}`}>
                <button
                  type="button"
                  class={`line-list-line${current ? ' current' : ''}${paused ? ' paused' : ''}`}
                  aria-current={current ? 'true' : undefined}
                  title={movesFrom(start, row.line.path, 0)}
                  onClick={() => open({ name: 'train', sid: row.line.sid, cid: row.line.cid, at: [...row.line.path] })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleMenu(rowKey);
                  }}
                >
                  <span class={`dot dot-${paused ? 'paused' : row.due > 0 ? 'due' : row.state}`} aria-hidden="true" />
                  <span class="line-list-number">
                    Line {row.number}
                    {row.line.must && (
                      <span class="line-list-must" title="Must learn" aria-label="must learn">
                        {' '}
                        ★
                      </span>
                    )}
                  </span>
                  <span class="line-list-moves">{movesFrom(start, row.line.path, Math.min(row.fork, row.line.path.length - 1))}</span>
                  {l.text && <span class={`line-list-label tone-${l.tone}`}>{l.text}</span>}
                </button>
                <button type="button" class="line-list-more" aria-label="Line menu" title="Pause, must learn" aria-expanded={rowMenu} onClick={() => toggleMenu(rowKey)}>
                  ⋯
                </button>
                {rowMenu && (
                  <div class="line-list-menu" role="group" aria-label="Line actions">
                    <button type="button" class="secondary" onClick={() => void lineMark(row.line, paused ? 'none' : 'paused')}>
                      {paused ? 'Unpause' : 'Pause'}
                    </button>
                    <button type="button" class="secondary" onClick={() => void lineMark(row.line, row.line.must ? 'none' : 'must')}>
                      {row.line.must ? 'Not must-learn' : 'Must learn'}
                    </button>
                    <ChecklistToggle chapter={chapter} line={row.line} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The line on its study side's checklist, or off it (§5.142); none for a chapter not played from the start. */
function ChecklistToggle(props: { chapter: Chapter | undefined; line: Line }) {
  const at = props.chapter && chapterLine(props.chapter, props.line.path);
  if (!at) return null;
  const on = isPicked(props.line.sid, at.color, at.uci);
  return (
    <button
      type="button"
      class="secondary"
      title={on ? 'This line was added to the checklist: take it out' : 'Drill this line in the variation checklist, whatever Make again lists'}
      onClick={() => {
        menuFor.value = undefined;
        void pickLine(props.line.sid, at.color, at.uci, !on).then((said) => {
          pickSaid.value = said;
          clearTimeout(saidTimer);
          saidTimer = setTimeout(() => (pickSaid.value = undefined), 5000);
        });
      }}
    >
      {on ? 'Out of the checklist' : 'Add to the checklist'}
    </button>
  );
}

/** What the last Add to the checklist said, under the list's bar. */
const pickSaid = signal<string | undefined>(undefined);
let saidTimer: ReturnType<typeof setTimeout> | undefined;

async function lineMark(line: Line, mark: LineMark): Promise<void> {
  menuFor.value = undefined;
  await setMark(line, mark);
}

/** Pause every line of a chapter but the must-learn ones, or unpause the paused ones. */
async function chapterMark(g: ChapterRows, mark: 'paused' | 'none'): Promise<void> {
  menuFor.value = undefined;
  const lines = g.lines.map((r) => r.line).filter((l) => (mark === 'paused' ? !l.paused && !l.must : l.paused));
  await setMarks(lines.map((line) => ({ line, mark })));
}

/** The next line after `path` in the list's order (its chapter's, then the next chapter's). */
export function nextLine(data: TrainData, scope: string | undefined, at: { sid: string; cid: string; path: readonly string[] }): LineRow | undefined {
  const rows = chapterRows(data.index, data.states, data.settings, dayOf(decidingNow()), scope).flatMap((g) => g.lines);
  const i = rows.findIndex((r) => r.line.sid === at.sid && r.line.cid === at.cid && r.line.path.length === at.path.length && r.line.path.every((m, j) => m === at.path[j]));
  // A paused line (§5.70) is skipped: going on means training.
  return i >= 0 ? rows.slice(i + 1).find((r) => r.state !== 'paused') : undefined;
}

/** The first line of the list with new moves: "Learn the next line". */
export function firstNewLine(data: TrainData, scope: string | undefined): LineRow | undefined {
  for (const g of chapterRows(data.index, data.states, data.settings, dayOf(decidingNow()), scope)) for (const r of g.lines) if (r.state === 'new') return r;
  return undefined;
}

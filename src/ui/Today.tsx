// The home's Today card (PLAN.md §5.158): what is due everywhere, one row a kind of work, and
// "Next" opening the first of it. The repertoire's details stay on the training card below; the
// counts here are the same ones each screen shows. The game cards are counted from the deck as
// last read (the Games screen keeps it), the storm's positions once the home is drawn.
import { useEffect } from 'preact/hooks';
import { checklistViews, chapterNameAt } from '../app/checklist.ts';
import { endgameStandings } from '../app/endgames.ts';
import { gameCountsNow } from '../app/games.ts';
import { ideaEnrolled, ideaQueueNow } from '../app/ideas.ts';
import { repStandings } from '../app/repertoireEndgames.ts';
import { practiceResults } from '../app/repertoireCheck.ts';
import { refreshStormReady, stormReadyAll } from '../app/storm.ts';
import { dataVersion } from '../app/sync.ts';
import { decidingNow } from '../app/time.ts';
import { queueOf, trainData } from '../app/train.ts';
import { modeHash } from '../core/app/fsm.ts';
import { nextChecklistLine, todayRows, type TodayInput } from '../core/app/today.ts';
import { completedPresets, PRESET_ORDER, PRESETS } from '../core/games/checklist.ts';

/** The storm's count, read once the home is drawn and again after a sync changed the data. */
export function useStormReady(): number | undefined {
  const version = dataVersion.value;
  const data = trainData.value;
  useEffect(() => {
    if (!data) return;
    // After the home's first paint: the stored positions are read and tagged.
    const t = setTimeout(() => void refreshStormReady(), 300);
    return () => clearTimeout(t);
  }, [version, data]);
  return stormReadyAll.value;
}

/** The endgames due, theoretical and the repertoire's, and the first of them. */
export function endgamesDue(now: number): { due: number; first?: string } {
  const due = [...endgameStandings(now), ...repStandings(now)].filter(([, s]) => s.state === 'due');
  return due.length ? { due: due.length, first: `#/endgames/${due[0]![0]}` } : { due: 0 };
}

function checklistNext(): TodayInput['checklist'] {
  const views = checklistViews.value;
  const results = practiceResults.value;
  const next = nextChecklistLine(views, (_, l) => completedPresets(results.filter((r) => r.key === l.v.leafKey)), PRESET_ORDER);
  if (!next) return undefined;
  const view = views[next.view]!;
  const name = chapterNameAt(view.sid, next.line.v.leafKey) || view.name;
  return {
    name: `${name} · ${PRESETS[next.preset].label}`,
    href: modeHash({ name: 'checklist', sid: view.sid, side: view.color, line: next.line.v.lineUci, preset: next.preset }),
  };
}

export function TodayCard() {
  const data = trainData.value;
  const ready = useStormReady();
  if (!data) return null;
  const now = decidingNow();
  const input: TodayInput = {};
  if (data.index.cards.size) {
    const q = queueOf(data, now);
    input.repertoire = { due: q.due.length, fresh: q.newCards.length };
  }
  if (ideaEnrolled.value.size) {
    const q = ideaQueueNow(undefined, now);
    input.ideas = { due: q.due.length, fresh: q.fresh.length };
  }
  const games = gameCountsNow(now);
  if (games) input.games = games;
  input.endgames = endgamesDue(now);
  const line = checklistNext();
  if (line) input.checklist = line;
  if (ready !== undefined) input.storm = { ready };
  const rows = todayRows(input);
  return (
    <section class="card today-card" aria-labelledby="today-title" data-testid="today">
      <div class="card-head">
        <h2 id="today-title">Today</h2>
        {rows.length > 0 && (
          <div class="actions">
            <a class="button primary" href={rows[0]!.next} data-testid="today-next" title={`${rows[0]!.label}: ${rows[0]!.detail}`}>
              Next: {rows[0]!.label}
            </a>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p class="muted">Nothing due: all done for now.</p>
      ) : (
        <ul class="today-rows">
          {rows.map((r) => (
            <li key={r.kind} data-testid={`today-${r.kind}`}>
              <a href={r.href}>{r.label}</a> <span class="muted">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

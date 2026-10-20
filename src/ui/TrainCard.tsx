// The home screen's training card (PLAN.md §5.3, §5.7): "Train: 23 due · 18 new", the moves
// whose learning step ends later today, the known pool still to review, and a line of links: the
// progress page (§5.122), the day's mistakes and the pins, and the difficult lines (§5.124); and
// the idea cards' due and new (§5.128), alone when there is no repertoire.
import { ideaEnrolled, ideaQueueNow } from '../app/ideas.ts';
import { decidingNow } from '../app/time.ts';
import { difficultOf, mistakesOf, pinnedOf, queueOf, trainData } from '../app/train.ts';
import { openTrainSettings } from './TrainSettings.tsx';

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The idea cards' line: today's due and new, and their session. */
function IdeasLine() {
  if (!ideaEnrolled.value.size) return null;
  const q = ideaQueueNow();
  return (
    <p class="train-ideas" data-testid="home-ideas">
      Ideas: <span class={`train-due${q.due.length ? ' some' : ''}`}>{q.due.length} due</span> · <span class={`train-new${q.fresh.length ? ' some' : ''}`}>{q.fresh.length} new</span>
      {(q.due.length > 0 || q.fresh.length > 0) && (
        <>
          {' · '}
          <a href="#/ideas">Train ideas</a>
        </>
      )}
    </p>
  );
}

export function TrainCard() {
  const data = trainData.value;
  if (data && data.index.cards.size === 0 && ideaEnrolled.value.size)
    return (
      <section class="card train-card" aria-label="Training">
        <IdeasLine />
      </section>
    );
  if (!data || data.index.cards.size === 0) return null;
  // Due moves and pins at the time travelled to (§5.17); the day's mistakes as recorded.
  const now = decidingNow();
  const queue = queueOf(data, now);
  const mistakes = mistakesOf(data, Date.now()).length;
  const pins = pinnedOf(data, now);
  const difficult = difficultOf(data, now).lines.length;
  return (
    <section class="card train-card" aria-label="Training">
      <div class="card-head">
        <h2>
          Train: <span class={`train-due${queue.due.length ? ' some' : ''}`}>{queue.due.length} due</span> · <span class={`train-new${queue.newCards.length ? ' some' : ''}`}>{queue.newCards.length} new</span>
          {queue.pausedLines > 0 && <span class="train-paused-count muted"> · {queue.pausedLines} paused</span>}
        </h2>
        <div class="actions">
          <a class="button primary" href="#/train">
            Train
          </a>
          <a class="button secondary" href="#/show">
            Show and grade
          </a>
          <button type="button" class="icon" aria-label="Training settings" title="Training settings" onClick={openTrainSettings}>
            ⚙
          </button>
        </div>
      </div>
      {queue.room === 0 && queue.newLines.length === 0 && queue.taughtToday > 0 && (
        <p class="muted">
          Today's {data.settings.newPerDay} new moves are learned. More: pick a line in the training list, or raise the limit (⚙).
        </p>
      )}
      {queue.later.length > 0 && (
        <p class="muted">
          {queue.later.length} more today from {clock(queue.later[0]!.due)}
        </p>
      )}
      {queue.newLines.length === 0 && queue.room > 0 && queue.pausedLines > 0 && (
        <p class="muted">No new lines · {queue.pausedLines} paused: a study's line list adds the next 10 by priority.</p>
      )}
      {queue.knownCards.length > 0 && <p class="muted">Known lines: {queue.knownCards.length.toLocaleString('en')} moves not yet reviewed</p>}
      <p class="train-mistakes">
        <a href="#/progress">Progress</a>
        {(mistakes > 0 || pins.pinned.length > 0) && (
          <>
            {' · '}
            <a href="#/mistakes">
              {mistakes} mistake{mistakes === 1 ? '' : 's'} today{pins.pinned.length > 0 && <> · {pins.pinned.length} pinned</>}
            </a>
          </>
        )}
        {pins.due.length > 0 && (
          <>
            {' · '}
            <a href="#/pinned">Drill pinned ({pins.due.length})</a>
          </>
        )}
        {difficult > 0 && (
          <>
            {' · '}
            <a href="#/difficult" title="Overstudy the lines through your difficult moves: only the moves due are graded">
              Difficult lines ({difficult})
            </a>
          </>
        )}
      </p>
      <IdeasLine />
      {queue.orphaned.length > 0 && <p class="muted">{queue.orphaned.length} reviewed moves are no longer in the repertoire</p>}
    </section>
  );
}

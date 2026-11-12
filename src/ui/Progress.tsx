// The progress page (PLAN.md §5.122): what the log says about the training. Recall measured
// against what the scheduler expected, the moves by stage, the reviews due in the next two
// weeks, the minutes trained in the last two, the chapters weakest first and the moves missed
// again and again; and the days trained over 26 weeks, as a calendar and the runs of days in a row
// (§5.167). Read from the training data (src/core/train/stats.ts); nothing is stored.
import { useMemo, useState } from 'preact/hooks';
import { makeSan } from 'chessops/san';
import { calendarDays, daysSince, localDays, weekdayOf } from '../app/days.ts';
import { decidingNow } from '../app/time.ts';
import { trainData, type TrainData } from '../app/train.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { header } from '../core/study/model.ts';
import { progressStats, runsOf, shadeOf, shadeTop, SHADES, workOf, type DayWork, type ProgressStats, type Span, type Tally } from '../core/train/stats.ts';
import { Back } from './Back.tsx';
import { PinButton, where } from './Mistakes.tsx';

const DAY_MS = 86_400_000;
/** The window recall, chapters and misses are counted over. */
const WINDOW_DAYS = 30;
const SPAN_DAYS = 14;
/** The calendar's columns, a week each. */
const WEEKS = 26;
/** Chapters shown before "Show all". */
const CHAPTERS_SHOWN = 8;
const MISSED_SHOWN = 20;

/** The first answer or move taught in the repertoire's log: the runs of days are counted from its day. */
function firstWork(data: TrainData): number | undefined {
  let first: number | undefined;
  for (const card of data.index.cards.keys()) for (const { event, t } of data.eventsOf(card)) if ((event?.k === 'review' || event?.k === 'taught') && (first === undefined || t < first)) first = t;
  return first;
}

/** The days counted: the calendar's, or every day since the first answer when that is longer, today last. */
function pastDays(data: TrainData, now: number): Span[] {
  const first = firstWork(data);
  const count = Math.max(calendarDays(now, WEEKS), first === undefined ? 0 : daysSince(now, first));
  return localDays(now, 1 - count, count);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const dayName = (ms: number) =>
  new Date(ms).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

export function ProgressView() {
  const data = trainData.value;
  const now = decidingNow();
  const stats = useMemo(
    () =>
      data &&
      progressStats(data.index, data.states, data.eventsOf, data.settings, {
        now,
        since: now - WINDOW_DAYS * DAY_MS,
        ahead: localDays(now, 0, SPAN_DAYS),
        past: pastDays(data, now),
      }),
    // The time travelled to changes `now` by hours at a time; a minute's drift isn't worth a recount.
    [data, Math.floor(now / 60_000)],
  );
  return (
    <div class="progress">
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Progress</span>
        </div>
      </div>
      {!data || !stats ? (
        <p class="muted">Reading the repertoire…</p>
      ) : data.index.cards.size === 0 ? (
        <p class="muted">No repertoire moves yet: mark a study as a repertoire, and train it.</p>
      ) : (
        <>
          <Recall stats={stats} target={data.settings.retention} />
          <MovesCard stats={stats} />
          <Forecast stats={stats} />
          <Minutes stats={stats} />
          <Habit stats={stats} now={now} />
          <Chapters stats={stats} data={data} />
          <MissedCard stats={stats} data={data} />
        </>
      )}
    </div>
  );
}

/**
 * What the measured recall says of the scheduler: in line when the gap is within two standard
 * errors of the share expected, else which way it errs.
 */
function verdict(t: Tally): string {
  if (t.answers < 50) return `Too few reviews yet to judge the scheduler: ${t.answers} of the 50 or so it takes.`;
  const p = t.expected / t.answers;
  const gap = t.right / t.answers - p;
  const noise = 2 * Math.sqrt((p * (1 - p)) / t.answers);
  if (Math.abs(gap) <= noise) return 'In line with what the scheduler expects.';
  return gap > 0
    ? 'You remember more than the scheduler expects: its intervals are shorter than you need, and moves come back sooner than they must.'
    : 'You remember less than the scheduler expects: moves come back later than they should.';
}

function Recall(props: { stats: ProgressStats; target: number }) {
  const { recent, firsts, bands, all } = props.stats;
  return (
    <section class="card" aria-label="Recall" data-testid="progress-recall">
      <h2>Recall, last {WINDOW_DAYS} days</h2>
      {recent.answers === 0 ? (
        <p class="muted">No reviews in the last {WINDOW_DAYS} days.</p>
      ) : (
        <>
          <div class="stat-row">
            <Stat value={pct(recent.right / recent.answers)} label={`right of ${recent.answers.toLocaleString('en')} review${recent.answers === 1 ? '' : 's'}`} />
            <Stat value={pct(recent.expected / recent.answers)} label="the scheduler expected" />
            {firsts.answers > 0 && <Stat value={pct(firsts.right / firsts.answers)} label={`right at a move's first review (${firsts.answers})`} />}
          </div>
          <p class="progress-verdict">{verdict(recent)}</p>
          <p class="muted">
            The target is {pct(props.target)} at the time a move falls due; moves reviewed early (on a line walked to its end) are expected higher, so the expected share counts each review at its own
            time.
          </p>
        </>
      )}
      {all.answers > 0 && (
        <details>
          <summary>
            By predicted recall, all time ({all.answers.toLocaleString('en')} review{all.answers === 1 ? '' : 's'})
          </summary>
          <table class="cards progress-bands">
            <thead>
              <tr>
                <th>Predicted</th>
                <th>Reviews</th>
                <th>Expected</th>
                <th>Right</th>
              </tr>
            </thead>
            <tbody>
              {bands
                .filter((b) => b.answers > 0)
                .map((b) => (
                  <tr key={b.from}>
                    <td>{b.to > 1 ? `${pct(b.from)} and over` : b.from === 0 ? `under ${pct(b.to)}` : `${pct(b.from)}–${pct(b.to)}`}</td>
                    <td>{b.answers}</td>
                    <td>{pct(b.expected / b.answers)}</td>
                    <td>{pct(b.right / b.answers)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function Stat(props: { value: string; label: string }) {
  return (
    <div class="stat">
      <span class="stat-value">{props.value}</span>
      <span class="stat-label">{props.label}</span>
    </div>
  );
}

function MovesCard(props: { stats: ProgressStats }) {
  const m = props.stats.moves;
  const n = (x: number) => x.toLocaleString('en');
  return (
    <section class="card" aria-label="Moves" data-testid="progress-moves">
      <h2>Moves: {n(m.total)}</h2>
      <div class="stat-row">
        <Stat value={n(m.mature)} label="mature (remembered 3 weeks or more)" />
        <Stat value={n(m.young)} label="young" />
        <Stat value={n(m.learning)} label="taught, not yet reviewed" />
        <Stat value={n(m.fresh)} label="not started" />
      </div>
      {(m.suspended > 0 || m.paused > 0) && (
        <p class="muted">
          Left out: {m.suspended > 0 && `${n(m.suspended)} suspended`}
          {m.suspended > 0 && m.paused > 0 && ' · '}
          {m.paused > 0 && `${n(m.paused)} on paused lines only`}
        </p>
      )}
    </section>
  );
}

const weekday = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'narrow' });

/**
 * One series of daily bars, labelled with the day's weekday and date; the biggest and the first
 * carry their value. With nothing on any day, one line says so instead of bare axes (§5.158).
 */
function Bars(props: { days: readonly (Span & { value: number })[]; title: (value: number) => string; label: string; empty: string }) {
  const max = Math.max(1, ...props.days.map((d) => d.value));
  const top = props.days.findIndex((d) => d.value === max);
  if (props.days.every((d) => d.value <= 0))
    return (
      <p class="muted bars-empty" data-testid="bars-empty">
        {props.empty}
      </p>
    );
  return (
    <div class="bars" role="list" aria-label={props.label}>
      {props.days.map((d, i) => {
        const title = `${dayName(d.start)}: ${props.title(d.value)}`;
        return (
          <div key={d.start} class="bar" role="listitem" title={title} aria-label={title}>
            <span class="bar-value">{d.value > 0 && (i === 0 || i === top) ? Math.round(d.value) : ''}</span>
            <span class="bar-track">
              <span class="bar-fill" style={{ height: `${(d.value / max) * 100}%` }} />
            </span>
            <span class="bar-day">
              <span class="bar-weekday">{weekday(d.start)}</span>
              {new Date(d.start).getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Forecast(props: { stats: ProgressStats }) {
  const f = props.stats.forecast;
  const total = f.reduce((s, d) => s + d.due, 0);
  return (
    <section class="card" aria-label="Reviews ahead" data-testid="progress-forecast">
      <h2>
        Reviews ahead: {total.toLocaleString('en')} in {SPAN_DAYS} days
      </h2>
      <Bars days={f.map((d) => ({ ...d, value: d.due }))} title={(v) => `${v} due`} label="Reviews due each day" empty={`Nothing due in the next ${SPAN_DAYS} days.`} />
      <p class="muted">Today counts the overdue ones. Each move is counted as answered right on its day; misses and new moves add to it.</p>
    </section>
  );
}

function Minutes(props: { stats: ProgressStats }) {
  const days = props.stats.days.slice(-SPAN_DAYS);
  const trained = days.filter((d) => workOf(d) > 0);
  const minutes = days.reduce((s, d) => s + d.minutes, 0);
  const answers = days.reduce((s, d) => s + d.answers, 0);
  const taught = days.reduce((s, d) => s + d.taught, 0);
  return (
    <section class="card" aria-label="Time trained" data-testid="progress-minutes">
      <h2>
        Last {SPAN_DAYS} days: {Math.round(minutes)} min on {trained.length} day
        {trained.length === 1 ? '' : 's'}
      </h2>
      <Bars days={days.map((d) => ({ ...d, value: d.minutes }))} title={(v) => `${Math.round(v)} min`} label="Minutes trained each day" empty={trained.length ? 'No minutes counted: the answers were more than five minutes apart.' : `No training in the last ${SPAN_DAYS} days: today's moves are on the home's Train.`} />
      <p class="muted">
        {answers.toLocaleString('en')} review{answers === 1 ? '' : 's'} and {taught.toLocaleString('en')} new move{taught === 1 ? '' : 's'}
        {trained.length > 0 && <>, {Math.round(minutes / trained.length)} min a day on the days trained</>}. Minutes are the time between answers, a pause of over five minutes left out.
      </p>
    </section>
  );
}

const plural = (n: number, one: string) => `${n.toLocaleString('en')} ${one}${n === 1 ? '' : 's'}`;
const dayTitle = (d: DayWork) => `${dayName(d.start)}: ${workOf(d) > 0 ? `${plural(d.answers, 'answer')}, ${plural(d.taught, 'new move')}, ${Math.round(d.minutes)} min` : 'no training'}`;
const monthName = (ms: number) => new Date(ms).toLocaleDateString([], { month: 'short' });
/** The weekdays named beside the calendar's rows: Monday, Wednesday and Friday. */
const NAMED_ROWS = [0, 2, 4];

/**
 * The days trained (§5.167): the run of days in a row, the longest, the days of the last 30; and
 * a calendar of the last 26 weeks, a column a week from Monday, a square a day shaded by its
 * answers and new moves. A square's title is its day; a tap shows it under the calendar.
 */
function Habit(props: { stats: ProgressStats; now: number }) {
  const all = props.stats.days;
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const runs = useMemo(() => runsOf(all), [all]);
  const shown = all.slice(-calendarDays(props.now, WEEKS));
  const today = shown[shown.length - 1];
  if (!today) return null;
  const busiest = Math.max(0, ...shown.map(workOf));
  const trained = shown.filter((d) => workOf(d) > 0).length;
  const month = all.slice(-WINDOW_DAYS);
  // The first column's days before the calendar's first (none: it starts on a Monday).
  const lead = weekdayOf(shown[0]!.start);
  const column = (i: number) => Math.floor((i + lead) / 7);
  // A month is named over the column its first day is in; the first column's, when the next is far enough.
  const months: { col: number; name: string }[] = [];
  shown.forEach((d, i) => {
    if (new Date(d.start).getDate() === 1 && column(i) > 0) months.push({ col: column(i), name: monthName(d.start) });
  });
  if (!months.length || months[0]!.col >= 3) months.unshift({ col: 0, name: monthName(shown[0]!.start) });
  const shades = Array.from({ length: SHADES - 1 }, (_, i) => ({ shade: i + 1, from: shadeTop(i, busiest) + 1, to: shadeTop(i + 1, busiest) })).filter((s) => s.from <= s.to);
  const told = shown.find((d) => d.start === picked) ?? today;
  return (
    <section class="card cal-card" aria-label="Days trained" data-testid="progress-days">
      <h2>
        Last {WEEKS} weeks: {plural(trained, 'day')} trained
      </h2>
      <div class="stat-row">
        <Stat value={String(runs.current)} label={`day${runs.current === 1 ? '' : 's'} in a row${!runs.today && runs.current > 0 ? ' up to yesterday' : ''}`} />
        <Stat value={String(runs.longest)} label={`day${runs.longest === 1 ? '' : 's'}, the longest run`} />
        <Stat value={String(month.filter((d) => workOf(d) > 0).length)} label={`of the last ${month.length} days`} />
      </div>
      <div
        class="cal"
        role="list"
        aria-label={`Days trained, the last ${WEEKS} weeks`}
        style={{ '--cal-weeks': WEEKS }}
        onClick={(e) => {
          const day = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset['day'];
          if (day !== undefined) setPicked(Number(day));
        }}
      >
        {months.map((m, i) => (
          <span key={`m${m.col}`} class={`cal-month${m.col >= WEEKS - 1 ? ' last' : ''}`} aria-hidden="true" style={{ gridColumn: `${m.col + 2} / ${(months[i + 1]?.col ?? WEEKS) + 2}` }}>
            {m.name}
          </span>
        ))}
        {NAMED_ROWS.map((row) => (
          <span key={`w${row}`} class="cal-weekday" aria-hidden="true" style={{ gridRow: row + 2 }}>
            {weekday(shown[(row - lead + 7) % 7]!.start)}
          </span>
        ))}
        {shown.map((d, i) => {
          const title = dayTitle(d);
          return (
            <span
              key={d.start}
              role="listitem"
              class={`cal-day s${shadeOf(workOf(d), busiest)}${d === today ? ' today' : ''}${d === told && picked !== undefined ? ' picked' : ''}`}
              style={{ gridColumn: column(i) + 2, gridRow: ((i + lead) % 7) + 2 }}
              data-day={d.start}
              title={title}
              aria-label={title}
            />
          );
        })}
      </div>
      <p class="cal-told" data-testid="cal-told" aria-live="polite">
        {dayTitle(told)}
      </p>
      <p class="muted cal-legend">
        Answers and new moves a day:{' '}
        <span class="cal-key">
          <span class="cal-day s0" /> none
        </span>
        {shades.map((s) => (
          <span key={s.shade} class="cal-key">
            <span class={`cal-day s${s.shade}`} /> {s.from === s.to ? s.to : `${s.from}–${s.to}`}
          </span>
        ))}
      </p>
    </section>
  );
}

const chapterName = (data: TrainData, sid: string, cid: string) => {
  const chapter = data.chapters.get(`${sid}/${cid}`);
  return `${data.studyNames.get(sid) ?? sid}: ${(chapter && header(chapter, 'ChapterName')) ?? cid}`;
};

function Chapters(props: { stats: ProgressStats; data: TrainData }) {
  const [all, setAll] = useState(false);
  const started = props.stats.chapters.filter((c) => c.recall !== undefined);
  const notStarted = props.stats.chapters.length - started.length;
  if (started.length === 0) return null;
  const shown = all ? started : started.slice(0, CHAPTERS_SHOWN);
  return (
    <section class="card" aria-label="Chapters" data-testid="progress-chapters">
      <h2>Chapters, weakest first</h2>
      <div class="table-scroll">
        <table class="cards progress-chapters">
          <thead>
            <tr>
              <th>Chapter</th>
              <th title="The predicted recall now, over its reviewed moves">Recall now</th>
              <th title={`Answers in the last ${WINDOW_DAYS} days`}>Right, {WINDOW_DAYS} days</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={`${c.sid}/${c.cid}`}>
                <td>
                  <a href={`#/study/${c.sid}/${c.cid}`}>{chapterName(props.data, c.sid, c.cid)}</a>
                </td>
                <td>{pct(c.recall!)}</td>
                <td>{c.answers > 0 ? `${c.right} of ${c.answers}` : '–'}</td>
                <td>
                  {c.started} of {c.moves}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {started.length > CHAPTERS_SHOWN && (
        <button type="button" class="secondary" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${started.length}`}
        </button>
      )}
      {notStarted > 0 && (
        <p class="muted">
          {notStarted} chapter{notStarted === 1 ? '' : 's'} not reviewed yet.
        </p>
      )}
    </section>
  );
}

function MissedCard(props: { stats: ProgressStats; data: TrainData }) {
  const { data } = props;
  const missed = props.stats.missed;
  return (
    <section class="card" aria-label="Moves missed" data-testid="progress-missed">
      <h2>Missed again and again: {missed.length}</h2>
      {missed.length === 0 ? (
        <p class="muted">No move missed twice in the last {WINDOW_DAYS} days.</p>
      ) : (
        <ul class="mistake-list">
          {missed.slice(0, MISSED_SHOWN).map((m) => {
            const w = where(data, m.card);
            const tried = w?.before
              ? m.wrong.map((u) => {
                  const move = parseUciMove(w.before!, u);
                  return move ? makeSan(w.before!, move) : u;
                })
              : m.wrong;
            return (
              <li key={m.card}>
                <div>
                  <strong>{w?.name}</strong> <span class="mistake-moves">{w?.moves}</span>
                  <div class="muted">
                    missed {m.misses} of {m.answers} · your move {w?.at.san}
                    {tried.length > 0 && <> · last tried {tried.join(', ')}</>}
                  </div>
                </div>
                <div class="actions">
                  <PinButton data={data} card={m.card} />
                  {w && <a href={`#/study/${w.at.sid}/${w.at.cid}?at=${w.at.path.map(encodeURIComponent).join(',')}`}>Study</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {missed.length > MISSED_SHOWN && <p class="muted">And {missed.length - MISSED_SHOWN} more.</p>}
      <p class="muted">Moves answered wrong twice or more in the last {WINDOW_DAYS} days, the most misses first. Pin one to drill it until it sticks.</p>
    </section>
  );
}

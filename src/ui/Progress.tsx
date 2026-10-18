// The progress page (PLAN.md §5.122): what the log says about the training. Recall measured
// against what the scheduler expected, the moves by stage, the reviews due in the next two
// weeks, the minutes trained in the last two, the chapters weakest first and the moves missed
// again and again. Read from the training data (src/core/train/stats.ts); nothing is stored.
import { useMemo, useState } from 'preact/hooks';
import { makeSan } from 'chessops/san';
import { decidingNow } from '../app/time.ts';
import { trainData, type TrainData } from '../app/train.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import { header } from '../core/study/model.ts';
import { progressStats, type ProgressStats, type Span, type Tally } from '../core/train/stats.ts';
import { Back } from './Back.tsx';
import { PinButton, where } from './Mistakes.tsx';

const DAY_MS = 86_400_000;
/** The window recall, chapters and misses are counted over. */
const WINDOW_DAYS = 30;
const SPAN_DAYS = 14;
/** Chapters shown before "Show all". */
const CHAPTERS_SHOWN = 8;
const MISSED_SHOWN = 20;

/** `count` local days from the day `offset` days from now's, by the device's calendar. */
function localDays(now: number, offset: number, count: number): Span[] {
  const d = new Date(now);
  return Array.from({ length: count }, (_, i) => ({
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset + i).getTime(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset + i + 1).getTime(),
  }));
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
        past: localDays(now, 1 - SPAN_DAYS, SPAN_DAYS),
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

/** One series of daily bars, labelled with the day's date; the biggest and the first carry their value. */
function Bars(props: { days: readonly (Span & { value: number })[]; title: (value: number) => string; label: string }) {
  const max = Math.max(1, ...props.days.map((d) => d.value));
  const top = props.days.findIndex((d) => d.value === max);
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
            <span class="bar-day">{new Date(d.start).getDate()}</span>
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
      <Bars days={f.map((d) => ({ ...d, value: d.due }))} title={(v) => `${v} due`} label="Reviews due each day" />
      <p class="muted">Today counts the overdue ones. Each move is counted as answered right on its day; misses and new moves add to it.</p>
    </section>
  );
}

function Minutes(props: { stats: ProgressStats }) {
  const days = props.stats.days;
  const trained = days.filter((d) => d.answers + d.taught > 0);
  const minutes = days.reduce((s, d) => s + d.minutes, 0);
  const answers = days.reduce((s, d) => s + d.answers, 0);
  const taught = days.reduce((s, d) => s + d.taught, 0);
  return (
    <section class="card" aria-label="Time trained" data-testid="progress-minutes">
      <h2>
        Last {SPAN_DAYS} days: {Math.round(minutes)} min on {trained.length} day
        {trained.length === 1 ? '' : 's'}
      </h2>
      <Bars days={days.map((d) => ({ ...d, value: d.minutes }))} title={(v) => `${Math.round(v)} min`} label="Minutes trained each day" />
      <p class="muted">
        {answers.toLocaleString('en')} review{answers === 1 ? '' : 's'} and {taught.toLocaleString('en')} new move{taught === 1 ? '' : 's'}
        {trained.length > 0 && <>, {Math.round(minutes / trained.length)} min a day on the days trained</>}. Minutes are the time between answers, a pause of over five minutes left out.
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

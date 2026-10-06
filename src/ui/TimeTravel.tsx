// Time travel (PLAN.md §5.17): the control, in the training settings and the debug panel, and the
// banner every screen shows while it is on.
import { useState } from 'preact/hooks';
import { offsetLabel, setTimeOffset, TIME_STEPS, timeOffset } from '../app/time.ts';

const HOUR_MS = 3_600_000;
const HELP =
  'Due moves, the learning step, the queue and the pins are worked out as if it were later. Answers are still recorded at the real time, so a review made ahead is an early review; new moves taught meanwhile count to the real day’s limit once back at now.';

export function TimeBanner() {
  const offset = timeOffset.value;
  if (!offset) return null;
  return (
    <div class="banner banner-time" role="status" title={HELP}>
      <span>
        Time {offsetLabel(offset)} <span class="muted">· {new Date(Date.now() + offset).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      <button type="button" onClick={() => setTimeOffset(0)}>
        Back to now
      </button>
    </div>
  );
}

/** Now, +1 hour … +1 week, or a number of hours; applied at once, for this tab. */
export function TimeControl() {
  const offset = timeOffset.value;
  const preset = TIME_STEPS.some((s) => s.hours * HOUR_MS === offset);
  const [custom, setCustom] = useState(!preset);
  const [hours, setHours] = useState(String(offset / HOUR_MS));
  return (
    <div class="time-control">
      <label>
        Time <span class="muted">(this tab)</span>
        <select
          name="time"
          value={custom ? 'custom' : String(offset / HOUR_MS)}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === 'custom') return setCustom(true);
            setCustom(false);
            setTimeOffset(Number(v) * HOUR_MS);
          }}
        >
          {TIME_STEPS.map((s) => (
            <option key={s.hours} value={String(s.hours)}>
              {s.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>
      {custom && (
        <label>
          Hours ahead
          <input
            type="number"
            name="time-hours"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={hours}
            onInput={(e) => setHours(e.currentTarget.value)}
            onChange={(e) => {
              const h = Number(e.currentTarget.value);
              if (Number.isFinite(h) && h >= 0) setTimeOffset(h * HOUR_MS);
            }}
          />
        </label>
      )}
      <p class="muted">{HELP}</p>
    </div>
  );
}

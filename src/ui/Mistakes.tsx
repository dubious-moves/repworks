// The day's mistakes and the pins (PLAN.md §5.8): each mistake with its line, the move asked and
// the moves tried; Retry and Drill over all of them; Pin per mistake. The pins below, each with
// its next drill and its clean answers so far; "Drill pinned" when some are due.
import { decidingNow } from '../app/time.ts';
import { makeSan } from 'chessops/san';
import { recordEvent } from '../app/state.ts';
import { cardLine } from '../core/train/mistakes.ts';
import { mistakesOf, pinnedOf, trainData, type TrainData } from '../app/train.ts';
import { parseUciMove } from '../core/chess/uci.ts';
import type { CardId } from '../core/progress/cards.ts';
import { CLEAN_TO_RETIRE } from '../core/train/pins.ts';
import { header } from '../core/study/model.ts';
import { positionAt, startPosition } from '../core/study/tree.ts';
import { numbered } from './Train.tsx';
import { Back } from './Back.tsx';

const clock = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Where a card's move is played: its chapter, the moves up to it, and its position before. */
function where(data: TrainData, card: CardId) {
  const at = cardLine(data.index, card)?.at;
  const chapter = at && data.chapters.get(`${at.sid}/${at.cid}`);
  if (!at || !chapter) return undefined;
  const start = startPosition(chapter);
  const before = positionAt(chapter, at.path.slice(0, -1));
  return { at, chapter, name: header(chapter, 'ChapterName') ?? chapter.id, moves: start ? numbered(start, at.path) : at.path.join(' '), before };
}

function PinButton(props: { data: TrainData; card: CardId }) {
  const pinned = props.data.pins.get(props.card)?.pinned === true;
  return (
    <button
      type="button"
      class="secondary"
      aria-pressed={pinned}
      onClick={() => void recordEvent({ t: new Date().toISOString(), k: pinned ? 'unpin' : 'pin', card: props.card })}
    >
      {pinned ? 'Unpin' : 'Pin'}
    </button>
  );
}

export function MistakesView() {
  const data = trainData.value;
  if (!data) return <p class="muted">Reading the repertoire…</p>;
  // The day's mistakes as recorded; the pins due at the time travelled to (§5.17).
  const now = decidingNow();
  const mistakes = mistakesOf(data, Date.now());
  const { pinned, due } = pinnedOf(data, now);
  return (
    <div class="mistakes">
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Mistakes</span>
        </div>
      </div>
      <section class="card" aria-label="Today's mistakes">
        <div class="card-head">
          <h2>Today: {mistakes.length}</h2>
          {mistakes.length > 0 && (
            <div class="actions">
              <a class="button" href="#/mistakes/retry">
                Retry
              </a>
              <a class="button" href="#/mistakes/drill">
                Drill
              </a>
            </div>
          )}
        </div>
        {mistakes.length === 0 ? (
          <p class="muted">No mistakes today.</p>
        ) : (
          <ul class="mistake-list">
            {mistakes.map((m) => {
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
                      {tried.length > 0 && <>tried {tried.join(', ')}</>}
                      {tried.length > 0 && m.hint && ' · '}
                      {m.hint && 'hint'}
                    </div>
                  </div>
                  <div class="actions">
                    <PinButton data={data} card={m.card} />
                    {w && (
                      <a href={`#/study/${w.at.sid}/${w.at.cid}?at=${w.at.path.map(encodeURIComponent).join(',')}`}>
                        Study
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section class="card" aria-label="Pinned">
        <div class="card-head">
          <h2>Pinned: {pinned.length}</h2>
          <div class="actions">
            {due.length > 0 && (
              <a class="button" href="#/pinned">
                Drill pinned ({due.length})
              </a>
            )}
            {pinned.length > due.length && (
              <a class="button secondary" href="#/pinned/all">
                Drill all
              </a>
            )}
          </div>
        </div>
        {pinned.length === 0 ? (
          <p class="muted">Pin a mistake to drill it until it sticks: three clean answers, spaced 30 minutes, 4 hours and a day apart.</p>
        ) : (
          <ul class="mistake-list">
            {pinned.map((card) => {
              const w = where(data, card);
              const p = data.pins.get(card)!;
              return (
                <li key={card}>
                  <div>
                    <strong>{w?.name}</strong> <span class="mistake-moves">{w?.moves}</span>
                    <div class="muted">
                      {p.due <= now ? 'due now' : `next ${clock(p.due)}`} · {p.streak} of {CLEAN_TO_RETIRE} clean
                    </div>
                  </div>
                  <div class="actions">
                    <PinButton data={data} card={card} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// Endgames (PLAN.md §5.145): the theoretical endgames by group, each with its board, its task and
// where it stands (new, due, or solved n times running and when it comes back); and one played for
// its goal against Maia's defence checked by Stockfish (§5.147), or Stockfish's alone without Maia: a move that throws the goal away stops the game ("Kd5 lets the win
// slip") until it is taken back, the move that kept it a press away; the method, open before a
// first try and a press away after; the result and what it counted for. And the endgames of the
// user's own repertoire (§5.149): gathered from real games through the line ends, by category,
// played the same way; and those of the user's courses (§5.175): the chapters of a reference study
// that start from a position, scored on the device, by the course's own groups, with the course's
// text for the chapter kept under the board.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { checkEndgameMaia, endgameMaiaHere, endgameStandings, startEndgame } from '../app/endgames.ts';
import { endgameMaiaAlone, setEndgameMaiaAlone } from '../app/endgameVariety.ts';
import { courseById, courseCandidates, courseNow, courseScores, courseScoring, courseStandings, loadCourse, removeCourseDrill, restoreCourseDrills, scoreCourse, stopCourseScoring } from '../app/courseEndgames.ts';
import { readSearchChapters, searchChapters } from '../app/search.ts';
import { dataVersion } from '../app/sync.ts';
import { gatherRepEndgames, loadRepEndgames, removeRepEndgame, repById, repEndgames, repGather, repStandings, stopRepGather } from '../app/repertoireEndgames.ts';
import { maiaDialog } from '../app/maia.ts';
import { analyseFrom, entryKey, open } from '../app/mode.ts';
import { canTakeBack, leavePractice, parkPractice, playOnAfterSlip, practice, practiceHint, practiceMove, showSlipMove, stopPractice, takeBack, takeUpPractice, type PracticeGame } from '../app/practice.ts';
import { decidingNow } from '../app/time.ts';
import { bareTarget, CONVERT_LEAD, endgameById, ENDGAMES, GROUPS, MAIA_ELO, nextEndgame, sideOf, solvedBy, taskOf, type Endgame, type Standing } from '../core/endgames/endgames.ts';
import { asCourseEndgame, courseText, groupsOf, isCourseId, type CourseDrill } from '../core/endgames/courses.ts';
import { asEndgame, CATEGORIES, categoryById, isRepertoireId, REP, type Category, type RepertoireEndgame } from '../core/endgames/repertoire.ts';
import { lineTail } from '../core/storm/sources.ts';
import { positionOf } from '../core/storm/walk.ts';
import { Back } from './Back.tsx';
import { MiniBoard } from './CommentOffer.tsx';
import { gamePremove, MoveBoard, MoveList } from './Practice.tsx';
import { BoardNote } from './BoardLink.tsx';
import { useWakeLock } from './wakeLock.ts';

const DAY = 86_400_000;

/** "today", "tomorrow", "in 6 days". */
function inDays(t: number, now: number): string {
  const d = Math.ceil((t - now) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

/** Where an endgame stands, in a few words. */
function standingText(s: Standing, now: number): string {
  if (s.state === 'new') return 'New';
  if (s.state === 'due') return s.streak ? 'Due' : 'Due · missed last time';
  return `Solved ${s.streak === 1 ? 'once' : `${s.streak} times running`} · back ${inDays(s.next!, now)}`;
}

/** The last tries as ✓ and ✗, oldest first. */
function Marks(props: { marks: readonly boolean[] }) {
  if (!props.marks.length) return null;
  return (
    <span class="endgame-marks" aria-label={`Last tries: ${props.marks.map((m) => (m ? 'solved' : 'missed')).join(', ')}`}>
      {props.marks.map((m, i) => (
        <span key={i} class={m ? 'solved' : 'missed'}>
          {m ? '✓' : '✗'}
        </span>
      ))}
    </span>
  );
}

export function EndgamesScreen(props: { id?: string }) {
  if (props.id && isRepertoireId(props.id)) return <RepertoireDrill id={props.id} />;
  if (props.id && isCourseId(props.id)) return <CourseDrillScreen id={props.id} />;
  if (props.id) {
    const e = endgameById(props.id);
    return e ? <EndgameDrill key={e.id} endgame={e} /> : <EndgameList />;
  }
  return <EndgameList />;
}

/** A repertoire endgame's drill, once the kept list is read (an address opened cold). */
function RepertoireDrill(props: { id: string }) {
  useEffect(() => void loadRepEndgames(), []);
  if (!repEndgames.value) return <p class="muted">Setting up…</p>;
  const r = repById(props.id);
  return r ? <EndgameDrill key={r.id} endgame={asEndgame(r)} rep={r} /> : <EndgameList />;
}

/** A course drill, once the scores and the chapters are read (an address opened cold). */
function CourseDrillScreen(props: { id: string }) {
  const version = dataVersion.value;
  useEffect(() => {
    void loadCourse();
    void readSearchChapters();
  }, [version]);
  if (!courseScores.value || !searchChapters.value) return <p class="muted">Setting up…</p>;
  const d = courseById(props.id);
  return d ? <EndgameDrill key={d.id} endgame={asCourseEndgame(d)} course={d} /> : <EndgameList />;
}

function EndgameList() {
  const now = decidingNow();
  const standings = endgameStandings(now);
  const next = nextEndgame(standings);
  const due = ENDGAMES.filter((e) => standings.get(e.id)?.state === 'due').length;
  const fresh = ENDGAMES.filter((e) => standings.get(e.id)?.state === 'new').length;
  const soonest = Math.min(...ENDGAMES.map((e) => standings.get(e.id)?.next ?? Infinity));
  useEffect(checkEndgameMaia, []);
  return (
    <div class="games endgames">
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Endgames</span>
        </div>
      </div>
      <section class="card endgames-intro">
        <p>
          The endgames every player needs, each played against a defence that sets the traps a strong player sets. A move that throws the goal away stops the game: take it
          back and find a better one. A try counts once, whatever happens after a take-back or a hint; a solved endgame comes back after 1, 3, 7, 14, 30 and 60 days. After a
          miss the defence plays as it did, so you can put it right; otherwise it tries the likely replies you have met least.
        </p>
        <OpponentNote />
        <div class="actions">
          {next ? (
            <a class="button primary" href={`#/endgames/${next.id}`} data-testid="endgame-next">
              {standings.get(next.id)?.state === 'due' ? 'Next due' : 'Next new'}: {next.title}
            </a>
          ) : (
            <span class="muted">All solved for now{Number.isFinite(soonest) ? `: the next comes back ${inDays(soonest, now)}` : ''}.</span>
          )}
          <span class="muted" data-testid="endgame-counts">
            {due} due · {fresh} new
          </span>
        </div>
      </section>
      <RepertoireEndgames now={now} />
      <CourseEndgames now={now} />
      {GROUPS.map((g) => (
        <section key={g.id} class="card endgame-group" aria-labelledby={`endgame-group-${g.id}`}>
          <h2 id={`endgame-group-${g.id}`}>{g.title}</h2>
          <ul class="endgame-list">
            {ENDGAMES.filter((e) => e.group === g.id).map((e) => (
              <EndgameItem key={e.id} endgame={e} standing={standings.get(e.id)!} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Who the opponent is: Maia checked by Stockfish or Maia alone (the switch), or Stockfish alone with the offer of Maia. */
function OpponentNote() {
  const here = endgameMaiaHere.value;
  if (here === undefined) return null;
  const alone = endgameMaiaAlone.value;
  return (
    <>
      <p class="muted endgame-opponent" data-testid="endgame-opponent">
        {here ? (
          alone ? (
            <>The opponent: Maia {MAIA_ELO} plays the move a strong player would try, at once: Stockfish doesn’t check it, so now and then it may let you off.</>
          ) : (
            <>The opponent: Maia {MAIA_ELO} plays the move a strong player would try, among the moves Stockfish finds sound.</>
          )
        ) : (
          <>
            The opponent: Stockfish alone. It knows a lost position is lost whichever move it plays, so it often plays one that sets no problem; Maia plays the testing move a
            strong player would try.{' '}
            <button type="button" class="link" onClick={() => (maiaDialog.value = true)}>
              Get Maia…
            </button>
          </>
        )}
      </p>
      {here && (
        <label class="check endgame-alone">
          <input type="checkbox" checked={alone} onChange={(ev) => setEndgameMaiaAlone(ev.currentTarget.checked)} /> Maia alone: answers at once, without waiting on Stockfish’s
          check
        </label>
      )}
    </>
  );
}

function EndgameItem(props: { endgame: Endgame; standing: Standing; now: number }) {
  const e = props.endgame;
  const s = props.standing;
  const pos = useMemo(() => positionOf(e.fen), [e.fen]);
  return (
    <li class={`endgame-item state-${s.state}`} data-endgame={e.id}>
      <a class="endgame-board" href={`#/endgames/${e.id}`} aria-label={`Play ${e.title}`} tabIndex={-1}>
        {pos && <MiniBoard position={pos} orientation={sideOf(e)} />}
      </a>
      <div class="endgame-text">
        <a class="endgame-title" href={`#/endgames/${e.id}`}>
          {e.title}
        </a>
        <span class="muted">{taskOf(e)}</span>
        <span class={`endgame-standing state-${s.state}`} data-testid="endgame-standing">
          {standingText(s, props.now)} <Marks marks={s.last} />
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ the repertoire's endgames (§5.149) */

const CAT_KEY = 'repworks-endgames-category';
function readCat(): Category | 'all' {
  try {
    const c = localStorage.getItem(CAT_KEY);
    return c && categoryById(c) ? (c as Category) : 'all';
  } catch {
    return 'all';
  }
}
/** Items shown before "Show all". */
const REP_SHOWN = 12;
const STATE_RANK = { due: 0, new: 1, later: 2 } as const;

function RepertoireEndgames(props: { now: number }) {
  useEffect(() => void loadRepEndgames(), []);
  const [cat, setCat] = useState<Category | 'all'>(readCat);
  const [all, setAll] = useState(false);
  const list = repEndgames.value;
  const g = repGather.value;
  if (!list) return null;
  const standings = repStandings(props.now);
  const stateOf = (r: RepertoireEndgame) => standings.get(r.id)?.state ?? 'new';
  const shown = cat === 'all' ? list : list.filter((r) => r.category === cat);
  // What to play first at the top: due, then new, then the rest, each in the list's order.
  const ordered = [...shown].sort((a, b) => STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)]);
  const next = nextEndgame(standings, undefined, shown);
  const due = shown.filter((r) => stateOf(r) === 'due').length;
  const fresh = shown.filter((r) => stateOf(r) === 'new').length;
  const choose = (c: Category | 'all') => {
    setCat(c);
    setAll(false);
    try {
      localStorage.setItem(CAT_KEY, c);
    } catch {
      // Not kept: the choice is a convenience.
    }
  };
  return (
    <section class="card endgame-group endgame-repertoire" aria-labelledby="endgame-group-repertoire" data-testid="endgame-repertoire">
      <h2 id="endgame-group-repertoire">From your repertoire</h2>
      <p class="muted">
        Endgames reached in real games through your line ends (Lichess’s explorer): the first quiet moment of each game’s endgame with you to move, at most four pieces besides
        the kings and pawns. Where Stockfish has you +3 or better, win it: queen a pawn or go {CONVERT_LEAD} points up. Where it’s about level (−1 to +1.5), hold it for{' '}
        {REP.hold} moves.
      </p>
      <div class="actions">
        {g?.running ? (
          <button type="button" class="secondary" onClick={stopRepGather}>
            Stop
          </button>
        ) : (
          <button type="button" class={list.length ? 'secondary' : 'primary'} onClick={() => void gatherRepEndgames()} title="Walks the games the explorer names at each of your line ends to their endgames">
            {list.length ? 'Gather more' : 'Gather from your repertoire'}
          </button>
        )}
        {next && (
          <a class="button primary" href={`#/endgames/${next.id}`} data-testid="rep-endgame-next">
            {stateOf(next) === 'due' ? 'Next due' : 'Next new'}: {next.title}
          </a>
        )}
        {list.length > 0 && (
          <span class="muted" data-testid="rep-endgame-counts">
            {shown.length} kept · {due} due · {fresh} new
          </span>
        )}
      </div>
      {g && (
        <p class="muted" role="status" data-testid="rep-endgame-gather">
          {g.running ? `Walking your line ends: ${g.ends} of ${g.of} · ${g.games} games read · ${g.kept} kept` : g.note}
        </p>
      )}
      {list.length > 0 && (
        <div class="chips endgame-cats" role="group" aria-label="Category">
          <button type="button" class={`chip-toggle${cat === 'all' ? ' on' : ''}`} aria-pressed={cat === 'all'} onClick={() => choose('all')}>
            All <span class="storm-focus-n">{list.length}</span>
          </button>
          {CATEGORIES.map((c) => {
            const n = list.filter((r) => r.category === c.id).length;
            return (
              <button type="button" key={c.id} class={`chip-toggle${cat === c.id ? ' on' : ''}`} aria-pressed={cat === c.id} disabled={!n && cat !== c.id} onClick={() => choose(c.id)}>
                {c.title} <span class="storm-focus-n">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {ordered.length > 0 && (
        <ul class="endgame-list">
          {ordered.slice(0, all ? undefined : REP_SHOWN).map((r) => (
            <RepItem key={r.id} rep={r} standing={standings.get(r.id)!} now={props.now} />
          ))}
        </ul>
      )}
      {ordered.length > REP_SHOWN && !all && (
        <button type="button" class="link" onClick={() => setAll(true)}>
          Show all {ordered.length}
        </button>
      )}
    </section>
  );
}

/** Where a kept endgame comes from: its chapter, the line's last moves, and the game. */
function sourceText(r: RepertoireEndgame): string {
  const line = r.lines[0];
  const tail = line ? lineTail(line.path) : '';
  return `${r.names[0] ?? 'Your repertoire'}${tail ? `, ${tail}` : ''}`;
}

function RepItem(props: { rep: RepertoireEndgame; standing: Standing; now: number }) {
  const r = props.rep;
  const s = props.standing;
  const e = asEndgame(r);
  const pos = useMemo(() => positionOf(r.fen), [r.fen]);
  return (
    <li class={`endgame-item state-${s.state}`} data-endgame={r.id} data-category={r.category}>
      <a class="endgame-board" href={`#/endgames/${r.id}`} aria-label={`Play ${r.title}`} tabIndex={-1}>
        {pos && <MiniBoard position={pos} orientation={r.side} />}
      </a>
      <div class="endgame-text">
        <a class="endgame-title" href={`#/endgames/${r.id}`}>
          {r.title}
        </a>
        <span class="muted">{taskOf(e)}</span>
        <span class="muted endgame-source">{sourceText(r)}</span>
        <span class={`endgame-standing state-${s.state}`} data-testid="endgame-standing">
          {standingText(s, props.now)} <Marks marks={s.last} />
        </span>
        <button type="button" class="link endgame-remove" title="Take it off the list: its tries stay counted" onClick={() => void removeRepEndgame(r.id)}>
          Remove
        </button>
      </div>
    </li>
  );
}

/** A repertoire endgame's drill: where it comes from, and the score it started with. */
function RepSource(props: { rep: RepertoireEndgame }) {
  const r = props.rep;
  const g = r.game;
  const players = g.white && g.black ? `${g.white}–${g.black}` : '';
  const score = (r.cp >= 0 ? '+' : '') + (r.cp / 100).toFixed(2);
  return (
    <p class="muted endgame-source" data-testid="endgame-source">
      From {sourceText(r)}: {players ? `${players}, ` : ''}move {g.move}, {Math.round(g.ply / 2)} moves after your line’s end{r.san ? ` (after ${r.san})` : ''}. Stockfish at the start: {score}.
      {g.id && (
        <>
          {' '}
          <a href={`https://lichess.org/${g.id}`} target="_blank" rel="noopener noreferrer">
            The game
          </a>
        </>
      )}
    </p>
  );
}

function RepNextButton(props: { after: string; primary: boolean }) {
  const list = repEndgames.value ?? [];
  const r = list.find((x) => x.id === props.after);
  const among = r ? list.filter((x) => x.category === r.category) : list;
  const next = nextEndgame(repStandings(decidingNow()), props.after, among) ?? nextEndgame(repStandings(decidingNow()), props.after, list);
  if (!next)
    return (
      <a class="button secondary" href="#/endgames">
        All endgames
      </a>
    );
  return (
    <button type="button" class={props.primary ? 'primary' : 'secondary'} onClick={() => (leavePractice(), open({ name: 'endgames', id: next.id }))}>
      Next: {next.title}
    </button>
  );
}

/* ------------------------------------------------------------------ the courses' endgames (§5.175) */

const GROUP_KEY = 'repworks-endgames-course-group';
function readGroup(): string {
  try {
    return localStorage.getItem(GROUP_KEY) ?? '';
  } catch {
    return '';
  }
}

function CourseEndgames(props: { now: number }) {
  const version = dataVersion.value;
  useEffect(() => {
    void loadCourse();
    void readSearchChapters();
  }, [version]);
  const [chosen, setChosen] = useState(readGroup);
  const [all, setAll] = useState(false);
  const cands = courseCandidates.value;
  const scores = courseScores.value;
  const scoring = courseScoring.value;
  if (!scores || !cands.length) return null;
  const state = courseNow.value;
  const groups = groupsOf(state.drills);
  const group = groups.some((g) => g.group === chosen) ? chosen : '';
  const standings = courseStandings(props.now);
  const stateOf = (d: CourseDrill) => standings.get(d.id)?.state ?? 'new';
  const shown = group ? state.drills.filter((d) => d.cand.group === group) : state.drills;
  const ordered = [...shown].sort((a, b) => STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)]);
  const next = nextEndgame(standings, undefined, shown);
  const due = shown.filter((d) => stateOf(d) === 'due').length;
  const fresh = shown.filter((d) => stateOf(d) === 'new').length;
  const choose = (g: string) => {
    setChosen(g);
    setAll(false);
    try {
      localStorage.setItem(GROUP_KEY, g);
    } catch {
      // Not kept: the choice is a convenience.
    }
  };
  const left = cands.filter((c) => scores.get(c.key) && !scores.get(c.key)!.drill);
  return (
    <section class="card endgame-group endgame-courses" aria-labelledby="endgame-group-courses" data-testid="endgame-courses">
      <h2 id="endgame-group-courses">From your courses</h2>
      <p class="muted">
        The chapters of your reference studies that start from a position ({cands.length} here), played the way endgames are played here: against Maia’s defence, every move judged by
        Stockfish for a goal, any move that keeps it allowed, not the course’s one line. Where Stockfish has the side to move +3 or better, win it ({CONVERT_LEAD} points up, a pawn
        queened or mate); about level (−1 to +1.5), hold it for {REP.hold} moves. Where that side is the worse one, the course’s first move is played for you and you have the other. The
        course’s own text for the chapter is under the board.
      </p>
      <div class="actions">
        {scoring?.running ? (
          <button type="button" class="secondary" onClick={stopCourseScoring}>
            Stop
          </button>
        ) : (
          state.todo.length > 0 && (
            <button type="button" class={state.drills.length ? 'secondary' : 'primary'} onClick={() => void scoreCourse()} title="Stockfish scores each chapter’s position on this device, a few seconds each; stopped, it picks up where it left off">
              {state.drills.length || left.length ? 'Score the rest' : 'Score the course'} ({state.todo.length})
            </button>
          )
        )}
        {next && (
          <a class="button primary" href={`#/endgames/${next.id}`} data-testid="course-next">
            {stateOf(next) === 'due' ? 'Next due' : 'Next new'}: {next.cand.title}
          </a>
        )}
        <span class="muted" data-testid="course-counts">
          {shown.length} drill{shown.length === 1 ? '' : 's'} · {due} due · {fresh} new
          {left.length > 0 && ` · ${left.length} with no goal`}
          {state.todo.length > 0 && ` · ${state.todo.length} to score`}
        </span>
      </div>
      {scoring && (
        <p class="muted" role="status" data-testid="course-scoring">
          {scoring.running ? `Scoring: ${scoring.done} of ${scoring.of} chapters · ${scoring.kept} drills` : scoring.note}
        </p>
      )}
      {groups.length > 0 && (
        <div class="chips endgame-cats" role="group" aria-label="Course group">
          <button type="button" class={`chip-toggle${group === '' ? ' on' : ''}`} aria-pressed={group === ''} onClick={() => choose('')}>
            All <span class="storm-focus-n">{state.drills.length}</span>
          </button>
          {groups.map((g) => (
            <button type="button" key={g.group} class={`chip-toggle${group === g.group ? ' on' : ''}`} aria-pressed={group === g.group} onClick={() => choose(g.group)}>
              {g.group} <span class="storm-focus-n">{g.n}</span>
            </button>
          ))}
        </div>
      )}
      {ordered.length > 0 && (
        <ul class="endgame-list">
          {ordered.slice(0, all ? undefined : REP_SHOWN).map((d) => (
            <CourseItem key={d.id} drill={d} standing={standings.get(d.id)!} now={props.now} />
          ))}
        </ul>
      )}
      {ordered.length > REP_SHOWN && !all && (
        <button type="button" class="link" onClick={() => setAll(true)}>
          Show all {ordered.length}
        </button>
      )}
      {(left.length > 0 || state.removed > 0) && (
        <details class="endgame-left">
          <summary>
            {left.length} without a goal{state.removed > 0 ? ` · ${state.removed} removed` : ''}
          </summary>
          {state.removed > 0 && (
            <button type="button" class="link" onClick={() => void restoreCourseDrills()}>
              Put the {state.removed} removed back
            </button>
          )}
          <ul class="endgame-left-list">
            {left.map((c) => (
              <li key={c.id}>
                <a href={`#/study/${c.sid}/${c.cid}`}>{c.title}</a> <span class="muted">· {scores.get(c.key)?.why}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CourseItem(props: { drill: CourseDrill; standing: Standing; now: number }) {
  const d = props.drill;
  const s = props.standing;
  const e = asCourseEndgame(d);
  const pos = useMemo(() => positionOf(d.fen), [d.fen]);
  return (
    <li class={`endgame-item state-${s.state}`} data-endgame={d.id} data-group={d.cand.group}>
      <a class="endgame-board" href={`#/endgames/${d.id}`} aria-label={`Play ${d.cand.title}`} tabIndex={-1}>
        {pos && <MiniBoard position={pos} orientation={d.side} />}
      </a>
      <div class="endgame-text">
        <a class="endgame-title" href={`#/endgames/${d.id}`}>
          {d.cand.title}
        </a>
        <span class="muted">{taskOf(e)}</span>
        <span class="muted endgame-source">
          {d.cand.group}
          {d.flipped ? ` · after the course’s ${d.flipped}` : ''}
        </span>
        <span class={`endgame-standing state-${s.state}`} data-testid="endgame-standing">
          {standingText(s, props.now)} <Marks marks={s.last} />
        </span>
        <button type="button" class="link endgame-remove" title="Take it off the list: its tries stay counted" onClick={() => void removeCourseDrill(d.id)}>
          Remove
        </button>
      </div>
    </li>
  );
}

/** A course drill's source: the chapter, the first move played for the user, the score, and the chapter itself. */
function CourseSource(props: { course: CourseDrill }) {
  const d = props.course;
  const cp = d.score.drill?.cp ?? d.score.cp;
  const score = (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
  return (
    <p class="muted endgame-source" data-testid="endgame-source">
      From {d.cand.study}, {d.cand.group}: {d.cand.title}.
      {d.flipped ? ` The side to move there is the worse one: the course’s first move, ${d.flipped}, is played for you, and you have the other side.` : ''} Stockfish at the start: {score}.{' '}
      <a href={`#/study/${d.cand.sid}/${d.cand.cid}`}>Open the chapter</a>
    </p>
  );
}

/** The course's own text for the chapter, its comments along the main line with their moves; open once the try is over. */
function CourseText(props: { course: CourseDrill; over: boolean }) {
  const d = props.course;
  const chapter = searchChapters.value?.find((c) => c.sid === d.cand.sid && c.cid === d.cand.cid)?.chapter;
  const notes = useMemo(() => (chapter ? courseText(chapter) : []), [chapter]);
  return (
    <details class="endgame-method course-text" open={props.over} data-testid="course-text">
      <summary>The course’s text{notes.length ? '' : ': none for this chapter'}</summary>
      {notes.map((n) => (
        <div key={n.label + n.path.join(' ')} class="course-note">
          <span class="course-move">{n.label}</span>
          {n.texts.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      ))}
    </details>
  );
}

function CourseNextButton(props: { after: string; primary: boolean }) {
  const list = courseNow.value.drills;
  const d = list.find((x) => x.id === props.after);
  const among = d ? list.filter((x) => x.cand.group === d.cand.group) : list;
  const standings = courseStandings(decidingNow());
  const next = nextEndgame(standings, props.after, among) ?? nextEndgame(standings, props.after, list);
  if (!next)
    return (
      <a class="button secondary" href="#/endgames">
        All endgames
      </a>
    );
  return (
    <button type="button" class={props.primary ? 'primary' : 'secondary'} onClick={() => (leavePractice(), open({ name: 'endgames', id: next.id }))}>
      Next: {next.cand.title}
    </button>
  );
}

/* ------------------------------------------------------------------ one endgame, played */

const GOAL_WORD = { win: 'the win', draw: 'the draw' } as const;

function EndgameDrill(props: { endgame: Endgame; rep?: RepertoireEndgame; course?: CourseDrill }) {
  const e = props.endgame;
  // Come back to from the analysis board: the try played on where it was left.
  const [entry] = useState(entryKey);
  const [resumed] = useState(() => takeUpPractice(entry));
  const standing = (props.rep ? repStandings(decidingNow()) : props.course ? courseStandings(decidingNow()) : endgameStandings(decidingNow())).get(e.id);
  // A repertoire endgame's technique is general: folded, its source open instead.
  const [method, setMethod] = useState(!props.rep && !props.course && standing?.state === 'new');
  useEffect(() => {
    if (!resumed || practice.peek()?.setup.endgame?.id !== e.id) startEndgame(e);
    return () => parkPractice(entry);
  }, []);
  const p = practice.value?.setup.endgame?.id === e.id ? practice.value : undefined;
  useWakeLock(!!p && p.phase !== 'over');
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = (ev.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      const q = practice.peek();
      if (!q || q.setup.kind !== 'endgame') return;
      if (ev.key === 'h') void practiceHint();
      else if (ev.key === 'Backspace' && canTakeBack(q)) takeBack();
      else return;
      ev.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="games endgame">
      <div class="chapter-head">
        <Back parent={{ name: 'endgames' }} />
        <div class="titles">
          <span class="study-title">
            {props.rep ? `${categoryById(props.rep.category)?.title ?? 'Endgame'} · ${e.title}` : props.course ? `${props.course.cand.group} · ${e.title}` : `Endgame · ${e.title}`}
          </span>
        </div>
      </div>
      {p ? <EndgameGame game={p} endgame={e} rep={props.rep} course={props.course} method={method} onMethod={setMethod} /> : <p class="muted">Setting up…</p>}
    </div>
  );
}

function EndgameGame(props: { game: PracticeGame; endgame: Endgame; rep?: RepertoireEndgame | undefined; course?: CourseDrill | undefined; method: boolean; onMethod(on: boolean): void }) {
  const p = props.game;
  const e = props.endgame;
  const over = p.phase === 'over';
  const slip = !over ? p.slip : undefined;
  const slipped = slip ? p.moves[slip.at] : undefined;
  // Each move is judged while the game goes on: a slip found after the user played on puts the board back on it.
  const last = slipped ?? p.moves[p.moves.length - 1];
  const fen = last ? last.fen : e.fen;
  const playedPast = !!slip && slip.at < p.moves.length - 1;
  const userMoves = p.moves.filter((m) => m.isUser).length;
  const hint = p.hint?.fen === fen && p.hint.uci ? p.hint : undefined;
  const arrows = hint ? [{ orig: hint.uci!.slice(0, 2), ...(hint.level === 2 ? { dest: hint.uci!.slice(2, 4) } : {}), brush: 'blue' }] : [];
  const slippedPos = slipped && positionOf(slipped.fen);
  const stalemate = slippedPos?.isStalemate();
  // In a long mate, the fifty-move rule draws a win that takes too long: Stockfish sees it coming.
  const fiftyNear = !stalemate && e.goal === 'win' && (slippedPos?.halfmoves ?? 0) >= 70;
  const halfmoves = positionOf(fen)?.halfmoves ?? 0;
  const fiftyLeft = e.goal === 'win' && !over && halfmoves >= 60 ? Math.ceil((100 - halfmoves) / 2) : undefined;
  const feedback = over
    ? endText(p, e)
    : slip
      ? `${slipped?.san ?? 'That move'} ${e.goal === 'win' ? 'lets the win slip' : 'loses the draw'}${stalemate ? ': stalemate' : fiftyNear ? ': the fifty-move rule comes first' : ''}. Take it back and find a better move.`
      : p.ending
        ? 'Checking your moves…'
        : p.phase === 'user'
          ? hint
            ? 'Your move: the hint is on the board'
            : 'Your move'
          : `${endgameMaiaHere.value ? 'Maia' : 'Stockfish'} is thinking…`;
  const solved = over && p.end && solvedBy(e.goal, p.end.result);
  const restart = () => {
    // Started again before the end: the try so far is given up (Stop counts it as missed).
    if (!over && userMoves > 0) stopPractice();
    startEndgame(e);
  };
  return (
    <div class="train-grid practice-game endgame-game" data-phase={over ? 'over' : slip ? 'slip' : p.ending ? 'ending' : p.phase} data-moves={p.moves.length} data-premove={p.premove ? p.premove.from + p.premove.to : ''} data-testid="endgame-game">
      <MoveBoard fen={fen} orientation={p.setup.color} movable={p.phase === 'user' && !slip && !p.ending} lastUci={last?.uci} arrows={arrows} onMove={(u) => void practiceMove(u)} premove={gamePremove(p)} mirror />
      <div class="train-panel">
        <p class="train-counters">
          {taskOf(e)}
          {e.goal === 'draw' ? ` · held ${Math.min(userMoves, e.hold ?? 0)} of ${e.hold}` : userMoves ? ` · ${userMoves} move${userMoves === 1 ? '' : 's'}` : ''}
          {fiftyLeft !== undefined && <span class="endgame-fifty"> · fifty-move rule: {fiftyLeft} left</span>}
        </p>
        <p class={`feedback train-feedback${slip ? ' endgame-slip' : over ? (solved ? ' endgame-solved' : ' endgame-missed') : ''}`} role="status" data-testid="endgame-feedback">
          {feedback}
        </p>
        {playedPast && (
          <p class="muted" data-testid="endgame-slip-later">
            Found after you had played on: the board is back on that move, and Take back takes the moves after it too.
          </p>
        )}
        <BoardNote />
        {over && <p class="muted" data-testid="endgame-counted">{countedText(p, e)}</p>}
        {!over && p.failed && !slip && <p class="muted">This try counts as missed: play it out, or start again.</p>}
        <MoveList moves={p.moves} baseFen={e.fen} marks={false} slipAt={slip?.at} />
        <div class="actions train-actions">
          {slip ? (
            <>
              <button type="button" class="primary" data-testid="endgame-takeback" onClick={takeBack}>
                Take back
              </button>
              {slip.uci && (
                <button type="button" class="secondary" title={`Take it back, with the move that keeps ${GOAL_WORD[e.goal]} shown`} onClick={showSlipMove}>
                  Show a move that keeps it
                </button>
              )}
              <button type="button" class="secondary" title="Play on from here: the try is missed already" onClick={playOnAfterSlip}>
                Play on
              </button>
            </>
          ) : over ? (
            <>
              <button type="button" class={solved ? 'secondary' : 'primary'} onClick={() => startEndgame(e)}>
                Again
              </button>
              {props.rep ? <RepNextButton after={e.id} primary={!!solved} /> : props.course ? <CourseNextButton after={e.id} primary={!!solved} /> : <NextButton after={e.id} primary={!!solved} />}
            </>
          ) : (
            <>
              <button type="button" class="secondary" title="Stockfish’s move: the piece, then the move (H). The try counts as missed." disabled={p.phase !== 'user' || hint?.level === 2} onClick={() => void practiceHint()}>
                Hint
              </button>
              {canTakeBack(p) && (
                <button type="button" class="secondary" title="Your last move taken back, with the answer: a misclick, say (Backspace)" onClick={takeBack}>
                  Take back
                </button>
              )}
              <button type="button" class="secondary" title="From the start again: a try begun counts as missed" onClick={restart}>
                Restart
              </button>
            </>
          )}
          <button type="button" class="secondary" title="The analysis board at this position; ← comes back here" onClick={() => analyseFrom({ fen: e.fen, ...(p.moves.length ? { line: p.moves.slice(0, slip ? slip.at + 1 : undefined).map((m) => m.san) } : {}), side: p.setup.color })}>
            Analyse
          </button>
        </div>
        {props.rep && <RepSource rep={props.rep} />}
        {props.course && <CourseSource course={props.course} />}
        {props.course ? (
          <CourseText course={props.course} over={over} />
        ) : (
          <details class="endgame-method" open={props.method} onToggle={(ev) => props.onMethod((ev.target as HTMLDetailsElement).open)}>
            <summary>{props.rep ? `Technique: ${categoryById(props.rep.category)?.title ?? 'endgames'}` : 'The method'}</summary>
            <p>{e.idea}</p>
          </details>
        )}
      </div>
    </div>
  );
}

function NextButton(props: { after: string; primary: boolean }) {
  const next = nextEndgame(endgameStandings(decidingNow()), props.after);
  if (!next)
    return (
      <a class="button secondary" href="#/endgames">
        All endgames
      </a>
    );
  return (
    <button type="button" class={props.primary ? 'primary' : 'secondary'} onClick={() => (leavePractice(), open({ name: 'endgames', id: next.id }))}>
      Next: {next.title}
    </button>
  );
}

/** The end in words: how the goal was reached, or how it was missed. */
function endText(p: PracticeGame, e: Endgame): string {
  const end = p.end!;
  const n = p.moves.filter((m) => m.isUser).length;
  switch (end.reason) {
    case 'mate':
      return `Checkmate in ${n} move${n === 1 ? '' : 's'}.`;
    case 'goal':
      if (e.goal === 'draw') return `Held for ${n} moves: the draw is safe.`;
      if (e.until === 'bare') return bareText(e, p);
      if (e.until === 'convert' && p.moves.at(-1)?.uci.length !== 5) return `${CONVERT_LEAD} points of material ahead: the win is home.`;
      return 'The pawn queens: the win is yours.';
    case 'stalemate':
      return e.goal === 'draw' ? 'Stalemate: the draw is yours.' : 'Stalemate: the win is gone.';
    case 'draw':
      return e.goal === 'draw' ? 'Not enough material left to mate: a draw.' : 'Not enough material left to mate: the win is gone.';
    case 'repetition':
      return e.goal === 'draw' ? 'Threefold repetition: the draw is yours.' : 'Threefold repetition: the win is gone.';
    case 'fifty':
      return e.goal === 'draw' ? 'Fifty moves without a capture or a pawn move: a draw.' : 'Fifty moves without a capture or a pawn move: the win is gone.';
    case 'mated':
      return 'Checkmated.';
    case 'stopped':
      return 'Given up.';
    case 'interrupted':
      return 'Stockfish couldn’t answer: nothing counted.';
    default:
      return 'Over.';
  }
}

/** A bare king reached: "The pawn has fallen: the rest is a queen mate." */
function bareText(e: Endgame, p: PracticeGame): string {
  const target = bareTarget(e);
  const fallen = `${target[0]!.toUpperCase()}${target.slice(1)} ${target === 'the pawns' ? 'have' : 'has'} fallen`;
  const board = positionOf(p.moves.at(-1)?.fen ?? e.fen)?.board;
  const mine = board?.[p.setup.color];
  const piece = mine && board ? (mine.intersect(board.queen).nonEmpty() ? 'queen' : mine.intersect(board.rook).nonEmpty() ? 'rook' : undefined) : undefined;
  return piece ? `${fallen}: the rest is a ${piece} mate.` : `${fallen}: the win is yours.`;
}

/** "3.Kd2", "3…Kd7": a move with its number, from the position before it. */
function numbered(fenBefore: string, san: string): string {
  const [, turn, , , , n] = fenBefore.split(' ');
  return `${n ?? 1}${turn === 'b' ? '…' : '.'}${san}`;
}

/** What the try counted for, and its first slip when it had one. */
function countedText(p: PracticeGame, e: Endgame): string {
  if (p.end?.reason === 'interrupted') return '';
  const solved = solvedBy(e.goal, p.end!.result);
  const m = p.missed;
  if (p.failed && m) {
    const keep = m.keep ? ` (${numbered(m.fenBefore, m.keep)} kept ${GOAL_WORD[e.goal]})` : '';
    return `${solved ? 'Reached after a take-back' : 'The try counts as missed'}: the first slip was ${numbered(m.fenBefore, m.san)}${keep}.${solved ? ' The try counts as missed.' : ''}`;
  }
  if (p.failed) return solved ? 'Reached after a hint or a take-back: the try counts as missed.' : 'The try counts as missed.';
  return solved ? 'Solved first time: it comes back in a while.' : 'The try counts as missed: it stays due.';
}

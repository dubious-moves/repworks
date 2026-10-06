// Repertoire coverage (PLAN.md §5.26), lichessable's section 21 on studies: a reference study's
// lines walked against the repertoire's chapters of one side, the gaps grouped by where they
// leave it, ranked by how often Lichess's games (the explorer's filter) reach them, each opening
// the course at its divergence, and its lines added to a repertoire chapter that reaches it.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Color } from 'chessops/types';
import { addGap, askCounts, readStudies, undoAdd, type Added } from '../app/coverage.ts';
import { prefs } from '../app/explorer.ts';
import { logInWithLichess } from '../app/lichess.ts';
import { open } from '../app/mode.ts';
import { dataVersion } from '../app/sync.ts';
import type { PositionKey } from '../core/chess/positionKey.ts';
import { coverage, positionsToRank, rank, RANK_DEFAULTS, repertoireTree, sideOf, sortGaps, type Gap, type Place, type Severity } from '../core/explorer/coverage.ts';
import { localAddress, type CompactExplorer } from '../core/explorer/providers.ts';
import type { LookupError } from '../core/explorer/service.ts';
import type { StudyChapters } from '../core/repertoire/files.ts';
import { header } from '../core/study/model.ts';
import { startPosition } from '../core/study/tree.ts';
import { movesFrom } from './LineList.tsx';

const SEVERITY: Record<Severity, { label: string; help: string }> = {
  hole: { label: 'Hole', help: 'Your move, and the repertoire has none here' },
  ends: { label: 'Line ends', help: 'The repertoire’s line stops here: whatever is played, your next move isn’t prepared' },
  unmet: { label: 'Unmet', help: 'The repertoire answers other moves here, not this one' },
  unreachable: { label: 'Not reached', help: 'The repertoire never reaches this line’s start: it can’t be ranked' },
  alternative: { label: 'Alternative', help: 'The repertoire plays another move here: a choice, not a gap' },
};

const pct = (x: number | undefined) => (x === undefined ? '—' : x >= 0.1 ? `${Math.round(x * 100)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : '<0.1%');

export function CoverageView(props: { sid: string }) {
  const [studies, setStudies] = useState<StudyChapters[] | undefined>(undefined);
  const version = dataVersion.value;
  useEffect(() => {
    void readStudies().then(setStudies);
  }, [version]);
  if (!studies) return <p class="muted">Reading the studies…</p>;
  const here = studies.find((s) => s.sid === props.sid);
  if (!here) return <p class="warn">That study isn’t on this device.</p>;
  return <Report here={here} studies={studies} />;
}

function Report(props: { here: StudyChapters; studies: StudyChapters[] }) {
  const { here, studies } = props;
  const references = studies.filter((s) => s.kind === 'reference');
  const repertoires = studies.filter((s) => s.kind === 'repertoire');
  // Opened from a reference study: it against the whole repertoire; from a repertoire study: it
  // against the first reference study.
  const [course, setCourse] = useState(here.kind === 'reference' ? here.sid : (references[0]?.sid ?? ''));
  const [target, setTarget] = useState(here.kind === 'repertoire' ? here.sid : 'all');
  const source = studies.find((s) => s.sid === course);
  const majority = (s: StudyChapters | undefined): Color => (s && s.chapters.filter((c) => sideOf(c) === 'black').length > s.chapters.length / 2 ? 'black' : 'white');
  const [side, setSide] = useState<Color>(majority(source));
  useEffect(() => setSide(majority(source)), [course]);
  const [by, setBy] = useState<'score' | 'depth' | 'severity'>('score');
  // Lines added from here, newest first, each with its undo: the gap itself goes once covered.
  const [added, setAdded] = useState<{ what: string; value: Added; error?: string }[]>([]);
  const undo = async (i: number) => {
    const a = added[i]!;
    const done = await undoAdd(a.value);
    setAdded(done.ok ? added.filter((_, j) => j !== i) : added.map((x, j) => (j === i ? { ...x, error: done.error } : x)));
  };
  const [depth, setDepth] = useState(RANK_DEFAULTS.depth);

  // The repertoire of that side: every repertoire study's chapters, or one study's.
  const tree = useMemo(
    () => repertoireTree(repertoires.filter((s) => target === 'all' || s.sid === target).flatMap((s) => s.chapters.filter((c) => sideOf(c) === side).map((chapter) => ({ sid: s.sid, chapter })))),
    [studies, target, side],
  );
  const report = useMemo(() => (source ? coverage(source.chapters, tree, side) : undefined), [source, tree, side]);

  // The ranking's explorer answers, asked through the worker once the report is there.
  const [answers, setAnswers] = useState<Map<PositionKey, CompactExplorer>>(new Map());
  const [asking, setAsking] = useState<{ answered: number; total: number; error?: LookupError; done: boolean } | undefined>(undefined);
  const need = useMemo(() => (report ? positionsToRank(report) : new Map<PositionKey, string>()), [report]);
  useEffect(() => {
    if (!need.size) return setAsking(undefined);
    const run = askCounts(need, (answered, total) => setAsking({ answered, total, done: false }));
    void run.done.then(({ answers: got, error }) => {
      setAnswers(got);
      setAsking({ answered: got.size, total: need.size, done: true, ...(error ? { error } : {}) });
    });
    return run.cancel;
  }, [need]);
  if (report) rank(report, answers, { ...RANK_DEFAULTS, depth });

  const studyName = (sid: string) => studies.find((s) => s.sid === sid)?.name ?? sid;
  const chapterOf = (sid: string, cid: string) => studies.find((s) => s.sid === sid)?.chapters.find((c) => c.id === cid);
  const chapterName = (sid: string, cid: string) => {
    const c = chapterOf(sid, cid);
    return c ? (header(c, 'ChapterName') ?? cid) : cid;
  };
  const gaps = report ? sortGaps(report.gaps.filter((g) => g.severity !== 'alternative'), by) : [];
  const alternatives = report ? report.gaps.filter((g) => g.severity === 'alternative') : [];
  const missing = gaps.reduce((n, g) => n + g.lines.length, 0);
  const source_ = localAddress(prefs.peek().local) ? 'the local explorer' : 'Lichess';

  return (
    <div class="coverage">
      <div class="chapter-head">
        <a href="#/" class="back" onClick={(e) => (e.preventDefault(), open({ name: 'chapter', sid: here.sid }))}>
          ←
        </a>
        <div class="titles">
          <span class="study-title">Coverage · {here.name}</span>
        </div>
      </div>
      <section class="card coverage-form" aria-label="Compare">
        {references.length === 0 ? (
          <p class="muted">No reference study to compare: import a course as a reference study first.</p>
        ) : (
          <div class="coverage-choices">
            <label>
              Lines of
              <select name="course" value={course} onChange={(e) => setCourse(e.currentTarget.value)}>
                {references.map((s) => (
                  <option key={s.sid} value={s.sid}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Against
              <select name="target" value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
                <option value="all">The whole repertoire</option>
                {repertoires.map((s) => (
                  <option key={s.sid} value={s.sid}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              For
              <select name="side" value={side} onChange={(e) => setSide(e.currentTarget.value as Color)}>
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </label>
          </div>
        )}
      </section>
      {report && source && (
        <section class="card" aria-label="Coverage report">
          <h2 class="coverage-summary">
            {report.lines} line{report.lines === 1 ? '' : 's'} · {report.present} present · {missing} missing in {gaps.length} place{gaps.length === 1 ? '' : 's'}
            {alternatives.length > 0 && <> · {alternatives.length} where you play another move</>}
          </h2>
          {report.otherSide > 0 && (
            <p class="warn">
              {report.otherSide} of these lines are in chapters for {side === 'white' ? 'Black' : 'White'}: compared all the same, but their ranking means little.
            </p>
          )}
          {report.unreadable.length > 0 && <p class="muted">Left out: {report.unreadable.map((u) => `${chapterName(source.sid, u.cid)} (${u.reason})`).join(', ')}.</p>}
          <RankingStatus asking={asking} source={source_} />
          {added.length > 0 && (
            <ul class="coverage-added" aria-label="Added">
              {added.map((a, i) => (
                <li key={`${a.value.sid}/${a.value.cid}/${a.what}`} role="status">
                  Added {a.what} to {chapterName(a.value.sid, a.value.cid)}.{' '}
                  <button type="button" class="secondary" onClick={() => open({ name: 'chapter', sid: a.value.sid, cid: a.value.cid, at: a.value.path })}>
                    Open
                  </button>{' '}
                  <button type="button" class="secondary" onClick={() => void undo(i)}>
                    Undo
                  </button>
                  {a.error && <span class="warn"> {a.error}</span>}
                </li>
              ))}
            </ul>
          )}
          {gaps.length > 0 && (
            <div class="coverage-tools">
              <label>
                Sort
                <select name="sort" value={by} onChange={(e) => setBy(e.currentTarget.value as typeof by)}>
                  <option value="score">By score (likely, and early)</option>
                  <option value="depth">By depth</option>
                  <option value="severity">By kind</option>
                </select>
              </label>
              <label title="score = P from the root × exp(−ply / D)">
                Depth discount D
                <input type="number" name="depth" min={1} max={100} step={1} value={depth} onInput={(e) => Number(e.currentTarget.value) >= 1 && setDepth(Number(e.currentTarget.value))} />
              </label>
            </div>
          )}
          <ol class="coverage-gaps">
            {gaps.map((g) => (
              <GapRow
                key={g.key}
                gap={g}
                course={source}
                places={tree.places.get(g.before) ?? []}
                studyName={studyName}
                chapterName={chapterName}
                onAdded={(what, value) => setAdded([{ what, value }, ...added])}
              />
            ))}
          </ol>
          {alternatives.length > 0 && (
            <details>
              <summary>Where you play another move ({alternatives.length})</summary>
              <ul class="coverage-alternatives">
                {alternatives.map((g) => (
                  <li key={g.key}>
                    <Moves gap={g} course={source} /> <span class="muted">· {g.lines.length} line{g.lines.length === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

function RankingStatus(props: { asking: { answered: number; total: number; error?: LookupError; done: boolean } | undefined; source: string }) {
  const a = props.asking;
  if (!a) return null;
  if (a.error?.login) {
    return (
      <div class="explorer-note" role="status">
        <p>Ranking asks {props.source} how often each line is met: {a.error.message}</p>
        <button type="button" onClick={() => void logInWithLichess(location.hash)}>
          Log in with Lichess
        </button>
      </div>
    );
  }
  if (a.error) return <p class="warn">Some positions couldn’t be asked: {a.error.message} Those gaps are marked ~ and ranked on what was found.</p>;
  if (!a.done) return <p class="muted" role="status">Asking {props.source}… {a.answered}/{a.total} positions</p>;
  return (
    <p class="muted">
      Ranked by {props.source}’s games at the explorer’s filter: P is how often a game from the study’s first moves reaches the gap (~: a position with under 50 games ended the count).
    </p>
  );
}

/** The moves to the divergence, numbered from the course chapter's start, the divergence move bold. */
function Moves(props: { gap: Gap; course: StudyChapters }) {
  const { gap, course } = props;
  const c = course.chapters.find((x) => x.id === gap.cid);
  const start = c ? startPosition(c) : undefined;
  // The path's moves numbered as the whole line's, so a Black move after them needs no "2...".
  const before = movesFrom(start, gap.path, 0);
  const last = movesFrom(start, [...gap.path, gap.san], 0).slice(before.length).trim();
  return (
    <span class="coverage-moves">
      {before && <>{before} </>}
      <strong>{last}</strong>
    </span>
  );
}

function GapRow(props: { gap: Gap; course: StudyChapters; places: Place[]; studyName(sid: string): string; chapterName(sid: string, cid: string): string; onAdded(what: string, added: Added): void }) {
  const { gap, course, studyName, chapterName } = props;
  // One place per chapter: the first, the shallowest by construction of the walk.
  const places = props.places.filter((p, i, all) => all.findIndex((q) => q.sid === p.sid && q.cid === p.cid) === i);
  const [into, setInto] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const s = SEVERITY[gap.severity];
  const canAdd = gap.severity !== 'unreachable' && places.length > 0;
  const add = async () => {
    const place = places[into];
    if (!place) return;
    const done = await addGap(gap, place);
    if (!done.ok) return setError(done.error);
    setError(undefined);
    const c = course.chapters.find((x) => x.id === gap.cid);
    props.onAdded(movesFrom(c ? startPosition(c) : undefined, [...gap.path, gap.san], gap.path.length) + (gap.lines.length > 1 ? ` (${gap.lines.length} lines)` : ''), done.value);
  };
  return (
    <li class={`coverage-gap sev-${gap.severity}`}>
      <div class="coverage-gap-head">
        <span class={`coverage-sev sev-${gap.severity}`} title={s.help}>
          {s.label}
        </span>
        <a href={`#/study/${course.sid}/${gap.cid}?at=${[...gap.path, gap.san].map(encodeURIComponent).join(',')}`} title="Open the course here">
          <Moves gap={gap} course={course} />
        </a>
        <span class="muted">
          {' '}
          · {gap.lines.length} line{gap.lines.length === 1 ? '' : 's'}
        </span>
      </div>
      <p class="coverage-figures muted">
        {gap.severity === 'unreachable' ? (
          s.help
        ) : (
          <>
            <span title="Of the games reaching the study’s first moves">P {pct(gap.pCond)}</span>
            {gap.truncated ? '~' : ''} · <span title="Of all games at the filter">{pct(gap.p)} of games</span> · ply {gap.at + 1} · score {gap.score === undefined ? '—' : gap.score.toFixed(3)}
          </>
        )}
      </p>
      {canAdd && (
        <div class="coverage-add">
          {places.length > 1 ? (
            <select name="into" aria-label="Add to chapter" value={into} onChange={(e) => setInto(Number(e.currentTarget.value))}>
              {places.map((p, i) => (
                <option key={`${p.sid}/${p.cid}`} value={i}>
                  {studyName(p.sid)} · {chapterName(p.sid, p.cid)}
                </option>
              ))}
            </select>
          ) : (
            <span class="muted">
              {studyName(places[0]!.sid)} · {chapterName(places[0]!.sid, places[0]!.cid)}
            </span>
          )}
          <button type="button" onClick={() => void add()}>
            Add {gap.lines.length === 1 ? 'the line' : `the ${gap.lines.length} lines`}
          </button>
        </div>
      )}
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

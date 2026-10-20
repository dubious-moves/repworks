// Idea cards' session (PLAN.md §5.128): today's cards of every idea deck, or of one study from its
// Train button. A card asks its question at its position, turned to the deck's side; a move
// answers it (right the first time Good, wrong Again), or Show turns it over and the owner grades
// it. Its back is the chapter read through (the Read view's body): the explanation and its
// arrows, the main line stepped or played at the pace, and the side lines at each move as a
// comment's lines. A new card is shown first, then asked. Keys: Space or Enter for Show, Ask me
// and Next; 1–4 for a grade; ← → through the line.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { chessgroundDests } from 'chessops/compat';
import { normalizeMove } from 'chessops/chess';
import { isNormal, type Role } from 'chessops/types';
import { parseSquare } from 'chessops/util';
import type { Key } from '@lichess-org/chessground/types';
import { askIdeaNow, beginIdeas, gradeIdeaNow, ideaSession, ideasReady, nextIdeaNow, playIdeaMove, removeIdeaCard, showIdeaNow, startIdeaCards } from '../app/ideas.ts';
import { analyseFrom } from '../app/mode.ts';
import { commentId, endPreview } from '../app/preview.ts';
import { studies } from '../app/state.ts';
import { pace, PACES } from '../app/train.ts';
import { sideLineText, type Idea } from '../core/ideas/cards.ts';
import { needsGrade, type IdeaRun, type IdeaSession } from '../core/ideas/session.ts';
import type { Grade } from '../core/progress/events.ts';
import { positionOf } from '../core/storm/walk.ts';
import { lineThrough } from '../core/study/tree.ts';
import { Back } from './Back.tsx';
import { Board } from './Board.tsx';
import { CommentText, endPreviewOnBoard, PreviewBar, previewBoard } from './CommentText.tsx';
import { LineReader } from './Read.tsx';
import { useWakeLock } from './Train.tsx';

const GRADE_WORD = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;

export function IdeasScreen(props: { sid?: string }) {
  const { sid } = props;
  const ready = ideasReady.value;
  const s = ideaSession.value;
  useEffect(() => startIdeaCards(), []);
  // Once a visit, when the cards are read: the session left here goes on (back from the analysis
  // board), any other starts afresh.
  const [begun, setBegun] = useState(false);
  useEffect(() => {
    if (!ready || begun) return;
    setBegun(true);
    const now = ideaSession.peek();
    if (!now?.run || now.scope !== sid) beginIdeas(sid);
  }, [ready, sid]);
  useWakeLock(!!s?.run);
  const name = sid ? studies.value.find((x) => x.id === sid)?.name : undefined;
  return (
    <div class="train ideas">
      <div class="chapter-head">
        <Back parent={sid ? { name: 'chapter', sid } : { name: 'list' }} />
        <div class="titles">
          <span class="study-title">Ideas{name ? ` · ${name}` : ''}</span>
        </div>
      </div>
      {!begun || !s ? <p class="muted">Opening…</p> : s.run ? <Card key={`${s.index}`} s={s} run={s.run} /> : <Done s={s} sid={sid} />}
    </div>
  );
}

function Done(props: { s: IdeaSession; sid?: string | undefined }) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const g of props.s.results.values()) counts[g]++;
  const n = props.s.results.size;
  return (
    <section class="card" data-testid="ideas-done">
      <h2>{props.s.steps.length ? 'Done for now' : 'No idea cards for today'}</h2>
      <p>
        {n} card{n === 1 ? '' : 's'} answered{n ? `: ${counts[4]} easy, ${counts[3]} good, ${counts[2]} hard, ${counts[1]} again` : ''}.
      </p>
      {!props.s.steps.length && <p class="muted">Idea cards are made from an idea deck’s ☰ menu: Make idea cards. New ones come up within the day’s limit (Training settings).</p>}
      <div class="actions">
        <a class="button" href="#/">
          Home
        </a>
        <button type="button" class="secondary" onClick={() => beginIdeas(props.sid)}>
          Train again
        </button>
      </div>
    </section>
  );
}

function Card(props: { s: IdeaSession; run: IdeaRun }) {
  const { s, run } = props;
  const idea = run.step.idea;
  const grading = needsGrade(run);
  // A line previewed ends with the card.
  useEffect(() => endPreview, []);
  // Space or Enter: Show, Ask me or Next; 1–4: a grade.
  const latest = useRef({ run, grading });
  latest.current = { run, grading };
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
      const { run: r, grading: g } = latest.current;
      let act: (() => void) | undefined;
      if (e.key === ' ' || e.key === 'Enter') act = r.phase === 'asking' ? showIdeaNow : r.phase === 'learn' ? askIdeaNow : g ? undefined : nextIdeaNow;
      else if (g && /^[1-4]$/.test(e.key)) act = () => gradeIdeaNow(Number(e.key) as Grade);
      if (!act) return;
      e.preventDefault();
      act();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const counter = (
    <p class="train-counters">
      {s.index + 1} of {s.steps.length} · {idea.kind}
      {run.step.isNew && !run.step.retry ? ' · new' : ''}
      {run.step.retry ? ' · again, not graded' : ''}
    </p>
  );
  const actions = (
    <>
      <a class="button secondary" href={`#/study/${idea.sid}/${idea.cid}`}>
        Open the chapter
      </a>
      {run.phase !== 'asking' && (
        <button type="button" class="secondary" title="The analysis board at the card's position" onClick={() => analyseFrom({ fen: idea.fen, side: idea.side })}>
          Analyse
        </button>
      )}
      <button type="button" class="secondary" title="Take this card out (the study’s ☰ menu makes it again)" onClick={removeIdeaCard}>
        Remove the card
      </button>
    </>
  );
  return (
    <div class="idea-card" data-testid="idea-card" data-phase={run.phase} data-card={idea.card}>
      {run.phase === 'asking' ? <Asking s={s} run={run} counter={counter} actions={actions} /> : <Answer run={run} grading={grading} counter={counter} actions={actions} />}
    </div>
  );
}

/** The question at the card's position: a move or Show. */
function Asking(props: { s: IdeaSession; run: IdeaRun; counter: ComponentChildren; actions: ComponentChildren }) {
  const { run } = props;
  const idea = run.step.idea;
  const pos = useMemo(() => positionOf(idea.fen)!, [idea.fen]);
  const [promotion, setPromotion] = useState<{ orig: Key; dest: Key } | undefined>(undefined);
  const shown = previewBoard('ideas');
  const movable = !idea.selfGraded && !shown;
  const send = (orig: Key, dest: Key, role?: Role) => {
    const move = normalizeMove(pos, { from: parseSquare(orig)!, to: parseSquare(dest)!, ...(role ? { promotion: role } : {}) });
    if (isNormal(move)) playIdeaMove(pos, move);
  };
  const onMove = (orig: Key, dest: Key) => {
    const piece = pos.board.get(parseSquare(orig)!);
    if (piece?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) return setPromotion({ orig, dest });
    send(orig, dest);
  };
  const answer = run.answer;
  return (
    <div class="train-grid">
      <div class="train-board" onPointerDown={shown ? endPreviewOnBoard : undefined}>
        <Board
          // A wrong move is taken back: the board is set again to the card's position.
          key={run.wrong.length}
          fen={shown?.fen ?? idea.fen}
          orientation={idea.side}
          turn={shown?.turn ?? pos.turn}
          dests={movable ? (chessgroundDests(pos) as Map<Key, Key[]>) : new Map()}
          lastMove={shown?.lastMove}
          check={shown?.check ?? pos.isCheck()}
          shapes={[]}
          drawMode={false}
          brush="green"
          onMove={onMove}
          promotion={promotion && { dest: promotion.dest, onPick: (role) => (setPromotion(undefined), role && send(promotion.orig, promotion.dest, role)) }}
        />
        <PreviewBar owner="ideas" />
      </div>
      <div class="train-panel">
        {props.counter}
        <p class="idea-question" data-testid="idea-question">
          {idea.question}
        </p>
        <p class="muted">{idea.selfGraded ? `${pos.turn === 'white' ? 'White' : 'Black'} is to move. Think it through, then Show.` : `Play your move, or Show.`}</p>
        {answer && answer.kind !== 'right' && (
          <div class="feedback idea-wrong" role="status" data-testid="idea-feedback">
            <p>
              <strong>{answer.san}</strong> isn’t the answer{run.graded === 1 ? ' (Again)' : ''}. Try again, or Show.
            </p>
            {answer.kind === 'side' && (
              <p>
                <CommentText text={sideLineText(pos, answer.node)} owner="ideas" id={commentId('idea-side', answer.san)} positions={() => ({ after: pos, before: undefined })} />
              </p>
            )}
          </div>
        )}
        <div class="actions">
          <button type="button" onClick={showIdeaNow}>
            Show <span class="muted">(Space)</span>
          </button>
        </div>
        <div class="actions train-actions">{props.actions}</div>
      </div>
    </div>
  );
}

/** The card's back (or a new card's first showing): the chapter read through, from its start. */
function Answer(props: { run: IdeaRun; grading: boolean; counter: ComponentChildren; actions: ComponentChildren }) {
  const { run, grading } = props;
  const idea: Idea = run.step.idea;
  const line = useMemo(() => lineThrough(idea.chapter, []) ?? [], [idea.chapter]);
  const [ply, setPly] = useState(0);
  const answer = run.answer;
  const head = (
    <>
      {props.counter}
      <h2 class="idea-name">{idea.name}</h2>
      <p class="idea-question muted">{idea.question}</p>
      {run.phase === 'back' && (
        <p class="feedback idea-result" role="status" data-testid="idea-result">
          {answer?.kind === 'right' ? (run.wrong.length ? `${answer.san}: right, after ${run.wrong.map((w) => w.san).join(', ')}.` : `${answer.san}: right.`) : run.wrong.length ? `Shown after ${run.wrong.map((w) => w.san).join(', ')}.` : 'Shown.'}
          {run.graded !== undefined && ` Recorded: ${GRADE_WORD[run.graded]}.`}
          {idea.answers.length > 0 && answer?.kind !== 'right' && ` The answer: ${idea.answers.join(' or ')}.`}
        </p>
      )}
    </>
  );
  return (
    <LineReader chapter={idea.chapter} line={line} ply={ply} onPly={setPly} onEscape={() => undefined} head={head} sideLines playMs={PACES[pace.value] * 2}>
      {run.phase === 'learn' ? (
        <button type="button" onClick={askIdeaNow}>
          Ask me <span class="muted">(Space)</span>
        </button>
      ) : grading ? (
        <div class="actions grade-row" role="group" aria-label="Grade">
          {([1, 2, 3, 4] as const).map((g) => (
            <button key={g} type="button" class={g === 1 ? 'secondary' : ''} onClick={() => gradeIdeaNow(g)}>
              {GRADE_WORD[g]} <span class="muted">({g})</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={nextIdeaNow}>
          Next <span class="muted">(Space)</span>
        </button>
      )}
      {props.actions}
    </LineReader>
  );
}

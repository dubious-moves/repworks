// The search page (PLAN.md §5.166): one box over every study on the device. A study or a chapter
// by its name, a comment by its words, and a position by moves from the start or a FEN, wherever
// a chapter reaches it. The hits come as the words are typed; the address follows them, so a hit
// opened and ← comes back to the same search.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { keepHere } from '../app/mode.ts';
import { reachOf, readSearchChapters, searchChapters } from '../app/search.ts';
import { dataVersion } from '../app/sync.ts';
import { modeHash } from '../core/app/fsm.ts';
import { search, SEARCH_LIMITS, type SearchHit } from '../core/study/search.ts';
import { Back } from './Back.tsx';

/** The fewest characters searched for: one letter is in every name. */
const LEAST = 2;
/** How long after the last key the address takes the words. */
const SETTLE_MS = 300;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `text` with the query's words marked. Accents are folded in the search but not here: those stay unmarked. */
function Marked(props: { text: string; words: readonly string[] }) {
  const parts = useMemo(() => (props.words.length ? props.text.split(new RegExp(`(${props.words.map(escape).join('|')})`, 'gi')) : [props.text]), [props.text, props.words]);
  return <>{parts.map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

const GROUPS: { kind: SearchHit['kind']; title: string }[] = [
  { kind: 'position', title: 'Position' },
  { kind: 'study', title: 'Studies' },
  { kind: 'chapter', title: 'Chapters' },
  { kind: 'comment', title: 'Comments' },
];

export function SearchScreen(props: { q: string }) {
  const version = dataVersion.value;
  useEffect(() => void readSearchChapters(), [version]);
  const [text, setText] = useState(props.q);
  /** The address's words as this box knows them: those it started with, then those it wrote. */
  const known = useRef(props.q);
  // Another search's entry (the browser's back or forward) puts its words in the box. The words
  // the box started with or wrote itself change nothing: an effect that set them again ran after
  // the first keys under load and took the typing back.
  useEffect(() => {
    if (props.q === known.current) return;
    known.current = props.q;
    setText(props.q);
  }, [props.q]);
  /** The address takes the words typed: this entry rewritten, not a new one a letter. */
  const settle = () => {
    const q = text.trim();
    if (q === props.q) return;
    known.current = q;
    keepHere(q ? { name: 'search', q } : { name: 'search' });
  };
  useEffect(() => {
    if (text.trim() === props.q) return;
    const timer = setTimeout(settle, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text, props.q]);

  const chapters = searchChapters.value;
  const query = text.trim();
  const result = useMemo(() => (chapters && query.length >= LEAST ? search(chapters, query, SEARCH_LIMITS, reachOf) : undefined), [chapters, query]);
  const asked = result?.position;
  const board = asked ? modeHash(asked.fen ? { name: 'analysis', fen: asked.fen } : { name: 'analysis', line: asked.sans ?? [] }) : undefined;

  return (
    <div class="search">
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Search</span>
        </div>
      </div>
      <section class="card">
        <input
          type="search"
          class="search-box"
          aria-label="Search the studies"
          placeholder="A name, words of a comment, moves (1.e4 c5 2.Nf3) or a FEN"
          value={text}
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          // A new search takes the keys at once; one come back to keeps the phone's keyboard down.
          autofocus={!props.q}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && settle()}
        />
        {!chapters ? (
          <p class="muted" role="status">Reading the studies…</p>
        ) : !chapters.length ? (
          <p class="muted">No studies on this device yet.</p>
        ) : !result ? (
          <p class="muted" data-testid="search-hint">
            Two letters or more. A study’s or a chapter’s name; words from a comment (all of them, in one move’s comment); moves from the start, in any order that reaches the position (1.e4 c5 2.Nf3, or e4 c5 Nf3); or a FEN.
          </p>
        ) : (
          // A hit followed before the address has caught up with the typing: the words first, so ← finds them.
          <div class="search-results" data-testid="search-results" role="status" aria-live="polite" onClickCapture={settle}>
            {asked && (
              <p class="search-position" data-testid="search-position">
                {asked.fen ? 'The position of the FEN' : <>The position after <strong>{asked.line}</strong></>}
                {result.hits.some((h) => h.kind === 'position') ? '' : ': no chapter reaches it'}
                {' · '}
                <a href={board}>Analysis board</a>
              </p>
            )}
            {!result.hits.length && !asked && <p class="muted">Nothing found for “{query}”.</p>}
            {GROUPS.map(({ kind, title }) => {
              const hits = result.hits.filter((h) => h.kind === kind);
              if (!hits.length) return null;
              const more = kind === 'study' ? 0 : result.more[kind];
              return (
                <section key={kind} class="search-group" aria-label={title}>
                  <h2>
                    {title} <span class="muted">{hits.length + more}</span>
                  </h2>
                  <ul class="search-hits">
                    {hits.map((h, i) => (
                      <Hit key={i} hit={h} words={result.words} />
                    ))}
                  </ul>
                  {more > 0 && (
                    <p class="muted">
                      {more} more not shown: add a word to narrow them.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Hit(props: { hit: SearchHit; words: readonly string[] }) {
  const h = props.hit;
  if (h.kind === 'study') {
    return (
      <li class="search-hit">
        <a href={modeHash({ name: 'chapter', sid: h.sid })}>
          <Marked text={h.study} words={props.words} />
        </a>{' '}
        <span class="muted">
          {h.studyKind === 'reference' ? 'reference · ' : ''}
          {h.chapters} chapter{h.chapters === 1 ? '' : 's'}
        </span>
      </li>
    );
  }
  const where = (
    <>
      <span class="search-study">
        <Marked text={h.study} words={props.words} />
      </span>
      {' · '}
      <Marked text={h.chapter} words={props.words} />
    </>
  );
  if (h.kind === 'chapter') {
    return (
      <li class="search-hit">
        <a href={modeHash({ name: 'chapter', sid: h.sid, cid: h.cid })}>{where}</a>
      </li>
    );
  }
  const at = modeHash({ name: 'chapter', sid: h.sid, cid: h.cid, at: [...h.path] });
  if (h.kind === 'position') {
    return (
      <li class="search-hit">
        <a href={at}>{where}</a>{' '}
        <span class="muted">
          {h.line || 'its start'}
          {h.orders > 1 ? ` · ${h.orders} move orders` : ''}
        </span>
      </li>
    );
  }
  return (
    <li class="search-hit">
      <a href={at}>{where}</a> <span class="muted">{h.move}</span>
      <p class="search-snippet">
        <Marked text={h.text} words={props.words} />
      </p>
    </li>
  );
}

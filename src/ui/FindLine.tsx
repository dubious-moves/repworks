// Find a line in the study (the owner's request of 2026-11-24, PLAN.md §5.210), from the study's ☰
// menu or "/": moves from the start typed or pasted ("1. Nc3 d5 2. d4 Nf6", "1.Nc3 d5 2.d4 Nf6",
// "Nc3 d5 d4 Nf6") or a FEN, and the places in this study's chapters that reach them, as they are
// typed. Enter goes to the first: the line in its own order (the open chapter first), else its
// position by another order, else as far as the study follows it. The open chapter is read as it
// stands, edits not yet synced included; the others as the search page reads them (§5.166).
import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { chapter, study } from '../app/editor.ts';
import { mode, open } from '../app/mode.ts';
import { reachOf, readSearchChapters, searchChapters } from '../app/search.ts';
import { dataVersion } from '../app/sync.ts';
import { modeHash } from '../core/app/fsm.ts';
import { findLine, type LineChapter, type LineHit } from '../core/study/findLine.ts';
import { header } from '../core/study/model.ts';

const shown = signal(false);
export const openFindLine = () => (shown.value = true);
const close = () => (shown.value = false);

export function FindLineDialog() {
  const name = mode.value.name;
  // Another screen closes it.
  useEffect(() => close, [name]);
  return shown.value && study.value && chapter.value ? <Dialog /> : null;
}

function Dialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const version = dataVersion.value;
  useEffect(() => void readSearchChapters(), [version]);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
  }, []);
  const s = study.value!;
  const open_ = chapter.value!;
  const all = searchChapters.value;
  const chapters = useMemo<LineChapter[]>(() => {
    const read = new Map((all ?? []).filter((c) => c.sid === s.sid).map((c) => [c.cid, c]));
    // The study's order; the open chapter as it stands in the editor.
    return s.chapters.flatMap(({ id, name }): LineChapter[] => {
      if (id === s.cid) return [{ cid: id, name: header(open_, 'ChapterName') ?? name, chapter: open_ }];
      const c = read.get(id);
      return c ? [{ cid: id, name: c.name, chapter: c.chapter }] : [];
    });
  }, [all, s, open_]);
  const query = text.trim();
  const found = useMemo(() => (query ? findLine(chapters, query, s.cid, reachOf) : undefined), [chapters, query, s.cid]);
  const first = found?.hits[0] ?? found?.partial;
  const href = (h: LineHit) => modeHash({ name: 'chapter', sid: s.sid, cid: h.cid, at: [...h.path] });
  const go = (h: LineHit) => {
    close();
    open({ name: 'chapter', sid: s.sid, cid: h.cid, at: [...h.path] });
  };
  /** A hit's link: followed in the page (the dialog closed first), or in a new tab as any link. */
  const link = (h: LineHit) => (
    <a
      href={href(h)}
      onClick={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(h);
      }}
    >
      {h.name}
    </a>
  );

  return (
    <dialog ref={ref} class="study-dialog find-line" aria-labelledby="dialog-find-line" onCancel={(e) => (e.preventDefault(), close())} onClose={close}>
      <form
        class="form"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (first) go(first);
        }}
      >
        <h2 id="dialog-find-line">Find a line</h2>
        <input
          // Text, not search: Escape closes the dialog at once rather than first clearing the box.
          type="text"
          class="search-box"
          aria-label="Moves from the start"
          placeholder="1. Nc3 d5 2. d4 Nf6, or a FEN"
          value={text}
          enterkeyhint="go"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          autofocus
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <div class="find-line-result" role="status" aria-live="polite" data-testid="find-line-result">
          {!query ? (
            <p class="muted">Moves from the start, numbered or not, with or without a space after the number; or a FEN. Enter goes to the first place found.</p>
          ) : !found ? (
            <p class="muted">These aren’t moves from the start, or one of them isn’t legal there.</p>
          ) : found.hits.length ? (
            <>
              <p class="search-position">
                <strong>{found.line}</strong>
              </p>
              <ul class="search-hits">
                {found.hits.map((h) => (
                  <li key={h.cid} class="search-hit">
                    {link(h)}
                    {h.cid === s.cid ? <span class="muted"> (this chapter)</span> : ''}
                    {h.how === 'position' && (
                      <>
                        <br />
                        <span class="muted">by another order: {h.line || 'its start'}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : found.partial ? (
            <>
              <p class="search-position">
                No chapter reaches <strong>{found.line}</strong>. The study follows it as far as <strong>{found.partial.line}</strong>, in:
              </p>
              <ul class="search-hits">
                <li class="search-hit">
                  {link(found.partial)}
                  {found.partial.cid === s.cid ? <span class="muted"> (this chapter)</span> : ''}
                </li>
              </ul>
            </>
          ) : (
            <p class="search-position">
              No chapter of this study plays <strong>{found.line}</strong>, nor its first move.
            </p>
          )}
          {found && !all && <p class="muted">Reading the study’s other chapters…</p>}
        </div>
        <div class="dialog-buttons">
          <span class="spacer" />
          <button type="button" class="secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={!first}>
            Go
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Making and managing studies and chapters where Qchess has it (PLAN.md §5.15): "New study" on the
// study list; a study's settings (name, kind, delete) from its card's ⚙ or the ⚙ by its name in
// the chapter view; a chapter's settings (name, side, order, delete) from the ⚙ by it in the
// chapter list; and a new chapter from "+ New": empty, from a FEN, or from PGN pasted or read
// from a file (a chapter per game); and several chapters at once (§5.140): deleted, given a side or
// merged into one. Each is a modal dialog, as Qchess's are.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { addChapter, chapter, type ChapterStart, deleteOpenChapter, doc, moveOpenChapter, renameOpenChapter, setSide, side, study } from '../app/editor.ts';
import { chapterRows, joinChapters, removeChapters, turnChapters, type ChapterRow } from '../app/chapters.ts';
import { mode, open } from '../app/mode.ts';
import { changeStudy, newStudy, removeStudy } from '../app/studies.ts';
import { dataVersion } from '../app/sync.ts';
import { header, type StudyKind } from '../core/study/model.ts';

type Side = 'white' | 'black';

/** The study whose settings are open, by its card or the chapter view. */
export interface StudyRef {
  sid: string;
  name: string;
  kind: StudyKind;
  chapters: number;
}

type Dialog = { kind: 'newStudy' } | { kind: 'study'; study: StudyRef } | { kind: 'chapter'; cid: string } | { kind: 'newChapter' } | { kind: 'chapters'; sid: string };
const dialog = signal<Dialog | undefined>(undefined);

export const openNewStudy = () => (dialog.value = { kind: 'newStudy' });
export const openStudySettings = (s: StudyRef) => (dialog.value = { kind: 'study', study: s });
/** A chapter's settings: the chapter opens, and its dialog once it is read. */
export function openChapterSettings(sid: string, cid: string): void {
  dialog.value = { kind: 'chapter', cid };
  const m = mode.peek();
  if (m.name !== 'chapter' || m.sid !== sid || m.cid !== cid) open({ name: 'chapter', sid, cid });
}
export const openNewChapter = () => (dialog.value = { kind: 'newChapter' });
/** Several chapters of a study at once (§5.140), from its settings, the ☰ menu or a chapter's settings. */
export const openManageChapters = (sid: string) => (dialog.value = { kind: 'chapters', sid });
const close = () => (dialog.value = undefined);

/** Asks before deleting a study, as Qchess does; "its chapters" is said out loud. */
export async function confirmDeleteStudy(s: StudyRef): Promise<boolean> {
  const chapters = `${s.chapters} chapter${s.chapters === 1 ? '' : 's'}`;
  if (!confirm(`Delete the study “${s.name}” and its ${chapters}?`)) return false;
  await removeStudy(s.sid);
  return true;
}

export function StudyDialogs() {
  const d = dialog.value;
  // Another screen closes whatever was open.
  const name = mode.value.name;
  useEffect(() => close, [name]);
  // Another chapter opened under a chapter's dialog (a sync deleted it, say): it closes.
  const cid = study.value?.cid;
  useEffect(() => {
    const now = dialog.peek();
    if (now?.kind === 'chapter' && cid !== undefined && cid !== now.cid) close();
  }, [cid]);
  if (!d) return null;
  switch (d.kind) {
    case 'newStudy':
      return <NewStudy />;
    case 'study':
      return <StudySettings key={d.study.sid} study={d.study} />;
    case 'chapter':
      return study.value?.cid === d.cid ? <ChapterSettings key={d.cid} /> : null;
    case 'newChapter':
      return <NewChapter />;
    case 'chapters':
      return <ManageChapters key={d.sid} sid={d.sid} />;
  }
}

function Modal(props: { title: string; children: ComponentChildren; onSubmit: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    if (matchMedia('(pointer: fine)').matches) d.querySelector<HTMLInputElement>('input[type="text"]')?.select();
  }, []);
  const id = `dialog-${props.title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <dialog ref={ref} class="study-dialog" aria-labelledby={id} onCancel={(e) => (e.preventDefault(), close())}>
      <form
        class="form"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit();
        }}
      >
        <h2 id={id}>{props.title}</h2>
        {props.children}
      </form>
    </dialog>
  );
}

function SideChoice(props: { name: string; legend: string; value: Side; onChange: (s: Side) => void }) {
  return (
    <fieldset class="choice">
      <legend>{props.legend}</legend>
      {(['white', 'black'] as const).map((s) => (
        <label key={s}>
          <input type="radio" name={props.name} checked={props.value === s} onChange={() => props.onChange(s)} /> {s === 'white' ? 'White' : 'Black'}
        </label>
      ))}
    </fieldset>
  );
}

function KindChoice(props: { value: StudyKind; onChange: (k: StudyKind) => void }) {
  return (
    <fieldset class="choice">
      <legend>Kind</legend>
      <label>
        <input type="radio" name="kind" checked={props.value === 'repertoire'} onChange={() => props.onChange('repertoire')} /> Repertoire <span class="muted">(trained)</span>
      </label>
      <label>
        <input type="radio" name="kind" checked={props.value === 'reference'} onChange={() => props.onChange('reference')} /> Reference <span class="muted">(read only)</span>
      </label>
    </fieldset>
  );
}

function Buttons(props: { submit: string; busy?: boolean; danger?: { label: string; onClick: () => void } }) {
  return (
    <div class="dialog-buttons">
      {props.danger && (
        <button type="button" class="secondary danger" onClick={props.danger.onClick}>
          {props.danger.label}
        </button>
      )}
      <span class="spacer" />
      <button type="button" class="secondary" onClick={close}>
        Cancel
      </button>
      <button type="submit" class="primary" disabled={props.busy}>
        {props.submit}
      </button>
    </div>
  );
}

function NewStudy() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StudyKind>('repertoire');
  const [chapterName, setChapterName] = useState('');
  const [chapterSide, setChapterSide] = useState<Side>('white');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return setError('Please enter a study name.');
    setBusy(true);
    const made = await newStudy({ name, kind, chapterName, side: chapterSide });
    setBusy(false);
    if (!made.ok) return setError(made.error);
    close();
    open({ name: 'chapter', sid: made.value.sid, cid: made.value.cid });
  };
  return (
    <Modal title="New study" onSubmit={() => void create()}>
      <label>
        Study name
        <input type="text" name="study-name" placeholder="My study" maxLength={100} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <KindChoice value={kind} onChange={setKind} />
      <label>
        First chapter
        <input type="text" name="chapter-name" placeholder="Chapter 1" maxLength={100} value={chapterName} onInput={(e) => setChapterName(e.currentTarget.value)} />
      </label>
      <SideChoice name="new-side" legend="For" value={chapterSide} onChange={setChapterSide} />
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      <Buttons submit="Create study" busy={busy} />
    </Modal>
  );
}

function StudySettings(props: { study: StudyRef }) {
  const s = props.study;
  const [name, setName] = useState(s.name);
  const [kind, setKind] = useState<StudyKind>(s.kind);
  const [error, setError] = useState<string | undefined>(undefined);
  const save = async () => {
    if (!name.trim()) return setError('Please enter a study name.');
    const done = await changeStudy(s.sid, { name, kind });
    if (!done.ok) return setError(done.error);
    close();
  };
  const remove = async () => {
    if (!(await confirmDeleteStudy(s))) return;
    close();
    const m = mode.peek();
    if ('sid' in m && m.sid === s.sid) open({ name: 'list' });
  };
  return (
    <Modal title="Study settings" onSubmit={() => void save()}>
      <label>
        Study name
        <input type="text" name="study-name" maxLength={100} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <KindChoice value={kind} onChange={setKind} />
      <p>
        <button type="button" class="secondary" onClick={() => (close(), open({ name: 'coverage', sid: s.sid }))}>
          Coverage…
        </button>{' '}
        <span class="muted">{s.kind === 'reference' ? 'which of its lines your repertoire doesn’t have' : 'the lines of a reference study this one doesn’t have'}</span>
      </p>
      <p>
        <button type="button" class="secondary" onClick={() => openManageChapters(s.sid)}>
          Chapters…
        </button>{' '}
        <span class="muted">delete, turn or merge several at once</span>
      </p>
      {s.kind === 'repertoire' && (
        <p>
          <button type="button" class="secondary" onClick={() => (close(), open({ name: 'storm', sid: s.sid }))}>
            Storm…
          </button>{' '}
          <span class="muted">positions past this study’s lines, from real games</span>
        </p>
      )}
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      <Buttons submit="Save" danger={{ label: 'Delete study', onClick: () => void remove() }} />
    </Modal>
  );
}

/** The open chapter's settings (the ⚙ by a chapter opens that chapter first). */
function ChapterSettings() {
  const s = study.value;
  const c = chapter.value;
  const current = c ? (header(c, 'ChapterName') ?? '') : (s?.chapters.find((x) => x.id === s.cid)?.name ?? '');
  const [name, setName] = useState(current);
  const [forSide, setForSide] = useState<Side>(side.value);
  if (!s) return null;
  const editable = !!doc.value;
  const i = s.chapters.findIndex((x) => x.id === s.cid);
  const save = () => {
    if (editable && name.trim() && name.trim() !== current) renameOpenChapter(name);
    if (editable && forSide !== side.peek()) setSide(forSide);
    close();
  };
  const remove = () => {
    if (!confirm(`Delete the chapter “${current}”?`)) return;
    close();
    void deleteOpenChapter();
  };
  return (
    <Modal title="Chapter settings" onSubmit={save}>
      {editable ? (
        <>
          <label>
            Chapter name
            <input type="text" name="chapter-name" maxLength={100} value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <SideChoice name="side" legend="For" value={forSide} onChange={setForSide} />
        </>
      ) : (
        <p class="muted">This chapter can’t be edited here, but it can be moved or deleted.</p>
      )}
      <div class="order" role="group" aria-label="Order">
        <span class="muted">
          Chapter {i + 1} of {s.chapters.length}
        </span>
        <button type="button" class="secondary" disabled={i <= 0} onClick={() => void moveOpenChapter(-1)}>
          Move up
        </button>
        <button type="button" class="secondary" disabled={i < 0 || i >= s.chapters.length - 1} onClick={() => void moveOpenChapter(1)}>
          Move down
        </button>
      </div>
      <p>
        <button type="button" class="secondary" onClick={() => openManageChapters(s.sid)}>
          Several chapters…
        </button>{' '}
        <span class="muted">delete, turn or merge several at once</span>
      </p>
      <Buttons submit="Save" danger={{ label: 'Delete chapter', onClick: remove }} />
    </Modal>
  );
}

function NewChapter() {
  const s = study.value;
  const [name, setName] = useState('');
  const [forSide, setForSide] = useState<Side>(side.peek());
  const [from, setFrom] = useState<ChapterStart['from']>('empty');
  const [fen, setFen] = useState('');
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  const create = async () => {
    setBusy(true);
    const made = await addChapter(name, forSide, from === 'fen' ? { from, fen } : from === 'pgn' ? { from, pgn } : { from });
    setBusy(false);
    if (!made.ok) return setError(`${made.error[0]!.toUpperCase()}${made.error.slice(1)}.`);
    close();
  };
  const pick = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) setPgn(await file.text());
  };
  const starts = [
    ['empty', 'Empty'],
    ['fen', 'From FEN'],
    ['pgn', 'From PGN'],
  ] as const;
  return (
    <Modal title="New chapter" onSubmit={() => void create()}>
      <label>
        Chapter name
        <input type="text" name="new-chapter" placeholder={`Chapter ${s.chapters.length + 1}`} maxLength={100} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <SideChoice name="new-side" legend="For" value={forSide} onChange={setForSide} />
      <fieldset class="choice">
        <legend>Start</legend>
        {starts.map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="new-start" checked={from === value} onChange={() => (setFrom(value), setError(undefined))} /> {label}
          </label>
        ))}
      </fieldset>
      {from === 'fen' && (
        <label>
          FEN
          <input type="text" name="new-fen" placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" spellcheck={false} value={fen} onInput={(e) => setFen(e.currentTarget.value)} />
        </label>
      )}
      {from === 'pgn' && (
        <>
          <label>
            PGN file
            <input type="file" name="new-pgn-file" accept=".pgn,application/x-chess-pgn,text/plain" onChange={(e) => void pick(e)} />
          </label>
          <label>
            PGN
            <textarea name="new-pgn" rows={5} spellcheck={false} value={pgn} onInput={(e) => setPgn(e.currentTarget.value)} />
          </label>
          <p class="muted">Each game becomes a chapter.</p>
        </>
      )}
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      <Buttons submit="Create chapter" busy={busy} />
    </Modal>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const sideName = (side: ChapterRow['side']) => (side === 'white' ? 'White' : side === 'black' ? 'Black' : 'No side');
const sentence = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}.`;

/**
 * Several chapters at once (§5.140): the study's chapters with a box each (a shift-click ticks or
 * clears the run from the last one clicked), and what to do with those ticked: give them a side,
 * merge them into the first of them, or delete them. The dialog stays open after each, its list
 * read again, so a side can be set and the chapters then merged.
 */
function ManageChapters(props: { sid: string }) {
  const { sid } = props;
  const [rows, setRows] = useState<ChapterRow[] | undefined>(undefined);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [said, setSaid] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const version = dataVersion.value;
  useEffect(() => {
    let live = true;
    void chapterRows(sid).then((read) => {
      if (!live) return;
      if (!read.ok) return setError(sentence(read.error));
      setRows(read.value);
      // A chapter gone (deleted here, or by a sync) is no longer ticked.
      setChosen((before) => new Set(read.value.filter((r) => before.has(r.id)).map((r) => r.id)));
    });
    return () => void (live = false);
  }, [sid, version]);
  const list = rows ?? [];
  const picked = list.filter((r) => chosen.has(r.id));
  const n = picked.length;
  const all = list.length > 0 && n === list.length;

  const tick = (i: number, on: boolean, range: boolean) => {
    const next = new Set(chosen);
    const [from, to] = range && anchor !== undefined ? [Math.min(anchor, i), Math.max(anchor, i)] : [i, i];
    for (let j = from; j <= to; j++) {
      if (on) next.add(list[j]!.id);
      else next.delete(list[j]!.id);
    }
    setChosen(next);
    setAnchor(i);
  };
  const run = async (what: () => Promise<{ ok: true; said: string } | { ok: false; error: string }>) => {
    setBusy(true);
    setError(undefined);
    setSaid(undefined);
    const done = await what();
    setBusy(false);
    if (done.ok) setSaid(done.said);
    else setError(sentence(done.error));
  };
  const ids = picked.map((r) => r.id);
  const turn = (side: Side) =>
    run(async () => {
      const done = await turnChapters(sid, ids, side);
      if (!done.ok) return done;
      const left = done.value.length ? ` ${done.value.map((name) => `“${name}”`).join(', ')} can’t be read, so ${done.value.length === 1 ? 'it is' : 'they are'} left as ${done.value.length === 1 ? 'it is' : 'they are'}.` : '';
      return { ok: true, said: `${sentence(`${plural(n - done.value.length, 'chapter')} for ${side === 'white' ? 'White' : 'Black'}`)}${left}` };
    });
  const merge = () => {
    const into = picked[0]!;
    if (!confirm(`Merge ${plural(n, 'chapter')} into “${into.name}”? Their lines go into it, and the other ${plural(n - 1, 'chapter')} ${n === 2 ? 'is' : 'are'} deleted.`)) return;
    void run(async () => {
      const done = await joinChapters(sid, ids);
      if (!done.ok) return done;
      setChosen(new Set());
      setAnchor(undefined);
      // In the study, the merged chapter opens.
      const m = mode.peek();
      if (m.name === 'chapter' && m.sid === sid && m.cid !== done.value) open({ name: 'chapter', sid, cid: done.value });
      return { ok: true, said: `Merged into “${into.name}”.` };
    });
  };
  const remove = () => {
    const ask = n === 1 ? `Delete the chapter “${picked[0]!.name}”?` : all ? `Delete all ${n} chapters? The study stays, with none.` : `Delete ${n} chapters?`;
    if (!confirm(ask)) return;
    void run(async () => {
      const done = await removeChapters(sid, ids);
      if (!done.ok) return done;
      setChosen(new Set());
      setAnchor(undefined);
      return { ok: true, said: `${sentence(`${plural(n, 'chapter')} deleted`)}` };
    });
  };

  return (
    <Modal title="Manage chapters" onSubmit={close}>
      <label class="chapter-all">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = n > 0 && !all;
          }}
          disabled={!list.length}
          onChange={() => (setChosen(all ? new Set() : new Set(list.map((r) => r.id))), setAnchor(undefined))}
        />{' '}
        {rows === undefined ? 'Reading the chapters…' : `${n} of ${plural(list.length, 'chapter')} chosen`}
      </label>
      <ul class="chapter-rows" aria-label="Chapters">
        {list.map((r, i) => (
          <li key={r.id}>
            <label>
              <input type="checkbox" checked={chosen.has(r.id)} onClick={(e) => tick(i, e.currentTarget.checked, e.shiftKey)} />
              <span class="chapter-row-name">{r.name}</span>
              <span class="chapter-row-side muted">{sideName(r.side)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p class="muted chapter-hint">
        <span class="fine-only">Shift-click a box to tick or clear every chapter from the last one clicked. </span>Merging keeps the first chosen chapter, with every line of the others added to it.
      </p>
      <div class="chapter-actions" role="group" aria-label="With the chosen chapters">
        <button type="button" class="secondary" disabled={busy || n === 0} onClick={() => void turn('white')}>
          For White
        </button>
        <button type="button" class="secondary" disabled={busy || n === 0} onClick={() => void turn('black')}>
          For Black
        </button>
        <button type="button" class="secondary" disabled={busy || n < 2} onClick={merge}>
          Merge into one
        </button>
      </div>
      {error && (
        <p class="warn" role="alert">
          {error}
        </p>
      )}
      <p class="muted" role="status">
        {said ?? ''}
      </p>
      <div class="dialog-buttons">
        <button type="button" class="secondary danger" disabled={busy || n === 0} onClick={remove}>
          {n > 1 ? `Delete ${n} chapters` : 'Delete chapter'}
        </button>
        <span class="spacer" />
        <button type="submit" class="primary">
          Done
        </button>
      </div>
    </Modal>
  );
}

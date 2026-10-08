// Making and managing studies and chapters where Qchess has it (PLAN.md §5.15): "New study" on the
// study list; a study's settings (name, kind, delete) from its card's ⚙ or the ⚙ by its name in
// the chapter view; a chapter's settings (name, side, order, delete) from the ⚙ by it in the
// chapter list; and a new chapter from "+ New": empty, from a FEN, or from PGN pasted or read
// from a file (a chapter per game). Each is a modal dialog, as Qchess's are.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { addChapter, chapter, type ChapterStart, deleteOpenChapter, doc, moveOpenChapter, renameOpenChapter, setSide, side, study } from '../app/editor.ts';
import { mode, open } from '../app/mode.ts';
import { changeStudy, newStudy, removeStudy } from '../app/studies.ts';
import { header, type StudyKind } from '../core/study/model.ts';

type Side = 'white' | 'black';

/** The study whose settings are open, by its card or the chapter view. */
export interface StudyRef {
  sid: string;
  name: string;
  kind: StudyKind;
  chapters: number;
}

const dialog = signal<{ kind: 'newStudy' } | { kind: 'study'; study: StudyRef } | { kind: 'chapter'; cid: string } | { kind: 'newChapter' } | undefined>(undefined);

export const openNewStudy = () => (dialog.value = { kind: 'newStudy' });
export const openStudySettings = (s: StudyRef) => (dialog.value = { kind: 'study', study: s });
/** A chapter's settings: the chapter opens, and its dialog once it is read. */
export function openChapterSettings(sid: string, cid: string): void {
  dialog.value = { kind: 'chapter', cid };
  const m = mode.peek();
  if (m.name !== 'chapter' || m.sid !== sid || m.cid !== cid) open({ name: 'chapter', sid, cid });
}
export const openNewChapter = () => (dialog.value = { kind: 'newChapter' });
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

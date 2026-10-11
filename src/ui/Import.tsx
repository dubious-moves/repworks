// Import a study (PLAN.md §4.10): a PGN file or pasted PGN (the Qchess export among them), or a
// Lichess study; then a review where the owner names it, picks repertoire or reference, and
// gives each chapter its side, with the import report.
import { useState } from 'preact/hooks';
import qchessScript from '../../scripts/qchess-export.js?raw';
import { extractStudyId, LichessError, type LichessStudyInfo } from '../core/import/lichess.ts';
import { describeNote, headerCounts, readImport, sidesMissing, type ImportChoices, type ImportReading, type Side } from '../core/import/plan.ts';
import type { StudyKind, StudySource } from '../core/study/model.ts';
import { lichess, lichessUser, logInWithLichess, logOutOfLichess } from '../app/lichess.ts';
import { open } from '../app/mode.ts';
import { notice, saveImport } from '../app/state.ts';
import { Back } from './Back.tsx';

interface Read {
  reading: ImportReading;
  source: Omit<StudySource, 'imported'>;
  /** The name to offer when the PGN carries none. */
  fallbackName: string;
}

export function ImportScreen() {
  const [read, setRead] = useState<Read | undefined>(undefined);
  return (
    <>
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Import</span>
        </div>
      </div>
      {read ? <Review read={read} onCancel={() => setRead(undefined)} /> : <Sources onRead={setRead} />}
    </>
  );
}

function Sources(props: { onRead: (read: Read) => void }) {
  return (
    <>
      <FileSource onRead={props.onRead} />
      <LichessSource onRead={props.onRead} />
      <QchessHelp />
    </>
  );
}

const sourceOfFile = (reading: ImportReading, name: string): Omit<StudySource, 'imported'> => ({ kind: reading.fromQchess || /\.qchess\.pgn$/i.test(name) ? 'qchess' : 'file', name });

function FileSource(props: { onRead: (read: Read) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const use = (pgn: string, name: string) => {
    const reading = readImport(pgn);
    if (reading.chapters.length === 0 && reading.refused.length === 0) return setError('No game found in that PGN.');
    setError(undefined);
    const fallbackName =
      name
        .replace(/\.qchess\.pgn$|\.pgn$/i, '')
        .replace(/_\d{4}-\d\d-\d\d$/, '')
        .replace(/_/g, ' ') || 'Imported study';
    props.onRead({ reading, source: sourceOfFile(reading, name), fallbackName });
  };
  const pick = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) use(await file.text(), file.name);
  };
  return (
    <section class="card form">
      <h2>PGN file</h2>
      <p class="muted">A Qchess export, a Lichess download, your Chessable export, repgen or ChessBase output. Each game becomes a chapter.</p>
      <label>
        File
        <input type="file" name="pgn-file" accept=".pgn,application/x-chess-pgn,text/plain" onChange={(e) => void pick(e)} />
      </label>
      <label>
        Or paste PGN
        <textarea name="pgn-text" rows={4} value={text} onInput={(e) => setText(e.currentTarget.value)} spellcheck={false} />
      </label>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" disabled={!text.trim()} onClick={() => use(text, 'pasted PGN')}>
        Read the pasted PGN
      </button>
    </section>
  );
}

function LichessSource(props: { onRead: (read: Read) => void }) {
  const user = lichessUser.value;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [list, setList] = useState<LichessStudyInfo[] | undefined>(undefined);
  const [who, setWho] = useState(user ?? '');
  const fail = (e: unknown) => setError(e instanceof LichessError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
  const fetchStudy = async (id: string, name?: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const reading = readImport(await lichess.studyPgn(id));
      props.onRead({ reading, source: { kind: 'lichess', id, name: reading.studyName ?? name ?? id }, fallbackName: name ?? id });
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  };
  const fetchList = async () => {
    if (!who.trim()) return setError('Whose studies? Enter a Lichess username.');
    setBusy(true);
    setError(undefined);
    try {
      setList(await lichess.studies(who.trim()));
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  };
  const id = extractStudyId(input);
  return (
    <section class="card form">
      <h2>Lichess study</h2>
      <p class="muted">
        {user === undefined ? (
          <>
            Public studies need no login. For a private one,{' '}
            <button type="button" class="link" onClick={() => void logInWithLichess('#/import')}>
              log in with Lichess
            </button>
            .
          </>
        ) : (
          <>
            Logged in with Lichess{user ? ` as ${user}` : ''}.{' '}
            <button type="button" class="link" onClick={() => void logOutOfLichess()}>
              Log out
            </button>
          </>
        )}
      </p>
      <label>
        Study URL or ID
        <input
          name="lichess-study"
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="https://lichess.org/study/…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
        />
      </label>
      <div class="actions">
        <button type="button" disabled={busy || !id} onClick={() => id && void fetchStudy(id)}>
          {busy ? 'Fetching…' : 'Fetch the study'}
        </button>
      </div>
      <label>
        Or list the studies of
        <input name="lichess-user" value={who} onInput={(e) => setWho(e.currentTarget.value)} placeholder="Lichess username" autocomplete="off" autocapitalize="off" spellcheck={false} />
      </label>
      <div class="actions">
        <button type="button" disabled={busy} onClick={() => void fetchList()}>
          List studies
        </button>
      </div>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {list &&
        (list.length === 0 ? (
          <p class="muted">No studies{user ? '' : ' (private ones show after logging in)'}.</p>
        ) : (
          <ul class="pick">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" class="link" disabled={busy} onClick={() => void fetchStudy(s.id, s.name)}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function QchessHelp() {
  const [copied, setCopied] = useState<string | undefined>(undefined);
  const [shown, setShown] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qchessScript);
      setCopied('Copied.');
    } catch {
      setShown(true);
      setCopied('Copying was refused here: select the script below and copy it.');
    }
  };
  return (
    <section class="card">
      <h2>From Qchess</h2>
      <ol class="steps">
        <li>Copy the export script.</li>
        <li>
          Open your study on qchess.net, then the browser's console (F12 → Console). Paste the script and press Enter. Chrome asks you to type <code>allow pasting</code> the first time.
        </li>
        <li>It downloads one PGN file, with each chapter's side, folder and MoveTrainer setting. Import that file above.</li>
      </ol>
      <div class="actions">
        <button type="button" onClick={() => void copy()}>
          Copy the export script
        </button>
        <button type="button" onClick={() => setShown(!shown)}>
          {shown ? 'Hide it' : 'Show it'}
        </button>
      </div>
      {copied && <p class="muted">{copied}</p>}
      {shown && <textarea class="script" readOnly rows={8} value={qchessScript} />}
      <p class="muted">Qchess's own “Download Study PGN” imports too, but without the sides: you choose them during import.</p>
    </section>
  );
}

function Review(props: { read: Read; onCancel: () => void }) {
  const { reading, source } = props.read;
  const [name, setName] = useState(reading.studyName ?? props.read.fallbackName);
  const [kind, setKind] = useState<StudyKind>('repertoire');
  const [sides, setSides] = useState<Map<number, Side>>(new Map());
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const missing = sidesMissing(reading, sides);
  const setSide = (index: number, side: Side) => setSides(new Map([...sides, [index, side]]));
  const setAllMissing = (side: Side) => setSides(new Map([...sides, ...missing.map((c): [number, Side] => [c.index, side])]));
  const companion = kind === 'repertoire' && reading.chapters.some((c) => !c.train);
  const notes = reading.chapters.flatMap((c) => c.notes.map((n) => `${c.name}: ${describeNote(c.chapter, n)}`));
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const choices: ImportChoices = { name, kind, source, sides };
    const result = await saveImport(reading, choices);
    setBusy(false);
    if (!result.ok) return setError(`Not imported: ${result.error}.`);
    const made = result.studies.map((s) => `“${s.meta.name}” (${s.meta.kind}, ${s.chapters.length} chapter${s.chapters.length === 1 ? '' : 's'})`);
    notice.value = { kind: 'done', message: `Imported ${made.join(' and ')}. It syncs with the next sync.` };
    open({ name: 'list' });
  };
  return (
    <form class="card form review" onSubmit={(e) => void submit(e)}>
      <h2>
        Import {reading.chapters.length} chapter{reading.chapters.length === 1 ? '' : 's'}
      </h2>
      <p class="muted">
        From {source.kind === 'lichess' ? 'Lichess' : source.kind === 'qchess' ? 'Qchess' : 'a PGN file'}: {source.name ?? source.id}. A new study is made every time; nothing on this device is
        replaced.
      </p>
      <label>
        Study name
        <input name="study-name" value={name} onInput={(e) => setName(e.currentTarget.value)} required />
      </label>
      <fieldset class="choice">
        <legend>Kind</legend>
        <label>
          <input type="radio" name="kind" checked={kind === 'repertoire'} onChange={() => setKind('repertoire')} /> Repertoire (trained)
        </label>
        <label>
          <input type="radio" name="kind" checked={kind === 'reference'} onChange={() => setKind('reference')} /> Reference (read only, never trained)
        </label>
      </fieldset>
      {companion && <p class="muted">Chapters Qchess excludes from its MoveTrainer go into a second study, “{name.trim()} (reference)”.</p>}
      {missing.length > 0 && (
        <p class="warn">
          {missing.length} chapter{missing.length === 1 ? ' has' : 's have'} no side. All of them:{' '}
          <button type="button" onClick={() => setAllMissing('white')}>
            White
          </button>{' '}
          <button type="button" onClick={() => setAllMissing('black')}>
            Black
          </button>
        </p>
      )}
      <ul class="chapters">
        {reading.chapters.map((c) => (
          <li key={c.index}>
            <span class="chapter-name">
              {c.name}
              {c.folder && <span class="muted"> · {c.folder}</span>}
              {companion && !c.train && <span class="muted"> · reference</span>}
            </span>
            <select aria-label={`Side of ${c.name}`} value={sides.get(c.index) ?? c.side ?? ''} onChange={(e) => setSide(c.index, e.currentTarget.value as Side)}>
              {!sides.get(c.index) && !c.side && <option value="">side?</option>}
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </li>
        ))}
      </ul>
      {reading.refused.length > 0 && (
        <div class="warn" role="alert">
          <p>Left out, unreadable:</p>
          <ul>
            {reading.refused.map((r) => (
              <li key={r.index}>
                {r.name}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details class="report">
        <summary>
          Import report: {notes.length} note{notes.length === 1 ? '' : 's'}
        </summary>
        {notes.length > 0 && (
          <ul>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <p class="muted">
          Headers kept:{' '}
          {headerCounts(reading)
            .map(([h, n]) => `${h} (${n})`)
            .join(', ') || 'none'}
        </p>
      </details>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <div class="actions">
        <button type="submit" disabled={busy || missing.length > 0 || reading.chapters.length === 0}>
          Import
        </button>
        <button type="button" class="secondary" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

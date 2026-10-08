// The engines' files on this device (PLAN.md §5.29), in the debug panel: Stockfish and Maia,
// stored or not, their size, a download with progress and a delete.
import { useEffect, useState } from 'preact/hooks';
import { ENGINES, ensure, remove, stored, type EngineFile, type Progress } from '../platform/blobs.ts';
import { deleteMaia, maiaPrefs } from '../app/maia.ts';

const GROUPS: { name: string; files: EngineFile[] }[] = [
  { name: 'Stockfish 18', files: [ENGINES.stockfishJs, ENGINES.stockfishWasm] },
  { name: 'Stockfish 18 threads', files: [ENGINES.stockfishMtJs, ENGINES.stockfishMtWasm] },
  { name: 'Stockfish 19', files: [ENGINES.stockfish19Js, ENGINES.stockfish19Wasm] },
  { name: 'Stockfish 19 threads', files: [ENGINES.stockfish19MtJs, ENGINES.stockfish19MtWasm] },
  { name: 'Maia 3', files: [ENGINES.maiaModel, ENGINES.ortWasm, ENGINES.ortMjs] },
];

export const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

function Group(props: { name: string; files: EngineFile[] }) {
  const [has, setHas] = useState<boolean | undefined>(undefined);
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const check = () => void stored(props.files).then(setHas);
  useEffect(check, []);
  const bytes = props.files.reduce((n, f) => n + f.bytes, 0);
  const download = async () => {
    setError(undefined);
    try {
      await ensure(props.files, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setProgress(undefined);
    check();
  };
  return (
    <li class="engine-files" data-stored={has ? 'yes' : 'no'}>
      <strong>{props.name}</strong> · {megabytes(bytes)} · {has === undefined ? '…' : has ? 'stored' : 'not stored'}
      {progress && <> · {Math.floor((100 * progress.received) / progress.total)}%</>}{' '}
      {!has && !progress && (
        <button type="button" class="secondary" onClick={() => void download()}>
          Download
        </button>
      )}
      {has && (
        <button type="button" class="secondary" onClick={() => void (props.files.includes(ENGINES.maiaModel) && maiaPrefs.peek().on ? deleteMaia() : remove(props.files)).then(check)}>
          Delete
        </button>
      )}
      {error && <span class="warn"> {error}</span>}
    </li>
  );
}

export function EngineFiles() {
  return (
    <>
      <h3>Engines on this device</h3>
      <ul class="engines">
        {GROUPS.map((g) => (
          <Group key={g.name} name={g.name} files={g.files} />
        ))}
      </ul>
    </>
  );
}

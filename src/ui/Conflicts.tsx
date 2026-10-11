// The conflicts view (PLAN.md §4.7, §4.11): every comment carrying a conflict marker, in every
// study, each a link to its move, where it is resolved.
import { useEffect, useState } from 'preact/hooks';
import { open } from '../app/mode.ts';
import { Back } from './Back.tsx';
import { findConflicts, type Overview } from '../app/overview.ts';
import { localStore } from '../app/state.ts';
import { dataVersion } from '../app/sync.ts';
import { isKeptMarker } from '../core/merge/markers.ts';

export function ConflictsView() {
  const [overview, setOverview] = useState<Overview | undefined>(undefined);
  const version = dataVersion.value;
  useEffect(() => {
    const store = localStore();
    if (store) void findConflicts(store).then(setOverview);
  }, [version]);
  return (
    <>
      <div class="chapter-head">
        <Back parent={{ name: 'list' }} />
        <div class="titles">
          <span class="study-title">Conflicts</span>
        </div>
      </div>
      <section class="card">
        {!overview ? (
          <p class="muted">Looking…</p>
        ) : overview.conflicts.length === 0 && overview.copies.length === 0 ? (
          <p class="muted">No open conflicts.</p>
        ) : (
          <ul class="conflicts">
            {overview.conflicts.map((row, i) => (
              <li key={i}>
                <button type="button" class="link" onClick={() => open({ name: 'chapter', sid: row.sid, cid: row.cid, at: [...row.conflict.path] })}>
                  {row.study} · {row.chapter} · {row.conflict.path.length ? row.conflict.path.join(' ') : 'start'}
                </button>{' '}
                <span class="muted">{row.conflict.kind === 'text' ? 'two versions of a comment' : isKeptMarker(row.conflict.comment) ? 'a line kept after a delete' : 'conflict'}</span>
              </li>
            ))}
            {overview.copies.map((copy) => (
              <li key={copy.path}>
                {copy.study}: <code>{copy.path}</code> <span class="muted">a copy the merge couldn't merge, kept beside the chapter</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

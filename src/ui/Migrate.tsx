// The migration from mistake-lab (PLAN.md §5.64): the gist and a token entered once (kept on this
// page only), Dry run with its report, then Run.
import { useState } from 'preact/hooks';
import { dryRun, migration, runMigration } from '../app/migrate.ts';
import type { MigrationReport } from '../core/games/migrate.ts';
import { Back } from './Back.tsx';

export function MigrateScreen() {
  const [gist, setGist] = useState('');
  const [token, setToken] = useState('');
  const m = migration.value;
  const busy = m.phase === 'reading' || m.phase === 'running';
  return (
    <div class="migrate">
      <div class="chapter-head">
        <Back parent={{ name: 'games' }} />
        <div class="titles">
          <span class="study-title">Move from mistake-lab</span>
        </div>
      </div>
      <section class="card">
        <p>
          mistake-lab’s progress comes over once: the game cards and plan cards with their schedules, the items you removed, your plan cards, dismissed
          positions, saved practice items, practice results and game reviews, your notes (as a “Notes” study) and your custom deviations (as a “From
          mistake-lab” repertoire study). Repertoire reviews stay behind: your cards here started new (D19). Dry run first: it reads and reports, and
          writes nothing.
        </p>
        <div class="games-setup">
          <label>
            mistake-lab’s gist
            <input type="text" value={gist} placeholder="its ID or address" autocomplete="off" spellcheck={false} onInput={(e) => setGist((e.target as HTMLInputElement).value)} />
          </label>
          <label>
            GitHub token (optional; not kept)
            <input type="password" value={token} placeholder="only if the gist won’t read without one" autocomplete="off" onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <div class="actions">
          <button type="button" disabled={busy || !gist.trim()} onClick={() => void dryRun(gist, token)}>
            {m.phase === 'reading' ? 'Reading…' : 'Dry run'}
          </button>
          <button type="button" disabled={m.phase !== 'ready'} onClick={() => void runMigration()}>
            {m.phase === 'running' ? `Writing… ${m.written ?? 0}` : 'Run'}
          </button>
        </div>
        {m.message && (
          <p class={m.phase === 'error' ? 'warn' : 'muted'} role="status" data-testid="migrate-message">
            {m.message}
          </p>
        )}
      </section>
      {m.result && <Report r={m.result.report} events={m.result.events.length} />}
    </div>
  );
}

function Report(props: { r: MigrationReport; events: number }) {
  const r = props.r;
  const list = (xs: readonly string[], max = 12) => (xs.length > max ? `${xs.slice(0, max).join(', ')} and ${xs.length - max} more` : xs.join(', '));
  return (
    <section class="card" data-testid="migrate-report">
      <h2>The report</h2>
      <ul>
        <li>
          Cards: {r.cards.game} game cards and {r.cards.plan} plan cards carried over with their schedules ({r.dueBefore} due today in mistake-lab).
        </li>
        <li>
          Left behind: {r.cards.repertoireLeft} repertoire reviews, {r.cards.neverReviewed} cards never reviewed, {r.cards.corrupt} corrupt
          {r.cards.unknown.length ? `, ${r.cards.unknown.length} unrecognised (${list(r.cards.unknown)})` : ''}.
        </li>
        {r.missingGames.length > 0 && <li>{r.missingGames.length} game cards’ games aren’t in the gist’s games file ({list(r.missingGames)}): they show once their games are read.</li>}
        <li>
          Removed items: {r.drops}, tactic lines removed: {r.lineDrops}, relapses already applied: {r.relapses}.
        </li>
        <li>
          Plan cards enrolled: {r.plans} ({r.plansRemoved} removed ones left out); dismissed positions: {r.dismissed}.
        </li>
        <li>
          Saved practice items: {r.saved.mistakes} mistakes, {r.saved.tactics} tactics{r.saved.unreadable ? `, ${r.saved.unreadable} unreadable` : ''}; practice results: {r.practice}; game reviews: {r.played}.
        </li>
        <li>
          Notes: {r.notes.kept} into the Notes study ({r.notes.fromStudies} from Lichess studies left out: the studies have them; {r.notes.deleted} deleted). Custom deviations: {r.deviations}.
        </li>
        {r.rekeyed.length > 0 && (
          <li>
            Position keys made again (mistake-lab kept an en passant square no pawn could take):{' '}
            {r.rekeyed.map((k) => (
              <code key={k.from}>{k.from}</code>
            ))}
          </li>
        )}
        {r.unreadableKeys.length > 0 && <li>Keys that aren’t positions, left out: {list(r.unreadableKeys)}</li>}
        {r.leftBehind.map((x) => (
          <li key={x}>Left behind: {x}</li>
        ))}
        <li>
          <strong>{props.events}</strong> events to write.
        </li>
      </ul>
    </section>
  );
}

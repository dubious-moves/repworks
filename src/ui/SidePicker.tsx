// The colour a drill deals (PLAN.md §5.195): both, White or Black, as three chips with how many each
// would deal. The storm's home and the endgames' page; kept per device by each.
import type { Color } from 'chessops/types';
import { SIDE_CHOICES, type SideChoice } from '../core/chess/sideChoice.ts';

const WORDS: Record<SideChoice, string> = { both: 'Both colours', white: 'White', black: 'Black' };

export function SidePicker(props: { value: SideChoice; counts?: Record<Color, number> | undefined; disabled?: boolean; testid: string; title: string; onChange(c: SideChoice): void }) {
  const n = props.counts;
  return (
    <div class="side-picker" role="group" aria-label="Colour" data-testid={props.testid} title={props.title}>
      <span class="muted side-picker-label">Play</span>
      <div class="chips">
        {SIDE_CHOICES.map((c) => {
          const on = props.value === c;
          const count = n ? (c === 'both' ? n.white + n.black : n[c]) : undefined;
          return (
            <button type="button" key={c} class={`chip-toggle${on ? ' on' : ''}`} aria-pressed={on} disabled={props.disabled} data-side={c} onClick={() => props.onChange(c)}>
              {WORDS[c]}
              {count !== undefined && <span class="storm-focus-n">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "as White", for a count's words; nothing for both. */
export const asSide = (c: SideChoice): string => (c === 'both' ? '' : ` as ${WORDS[c]}`);

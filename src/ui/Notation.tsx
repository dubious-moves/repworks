// The notation (PLAN.md §4.11): moves and comments as Lichess shows them, variations inline.
// Each move reads its own "current" signal, so stepping through a line redraws the move left
// and the move reached, not the tree.
import { effect, signal, type Signal } from '@preact/signals';
import { useMemo } from 'preact/hooks';
import { at, goTo } from '../app/editor.ts';
import { hasMarker } from '../core/merge/markers.ts';
import type { Chapter } from '../core/study/model.ts';
import { notation, pathKey, type Token } from '../core/study/notation.ts';
import type { Path } from '../core/study/tree.ts';

const current = new Map<string, Signal<boolean>>();
let shown = pathKey(at.peek());

function currentOf(key: string): Signal<boolean> {
  let s = current.get(key);
  if (!s) current.set(key, (s = signal(key === shown)));
  return s;
}

effect(() => {
  const key = pathKey(at.value);
  if (key === shown) return;
  const before = current.get(shown);
  if (before) before.value = false;
  shown = key;
  currentOf(key).value = true;
});

function Move(props: { token: Extract<Token, { kind: 'move' }> }) {
  const t = props.token;
  const isCurrent = currentOf(t.key).value;
  return (
    <span class={`move${t.mainline ? ' main' : ''}${isCurrent ? ' current' : ''}`} data-path={t.key} onClick={() => goTo(t.path)} aria-current={isCurrent ? 'true' : undefined}>
      {t.number && <span class="number">{`${t.number} `}</span>}
      {t.san}
      {t.glyphs && <span class="glyphs">{t.glyphs}</span>}
    </span>
  );
}

function Comment(props: { text: string; path: Path }) {
  const conflict = hasMarker(props.text);
  return (
    <span class={`comment${conflict ? ' conflict' : ''}`} onClick={() => goTo(props.path)}>
      {conflict ? '⚠ conflict: open the move to resolve it' : props.text}
    </span>
  );
}

export function Notation(props: { chapter: Chapter }) {
  const tokens = useMemo(() => notation(props.chapter), [props.chapter]);
  const startCurrent = currentOf('').value;
  return (
    <div class="notation" role="list" aria-label="Moves">
      <span class={`move start${startCurrent ? ' current' : ''}`} data-path="" onClick={() => goTo([])}>
        Start
      </span>
      {' '}
      {tokens.map((t, i) => [
        i > 0 && t.kind !== 'close' && tokens[i - 1]!.kind !== 'open' ? ' ' : null,
        t.kind === 'move' ? (
          <Move key={t.key} token={t} />
        ) : t.kind === 'comment' ? (
          <Comment key={`c${i}`} text={t.text} path={t.path} />
        ) : (
          <span key={`p${i}`} class="paren">
            {t.kind === 'open' ? '(' : ')'}
          </span>
        ),
      ])}
    </div>
  );
}

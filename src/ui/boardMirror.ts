// The hook a board component calls to have the Chessnut Move follow it (CHESSNUT.md §4.2, §6 part
// (c)): every render hands the link the latest position, marks and callbacks (the link drives only
// when the position changes); unmounted, or with no spec, the board stops being mirrored. While a
// board is mirrored and the board is linked the screen is kept awake (§4.9).
import { useEffect, useRef } from 'preact/hooks';
import { boardLink, type MirrorSpec } from '../app/boardLink.ts';
import { useWakeLock } from './wakeLock.ts';

export function useBoardMirror(spec: MirrorSpec | undefined): void {
  const owner = useRef({});
  useEffect(() => boardLink.setMirror(owner.current, spec));
  useEffect(() => () => boardLink.setMirror(owner.current, undefined), []);
  useWakeLock(!!spec && boardLink.status.value.state === 'on');
}

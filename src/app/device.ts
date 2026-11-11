// Whether this is a phone, for what the engines are asked (depths, hash): a narrow window, or a
// short one under a finger, which is the same phone held sideways (PLAN.md §5.164). Read when a
// search starts, so turning the phone keeps its depths.
const SMALL = '(max-width: 768px), (max-height: 520px) and (pointer: coarse)';

export const smallDevice = (): boolean => typeof matchMedia !== 'undefined' && matchMedia(SMALL).matches;

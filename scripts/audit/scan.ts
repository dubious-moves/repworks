// What must never be pushed (PLAN.md §5.219): tokens, email addresses and paths of the owner's own
// computer, looked for in every file a push would carry. Pure: text in, findings out. A token's
// value is never printed, only where it is.
export type FindingKind = 'token' | 'email' | 'pc-path' | 'container-path';

export interface Finding {
  kind: FindingKind;
  line: number;
  /** What was seen, a token cut to its first characters. */
  what: string;
}

const TOKENS: RegExp[] = [
  /\blip_[A-Za-z0-9]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bsk-[A-Za-z0-9_-]{24,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Addresses that name no person: a service's no-reply, the documentation domains. */
const EMAIL_FINE = /(^|[.@])(noreply|no-reply)@|@users\.noreply\.github\.com$|@(example\.(com|org|net)|anthropic\.com)$/i;
const PC_PATHS: RegExp[] = [/\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/g, /\/Users\/[^/\s"']+/g, /\/mnt\/[a-z]\/Users\/[^/\s"']+/g, /\/home\/(?!user\b|runner\b|node\b)[a-z_][a-z0-9_-]*\//g];
const CONTAINER_PATHS: RegExp[] = [/\/tmp\/claude-[^\s"')]+/g, /\/root\/\.claude\/[^\s"')]+/g];

export function scanText(text: string): Finding[] {
  const out: Finding[] = [];
  text.split('\n').forEach((row, i) => {
    const line = i + 1;
    for (const re of TOKENS) for (const m of row.matchAll(re)) out.push({ kind: 'token', line, what: `${m[0].slice(0, 8)}… (${m[0].length} characters)` });
    for (const m of row.matchAll(EMAIL)) if (!EMAIL_FINE.test(m[0])) out.push({ kind: 'email', line, what: m[0] });
    for (const re of PC_PATHS) for (const m of row.matchAll(re)) out.push({ kind: 'pc-path', line, what: m[0] });
    for (const re of CONTAINER_PATHS) for (const m of row.matchAll(re)) out.push({ kind: 'container-path', line, what: m[0].slice(0, 60) });
  });
  return out;
}

/** A push is stopped by a token, an email address or a path of a personal computer; a container's path only warns (it names nobody, but it will not exist in another session). */
export const stops = (f: Finding): boolean => f.kind !== 'container-path';

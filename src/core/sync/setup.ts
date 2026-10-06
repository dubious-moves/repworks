// Device setup (PLAN.md §4.9): a device is set up by opening
//   …/#setup?repo=<owner/name>&token=<token>[&name=<device name>][&write=rest]
// typed, pasted, or scanned from the QR code another device shows. The app removes it from the
// address bar at once.

export interface SetupRequest {
  repo: string;
  token: string;
  name?: string;
  write?: 'graphql' | 'rest';
}

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const TOKEN = /^[A-Za-z0-9_]{20,255}$/;

export type SetupParse = { ok: true; value: SetupRequest } | { ok: false; error: string };

/** The setup request in a URL hash; undefined when the hash isn't a setup link. */
export function parseSetupHash(hash: string): SetupParse | undefined {
  const m = /^#\/?setup(?:\?(.*))?$/.exec(hash);
  if (!m) return undefined;
  const params = new Map<string, string>();
  for (const part of (m[1] ?? '').split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    try {
      params.set(decodeURIComponent(part.slice(0, eq)), decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' ')));
    } catch {
      return { ok: false, error: 'the setup link is garbled' };
    }
  }
  return checkSetup({ repo: params.get('repo') ?? '', token: params.get('token') ?? '', name: params.get('name'), write: params.get('write') });
}

export function checkSetup(input: { repo: string; token: string; name?: string | undefined; write?: string | undefined }): SetupParse {
  const repo = input.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  const token = input.token.trim();
  if (!REPO.test(repo)) return { ok: false, error: 'the repo must be written owner/name, like skAeglund/repworks-data' };
  if (!TOKEN.test(token)) return { ok: false, error: "that doesn't look like a GitHub token (github_pat_…)" };
  const value: SetupRequest = { repo, token };
  const name = input.name?.trim();
  if (name) {
    if (name.length > 40 || /[\n\r]/.test(name)) return { ok: false, error: 'the device name must be one line of at most 40 characters' };
    value.name = name;
  }
  if (input.write !== undefined && input.write !== '') {
    if (input.write !== 'graphql' && input.write !== 'rest') return { ok: false, error: 'write must be graphql or rest' };
    value.write = input.write;
  }
  return { ok: true, value };
}

/** The setup link for another device, under the site's root (ending in /). */
export function setupLink(siteRoot: string, request: SetupRequest): string {
  const params: [string, string][] = [
    ['repo', request.repo],
    ['token', request.token],
  ];
  if (request.name) params.push(['name', request.name]);
  if (request.write && request.write !== 'graphql') params.push(['write', request.write]);
  return `${siteRoot}#setup?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

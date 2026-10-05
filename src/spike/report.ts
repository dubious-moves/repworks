// The spike's report: every check's outcome, kept in localStorage so it survives the Lichess
// redirect and a switch between the browser tab and the installed app. Secrets never enter it.

export interface Step {
  id: string;
  title: string;
  ok: boolean;
  at: string;
  where: string;
  ms?: number;
  detail: Record<string, unknown>;
}

const KEY = 'repworks-spike-report';
const secrets = new Set<string>();

/** Registers a value that must never appear in the report (tokens). */
export function secret(value: string | undefined | null): void {
  if (value && value.length >= 8) secrets.add(value);
}

export function redact<T>(value: T): T {
  if (typeof value === 'string') {
    let s: string = value;
    for (const token of secrets) s = s.split(token).join('<redacted>');
    return s as T;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = /^(authorization|token|access_token)$/i.test(k) ? '<redacted>' : redact(v);
    return out as T;
  }
  return value;
}

export function displayMode(): string {
  return matchMedia('(display-mode: standalone)').matches ? 'installed app (standalone)' : 'browser tab';
}

export function loadSteps(): Step[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Step[]) : [];
  } catch {
    return [];
  }
}

let listener: ((steps: Step[]) => void) | null = null;
export function onSteps(fn: (steps: Step[]) => void): void {
  listener = fn;
  fn(loadSteps());
}

export function record(step: Omit<Step, 'at' | 'where'>): Step {
  const full: Step = redact({ ...step, at: new Date().toISOString(), where: displayMode() });
  const steps = loadSteps();
  steps.push(full);
  localStorage.setItem(KEY, JSON.stringify(steps));
  listener?.(steps);
  return full;
}

export function clearSteps(): void {
  localStorage.removeItem(KEY);
  listener?.([]);
}

export function environment(): Record<string, unknown> {
  const uaData = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[]; mobile: boolean; platform: string } }).userAgentData;
  return {
    page: location.origin + location.pathname,
    displayMode: displayMode(),
    userAgent: navigator.userAgent,
    brands: uaData?.brands.map((b) => `${b.brand} ${b.version}`),
    mobile: uaData?.mobile,
    platform: uaData?.platform,
    online: navigator.onLine,
    serviceWorkerControlled: navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined,
  };
}

export function fullReport(build: string): string {
  return JSON.stringify(redact({ spike: 1, build, generatedAt: new Date().toISOString(), environment: environment(), steps: loadSteps() }), null, 1);
}

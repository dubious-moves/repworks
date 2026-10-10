// The look (src/ui/themes.css): which theme this device shows, kept in localStorage like the other
// per-device preferences. index.html sets it before the first paint from the same key; this keeps
// it, the browser's bar colour and the colour scheme in step afterwards.
import { signal } from '@preact/signals';

export const THEMES = [
  { id: 'forest', name: 'Forest', note: 'the original: dark green' },
  { id: 'slate', name: 'Slate', note: 'neutral dark, blue accent' },
  { id: 'walnut', name: 'Walnut', note: 'warm browns, amber' },
  { id: 'midnight', name: 'Midnight', note: 'black, high contrast' },
  { id: 'paper', name: 'Paper', note: 'light' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

/** Read by index.html's inline script too: keep the two in step. */
export const THEME_KEY = 'repworks-theme';

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/** A theme asked for in the address (`?theme=paper`): the styles gallery's frames; shown, not kept. */
export function themeInAddress(): ThemeId | undefined {
  try {
    const asked = new URLSearchParams(location.search).get('theme');
    return isTheme(asked) ? asked : undefined;
  } catch {
    return undefined;
  }
}

function load(): ThemeId {
  const asked = themeInAddress();
  if (asked) return asked;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isTheme(raw) ? raw : 'forest';
  } catch {
    return 'forest';
  }
}

export const theme = signal<ThemeId>(load());

/** Puts the theme on <html>, with the phone's bar colour and the scheme its controls are drawn in. */
export function applyTheme(id: ThemeId = theme.peek()): void {
  const root = document.documentElement;
  root.dataset.theme = id;
  const css = getComputedStyle(root);
  const bar = css.getPropertyValue('--theme-color').trim();
  const scheme = css.getPropertyValue('--scheme').trim();
  if (bar) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
  if (scheme) document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', scheme);
}

export function setTheme(id: ThemeId): void {
  theme.value = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // kept for this page only
  }
  applyTheme(id);
}

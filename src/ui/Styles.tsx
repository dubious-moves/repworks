// The styles gallery (styles.html): the app itself in a frame per theme, side by side, at a
// phone's or a desktop's size. Each frame is the real app on this device's data, shown in its
// theme (`?theme=`) and never syncing (`&preview`); the frames follow each other, so a screen
// opened or a move stepped to in one is shown in all of them.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { setTheme, THEMES, type ThemeId } from '../app/theme.ts';

const SIZES = {
  phone: { name: 'Phone', width: 412, height: 860 },
  desktop: { name: 'Desktop', width: 1366, height: 860 },
} as const;
type Size = keyof typeof SIZES;

const SCREENS: readonly { name: string; hash: string }[] = [
  { name: 'Studies', hash: '#/' },
  { name: 'Train', hash: '#/train' },
  { name: 'Mistakes', hash: '#/mistakes' },
  { name: 'Storm', hash: '#/storm' },
  { name: 'Games', hash: '#/games' },
  { name: 'Analysis', hash: '#/analysis' },
  { name: 'Import', hash: '#/import' },
];

/** The narrowest a column gets before the row scrolls sideways instead. */
const MIN_COLUMN = 300;
const GAP = 12;

const PREFS_KEY = 'repworks-styles';
type Prefs = { themes: ThemeId[]; size: Size; hash: string };

function loadPrefs(): Prefs {
  const all: Prefs = { themes: THEMES.map((t) => t.id), size: 'phone', hash: '#/' };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    const themes = (saved.themes ?? all.themes).filter((id) => THEMES.some((t) => t.id === id));
    return {
      themes: themes.length > 0 ? themes : all.themes,
      size: saved.size && saved.size in SIZES ? saved.size : all.size,
      hash: typeof saved.hash === 'string' && saved.hash.startsWith('#') ? saved.hash : all.hash,
    };
  } catch {
    return all;
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // kept for this page only
  }
}

export function Styles() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const update = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  const frames = useRef(new Map<ThemeId, HTMLIFrameElement>());
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [chosen, setChosen] = useState<ThemeId | undefined>(undefined);
  const size = SIZES[prefs.size];

  // The row's width, for the frames' scale.
  useLayoutEffect(() => {
    const el = row.current!;
    const seen = new ResizeObserver(() => setWidth(el.clientWidth));
    seen.observe(el);
    setWidth(el.clientWidth);
    return () => seen.disconnect();
  }, []);

  // The frames follow each other: the first whose address moved leads, the others go there.
  // Polled, since the app moves through a line with replaceState, which fires no event.
  const shared = useRef(prefs.hash);
  useEffect(() => {
    const timer = setInterval(() => {
      let led: string | undefined;
      for (const f of frames.current.values()) {
        const hash = hashOf(f);
        if (hash !== undefined && hash !== shared.current) {
          led = hash;
          break;
        }
      }
      if (led === undefined) return;
      shared.current = led;
      for (const f of frames.current.values()) if (hashOf(f) !== led) go(f, led);
      update({ hash: led });
    }, 300);
    return () => clearInterval(timer);
  }, []);

  const show = (hash: string) => {
    shared.current = hash;
    for (const f of frames.current.values()) go(f, hash);
    update({ hash });
  };

  const n = prefs.themes.length;
  const column = Math.max(MIN_COLUMN, Math.floor((width - GAP * (n - 1)) / Math.max(n, 1)));
  const scale = Math.min(1, column / size.width);

  return (
    <div class="styles">
      <header class="styles-bar">
        <h1>Themes side by side</h1>
        <fieldset class="styles-themes">
          <legend>Themes</legend>
          {THEMES.map((t) => (
            <label key={t.id} title={t.note}>
              <input
                type="checkbox"
                checked={prefs.themes.includes(t.id)}
                onChange={(e) =>
                  update({ themes: e.currentTarget.checked ? THEMES.map((x) => x.id).filter((id) => id === t.id || prefs.themes.includes(id)) : prefs.themes.filter((id) => id !== t.id) })
                }
              />{' '}
              {t.name}
            </label>
          ))}
        </fieldset>
        <fieldset class="styles-size">
          <legend>Size</legend>
          {(Object.keys(SIZES) as Size[]).map((k) => (
            <label key={k}>
              <input type="radio" name="size" checked={prefs.size === k} onChange={() => update({ size: k })} /> {SIZES[k].name}
            </label>
          ))}
        </fieldset>
        <nav class="styles-screens" aria-label="Screens">
          {SCREENS.map((s) => (
            <button key={s.hash} type="button" class="secondary" onClick={() => show(s.hash)}>
              {s.name}
            </button>
          ))}
        </nav>
        <p class="muted">
          Each frame is the app on this device's data, in one theme; it doesn't sync. Open a screen or step through a line in any frame and the others follow. Edits made
          here are this device's like any other and sync from the app.{' '}
          <a href={`${import.meta.env.BASE_URL}${prefs.hash}`}>Back to the app</a>
        </p>
      </header>
      <div class="styles-row" ref={row} style={{ gap: `${GAP}px` }}>
        {prefs.themes.map((id) => {
          const t = THEMES.find((x) => x.id === id)!;
          return (
            <section key={id} class="styles-col" style={{ width: `${column}px` }} aria-label={t.name}>
              <div class="styles-col-head">
                <strong>{t.name}</strong> <span class="muted">{t.note}</span>
                <button
                  type="button"
                  class="secondary"
                  onClick={() => {
                    setTheme(id);
                    setChosen(id);
                  }}
                >
                  {chosen === id ? 'Chosen ✓' : 'Use this one'}
                </button>
              </div>
              <div class="styles-frame" style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}>
                <Frame
                  id={id}
                  title={`Repworks in ${t.name}`}
                  hash={shared.current}
                  width={size.width}
                  height={size.height}
                  scale={scale}
                  register={(el) => {
                    if (el) frames.current.set(id, el);
                    else frames.current.delete(id);
                  }}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** One theme's frame. Its address is set once: the frames move by their hash, never by a reload. */
function Frame(props: { id: ThemeId; title: string; hash: string; width: number; height: number; scale: number; register(el: HTMLIFrameElement | null): void }) {
  const [src] = useState(() => `${import.meta.env.BASE_URL}?theme=${props.id}&preview${props.hash}`);
  return (
    <iframe
      title={props.title}
      data-theme-frame={props.id}
      src={src}
      ref={props.register}
      style={{ width: `${props.width}px`, height: `${props.height}px`, transform: `scale(${props.scale})` }}
    />
  );
}

/** A frame's address hash, once its page is the app's (undefined while it loads). */
function hashOf(f: HTMLIFrameElement): string | undefined {
  try {
    const l = f.contentWindow?.location;
    return l && l.href !== 'about:blank' ? l.hash || '#/' : undefined;
  } catch {
    return undefined;
  }
}

function go(f: HTMLIFrameElement, hash: string): void {
  try {
    if (f.contentWindow) f.contentWindow.location.hash = hash;
  } catch {
    // not loaded yet: its src carries the hash
  }
}

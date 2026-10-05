import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, transformWithOxc, type Plugin } from 'vite';

// The site is served at https://dubious-moves.github.io/repworks/ (D17).
const BASE = '/repworks/';

export default defineConfig({
  base: BASE,
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      input: { main: 'index.html' },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  plugins: [serviceWorker()],
});

/** The commit the site was built from: GitHub's in CI, else git's, with `+` for local changes. */
function buildId(): string {
  const git = (command: string): string => {
    try {
      return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const sha = process.env.GITHUB_SHA ?? git('git rev-parse HEAD');
  const dirty = !process.env.GITHUB_SHA && git('git status --porcelain') !== '' ? '+' : '';
  return (sha ? sha.slice(0, 7) : 'unknown') + dirty;
}

/**
 * Builds src/sw/sw.ts into sw.js, preceded by the list of files to precache and a version hash
 * over all of them. Content-hashed files under assets/ are listed by name alone; the rest carry
 * a hash of their content, which the worker uses to bypass stale caches (see sw.ts).
 */
function serviceWorker(): Plugin {
  return {
    name: 'repworks:service-worker',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const files = new Map<string, string | Uint8Array>();
      for (const [file, item] of Object.entries(bundle)) {
        if (file.endsWith('.map') || file === 'sw.js') continue;
        files.set(file, item.type === 'chunk' ? item.code : item.source);
      }
      for (const file of listFiles('public')) files.set(file, readFileSync(join('public', file)));

      const precache: { url: string; rev: string | null }[] = [];
      const version = createHash('sha256');
      for (const file of [...files.keys()].sort()) {
        const rev = file.startsWith('assets/') ? null : sha256(files.get(file)!).slice(0, 16);
        precache.push({ url: `./${file}`, rev });
        version.update(`${file}\0${rev ?? ''}\n`);
      }
      if (!files.has('index.html')) this.error('index.html is missing from the bundle');

      const source = readFileSync('src/sw/sw.ts', 'utf8');
      const { code } = await transformWithOxc(source, 'src/sw/sw.ts', { target: 'es2022' });
      const header =
        `const __PRECACHE__ = ${JSON.stringify(precache)};\n` +
        `const __VERSION__ = ${JSON.stringify(version.digest('hex').slice(0, 16))};\n`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: header + code });
    },
  };
}

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(dir, `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

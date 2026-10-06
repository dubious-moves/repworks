import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
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
    // Every browser the site supports preloads modules natively.
    modulePreload: { polyfill: false },
    rolldownOptions: {
      // spike.html is the throwaway remote spike (PLAN.md §4.2).
      input: { main: 'index.html', spike: 'spike.html' },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  resolve: {
    // onnxruntime-web's build that loads its wasm and glue from `env.wasm.wasmPaths` (§5.32): the
    // default one points at its wasm with `new URL(…, import.meta.url)`, which the build would
    // copy into assets/ and the shell would precache.
    alias: { 'onnxruntime-web/wasm': resolve('node_modules/onnxruntime-web/dist/ort.wasm.min.mjs') },
  },
  plugins: [engines(), serviceWorker()],
  // Maia's worker reads the engines' URLs too (§5.32).
  worker: { format: 'es', plugins: () => [engines()] },
});

/**
 * The engines and the model (PLAN.md §5.29): vendored files and onnxruntime-web's wasm, emitted
 * under engines/ with a hash of their content in the name, and listed by the virtual module
 * `virtual:repworks-engines` (their URLs and sizes). They stay out of the shell's precache: the
 * app downloads them when first used, into a cache of their own (src/platform/blobs.ts). In dev
 * they are served from where they lie.
 */
const ENGINE_FILES: Record<string, string> = {
  stockfishJs: 'vendor/stockfish/stockfish-18-lite-single.js',
  stockfishWasm: 'vendor/stockfish/stockfish-18-lite-single.wasm',
  stockfishMtJs: 'vendor/stockfish/stockfish-18-lite.js',
  stockfishMtWasm: 'vendor/stockfish/stockfish-18-lite.wasm',
  maiaModel: 'vendor/maia/maia3_simplified.onnx',
  ortWasm: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
  ortMjs: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
};
const ENGINES_DIR = 'engines/';
const ENGINES_ID = 'virtual:repworks-engines';

function engines(): Plugin {
  let serve = false;
  return {
    name: 'repworks:engines',
    configResolved(config) {
      serve = config.command === 'serve';
    },
    resolveId(id) {
      return id === ENGINES_ID ? '\0' + ENGINES_ID : undefined;
    },
    load(id) {
      if (id !== '\0' + ENGINES_ID) return undefined;
      const out: Record<string, { url: string; bytes: number }> = {};
      for (const [key, file] of Object.entries(ENGINE_FILES)) {
        const source = readFileSync(file);
        let url: string;
        if (serve) url = `${BASE}@fs${resolve(file)}`;
        else {
          const name = basename(file);
          const dot = name.indexOf('.');
          const fileName = `${ENGINES_DIR}${name.slice(0, dot)}.${sha256(source).slice(0, 10)}${name.slice(dot)}`;
          this.emitFile({ type: 'asset', fileName, source });
          url = BASE + fileName;
        }
        out[key] = { url, bytes: source.length };
      }
      return `export const ENGINES = ${JSON.stringify(out)};\n`;
    },
  };
}

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
      const engineFiles: string[] = [];
      const version = createHash('sha256');
      for (const file of [...files.keys()].sort()) {
        // Content-hashed and large: cached when first used, never precached (§5.29).
        if (file.startsWith(ENGINES_DIR)) {
          engineFiles.push(`./${file}`);
          version.update(`${file}\n`);
          continue;
        }
        const rev = file.startsWith('assets/') ? null : sha256(files.get(file)!).slice(0, 16);
        precache.push({ url: `./${file}`, rev });
        version.update(`${file}\0${rev ?? ''}\n`);
      }
      if (!files.has('index.html')) this.error('index.html is missing from the bundle');

      const source = readFileSync('src/sw/sw.ts', 'utf8');
      const { code } = await transformWithOxc(source, 'src/sw/sw.ts', { target: 'es2022' });
      const header =
        `const __PRECACHE__ = ${JSON.stringify(precache)};\n` +
        `const __ENGINES__ = ${JSON.stringify(engineFiles)};\n` +
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

# Stockfish 18 and 19, lite (vendored)

`stockfish-18-lite-single.js` and `stockfish-18-lite-single.wasm` are Stockfish.js 18 by Nathan
Rugg and Chess.com (https://github.com/nmrugg/stockfish.js), a WebAssembly build of Stockfish
(https://github.com/official-stockfish/Stockfish, by the Stockfish developers listed in
`AUTHORS`), with the small net `nn-9067e33176e8` by Linmiao Xu. Licence: GPL-3.0 (`Copying.txt`),
the licence of this repository too.

Taken from the npm package `stockfish@18.0.0` (`src/`), unchanged. They are byte-identical to the
build mistake-lab serves (`engine/`), PLAN.md §5.29.

| File | Bytes | sha256 |
| --- | --- | --- |
| `stockfish-18-lite-single.js` | 20,670 | `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe` |
| `stockfish-18-lite-single.wasm` | 7,295,411 | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |
| `stockfish-18-lite.js` | 32,109 | `f79e667c9d56ee768aca35e8343f91548ceef6a732f67cd82f267cf9eab7f665` |
| `stockfish-18-lite.wasm` | 7,093,151 | `d50136919dcd90e75eb8df78b255d47d618962b670028b38961343f6eb409174` |

`stockfish-18-lite.{js,wasm}` is the multi-threaded build of the same engine and net, from the same
package (§5.36): it needs `SharedArrayBuffer`, so a page that is cross-origin isolated, which
the site's service worker makes it when more than one thread is chosen.

## Stockfish 19 (an option, PLAN.md §5.75)

`stockfish-19-lite-single.{js,wasm}` and `stockfish-19-lite.{js,wasm}` are the same builds of
Stockfish.js 19, with the small net `nn-61e7af4bb97d`, from the npm package `stockfish@19.0.0`
(`bin/`), unchanged. Same authors and licence (its `Copying.txt` is the same file as the one here).

| File | Bytes | sha256 |
| --- | --- | --- |
| `stockfish-19-lite-single.js` | 21,415 | `d3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6` |
| `stockfish-19-lite-single.wasm` | 1,787,571 | `57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387` |
| `stockfish-19-lite.js` | 32,817 | `2f98d35d20bf435c16925f8955fe4b0c2062e66962799a407667218ff9ea709d` |
| `stockfish-19-lite.wasm` | 1,636,291 | `18727c9ade11a8ca04391ab5a298232bc6fffebe2002e7cfffac82e7ad453447` |

The site serves them under content-hashed names and downloads them when the engine is first
switched on (vite.config.ts, `src/platform/blobs.ts`). The worker finds its wasm from the hash of
its own URL (`new Worker('<js>#<wasm url>')`).

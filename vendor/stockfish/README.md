# Stockfish 18, lite, single-threaded (vendored)

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

The site serves them under content-hashed names and downloads them when the engine is first
switched on (vite.config.ts, `src/platform/blobs.ts`). The worker finds its wasm from the hash of
its own URL (`new Worker('<js>#<wasm url>')`).

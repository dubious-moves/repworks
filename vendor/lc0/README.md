# Lc0's network 791556 (vendored, converted)

`791556.onnx` is Lc0's network `791556.pb.gz`, the one bundled with every Lc0 v0.32.1 release
package, converted to ONNX by `scripts/lc0-onnx.mjs` (a port of Lc0's own `leela2onnx`,
`src/neural/onnx/converter.cc` at v0.32.1). Lc0 and its networks are the work of the LCZero
project, https://lczero.org/ and https://github.com/LeelaChessZero/lc0, licensed GPL-3.0-or-later
(the release package's `COPYING`); this repository is GPL-3.0-or-later. All credit to them.

| File | Bytes | sha256 |
| --- | --- | --- |
| `lc0-v0.32.1-windows-cpu-dnnl.zip` (the release asset it came from) | 23,877,464 | `b9cfcfbd3dabffbfd452f6e8e087c22273721bef48eba19640b6d92006c142f5` |
| `791556.pb.gz` (in that zip) | 18,648,209 | `b1c7047582a8ad37620849bf328935cb46f2ccbbecb7f2696c30c6b913ed690d` |
| `791556.onnx` (this file) | 21,662,220 | `6d2440635e00e99c1ea63246c138d9b32b55228ac03133a163f3313608087263` |

The network: 15 residual blocks of 192 filters with squeeze-and-excitation, Mish, the classical
112 input planes, an attention policy head and a win/draw/loss value head (its moves-left head is
left out of the ONNX file). The weights are stored as float16 and cast to float32 on load.

Reproduce (the conversion is deterministic):

    node scripts/lc0-onnx.mjs 791556.pb.gz <lc0 checkout at v0.32.1> vendor/lc0/791556.onnx

Input `input [B, 112, 8, 8]`; outputs `policy [B, 1858]` (logits) and `wdl [B, 3]` (win, draw,
loss for the side to move). The encoding is in `src/core/lc0/encode.ts`. The site downloads the
file only when Lc0 is switched on, after asking (`src/platform/blobs.ts`).

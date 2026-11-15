# Maia 3 (vendored)

`maia3_simplified.onnx` is the Maia 3 model of the CSSLab at the University of Toronto, from
their Maia platform, https://github.com/CSSLab/maia-platform-frontend
(`public/maia3/maia3_simplified.onnx` at commit `a6e52f5c811ee18863cb2f0e81f2433a5b9905de`).
That repository is licensed GPL-3.0 and has no separate licence for the model (DECISIONS.md D11);
this repository is GPL-3.0-or-later. All credit for the model goes to its authors; see
https://www.maiachess.com/ and their papers:

- R. McIlroy-Young, S. Sen, J. Kleinberg, A. Anderson, "Aligning Superhuman AI with Human
  Behavior: Chess as a Model System", KDD 2020.
- The Maia-2 and Maia 3 work of the same lab (maiachess.com lists the current papers).

| File | Bytes | sha256 |
| --- | --- | --- |
| `maia3_simplified.onnx` | 45,683,686 | `405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856` |

The same file as mistake-lab's `maia/`, q_extension's pin (`tools/repgen/maia.mjs`) and the one
Qchess downloads (CSSLab commit `0013cc8`), all checked by sha256 (PLAN.md §5.29).

Inputs `tokens [B, 64, 12]`, `elo_self [B]`, `elo_oppo [B]`; outputs `logits_move [B, 4352]` and
`logits_value [B, 3]` (loss, draw, win for the side to move). The encoding is in
`src/core/maia/encode.ts`. The site downloads the file only when Maia is switched on, after
asking (`src/platform/blobs.ts`).

## The official 23M model (an option, PLAN.md §5.188)

`maia3-23m.onnx` is the CSSLab's official Maia3 23M (https://github.com/CSSLab/maia3 at commit
`1e13597c42d4858b7cfd7cfdae01e297263364b2`; weights from https://huggingface.co/UofTCSSLab/Maia3-23M,
`maia3-23m.pt`, 91,799,307 bytes, sha256
`bce6cd1af5f0399ac7eed33fabb7a6a2ef6193662c2740f262bf93af7bfb3569`, repository revision
`51a0145a8178046f7de23119160b136672deeb2b`), exported to ONNX by `scripts/maia3-export.py` with
`--half`: the official model code and checkpoint, `RMSNorm` written out in plain arithmetic, the
weights stored as float16 with a cast to float32 after each. All credit for the model goes to
its authors.

**Licence: AGPL-3.0**, as the official repository (its `LICENSE`); the model card says "see repo
for code/weights license". It is distributed here under that licence, beside this repository's
GPL-3.0-or-later code (GPLv3 §13).

| File | Bytes | sha256 |
| --- | --- | --- |
| `maia3-23m.onnx` | 45,849,609 | `1c85291ddfad7f6ab37e72fa2bb366fe627cac585d6c084ab0ac9ee69891f4d5` |

Inputs `tokens [B, 64, 96]` (the last eight positions, oldest first, each from its own side to
move's view; `maiaHistoryTokens` in `src/core/maia/encode.ts`), `elo_self [B]`, `elo_oppo [B]`
(float32); outputs `logits_move [B, 4352]` and `logits_value [B, 3]`, laid out as the first
model's. To make it again: a checkout of CSSLab/maia3, the checkpoint, Python with torch, onnx,
onnxruntime and python-chess, then
`python -I scripts/maia3-export.py <checkout> maia3-23m.pt maia3-23m vendor/maia/maia3-23m.onnx --half`
(the export's bytes may differ with the torch version; its check against PyTorch is printed).
The reference the tests read: `scripts/maia3-reference.py`.


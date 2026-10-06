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

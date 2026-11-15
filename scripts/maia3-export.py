"""Exports an official Maia-3 checkpoint (CSSLab/maia3) to ONNX for repworks (PLAN.md §5.188).

    python -I maia3_export.py <maia3 checkout> <checkpoint.pt> <model name, e.g. maia3-23m> <out.onnx> [--half]

The graph takes what the vendored Maia 3 takes, with the history: `tokens [B, 64, 96]` (the last
eight positions' one-hot pieces, oldest first, each from its own side to move's view), `elo_self`
and `elo_oppo` `[B]` as float32; it gives `logits_move [B, 4352]` and `logits_value [B, 3]`.
`--half` stores the weights as float16 with a Cast to float32 after each (half the download; the
arithmetic stays float32, onnxruntime folds the casts when it loads the model). The export is
checked against PyTorch on positions from random games before it is written.
"""
import sys, types, random
import numpy as np

repo, ckpt_path, name, out_path = sys.argv[1:5]
half = '--half' in sys.argv[5:]
sys.path.insert(0, repo)

import torch, onnx, chess
import onnxruntime as ort
from onnx import numpy_helper, helper, TensorProto
from maia3.models import MAIA3Model
from maia3.model_registry import MODEL_SPECS
from maia3.dataset import tokenize_board, get_historical_tokens

spec = next(s for s in MODEL_SPECS if s.name == name)
cfg = types.SimpleNamespace(**spec.config)
model = MAIA3Model(cfg)
ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=True)
state = ckpt['model_state_dict'] if isinstance(ckpt, dict) and 'model_state_dict' in ckpt else ckpt
state = {k.replace('smolgen', 'gab'): v for k, v in state.items()}
missing, unexpected = model.load_state_dict(state, strict=False)
assert not missing and not unexpected, (missing, unexpected)
model.eval()
print('parameters', sum(p.numel() for p in model.parameters()))


class Rms(torch.nn.Module):
    """torch.nn.RMSNorm in plain arithmetic: the exporter has no rule for it."""

    def __init__(self, norm):
        super().__init__()
        self.weight = norm.weight
        self.eps = norm.eps if norm.eps is not None else torch.finfo(torch.float32).eps

    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.weight


def plain(module):
    for child_name, child in module.named_children():
        if isinstance(child, torch.nn.RMSNorm):
            setattr(module, child_name, Rms(child))
        else:
            plain(child)


class Wrapped(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, tokens, elo_self, elo_oppo):
        moves, value, _ = self.m(tokens, elo_self, elo_oppo)
        return moves, value


def sample(n, seed=1):
    """Positions from random games, with their real history (up to eight positions) and without."""
    rng = random.Random(seed)
    rows, fens = [], []
    while len(rows) < n:
        board = chess.Board()
        hist = [tokenize_board(board)]
        for _ in range(rng.randrange(1, 80)):
            moves = list(board.legal_moves)
            if not moves:
                break
            board.push(rng.choice(moves))
            hist.append(tokenize_board(board))
        if board.is_game_over():
            continue
        h = hist[-cfg.history:] if len(rows) % 2 == 0 else hist[-1:]
        t = get_historical_tokens(h, cfg, 0.0, 0.0, 0.0, 0.0)[:, : 12 * cfg.history]
        rows.append(t)
        fens.append(board.fen())
    elos = torch.tensor([rng.choice([600, 1100, 1500, 1900, 2300, 2600]) for _ in rows], dtype=torch.float32)
    return torch.stack(rows), elos, fens


tokens, elos, fens = sample(64, seed=7)
with torch.no_grad():
    official = model(tokens, elos, elos)
plain(model)
wrapped = Wrapped(model)
with torch.no_grad():
    tm, tv = wrapped(tokens, elos, elos)
print('plain arithmetic against the official modules: max |logit| difference', float((official[0] - tm).abs().max()), float((official[1] - tv).abs().max()))
torch.onnx.export(wrapped, (tokens[:4], elos[:4], elos[:4]), out_path, input_names=['tokens', 'elo_self', 'elo_oppo'], output_names=['logits_move', 'logits_value'],
                  dynamic_axes={k: {0: 'batch'} for k in ['tokens', 'elo_self', 'elo_oppo', 'logits_move', 'logits_value']}, opset_version=17, dynamo=False)
m = onnx.load(out_path)
if half:
    casts, n = [], 0
    for init in m.graph.initializer:
        if init.data_type != TensorProto.FLOAT or numpy_helper.to_array(init).size < 1024:
            continue
        arr = numpy_helper.to_array(init)
        stored = init.name + '_f16'
        casts.append(helper.make_node('Cast', [stored], [init.name], to=TensorProto.FLOAT, name='cast_' + init.name))
        init.CopyFrom(numpy_helper.from_array(arr.astype(np.float16), stored))
        n += 1
    for c in reversed(casts):
        m.graph.node.insert(0, c)
    print('float16 initializers', n)
m.producer_name = 'repworks maia3_export.py'
m.doc_string = f'{spec.display_name} (https://huggingface.co/{spec.repo_id}), exported from the official checkpoint; AGPL-3.0 as https://github.com/CSSLab/maia3'
onnx.checker.check_model(m)
onnx.save(m, out_path)

# Checked against PyTorch: every legal move's probability, and the value's.
sess = ort.InferenceSession(out_path, providers=['CPUExecutionProvider'])
om, ov = sess.run(None, {'tokens': tokens.numpy(), 'elo_self': elos.numpy(), 'elo_oppo': elos.numpy()})
# One at a time too: the batch axis is dynamic.
om1, _ = sess.run(None, {'tokens': tokens[:1].numpy(), 'elo_self': elos[:1].numpy(), 'elo_oppo': elos[:1].numpy()})
print('max |logit| difference: moves', float(np.abs(tm.numpy() - om).max()), 'value', float(np.abs(tv.numpy() - ov).max()), 'alone', float(np.abs(om[:1] - om1).max()))
pt, po = torch.softmax(tm, -1).numpy(), torch.softmax(torch.tensor(om), -1).numpy()
print('max probability difference', float(np.abs(pt - po).max()), 'same top move', int((pt.argmax(-1) == po.argmax(-1)).sum()), 'of', len(fens))

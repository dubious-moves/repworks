"""The 23M Maia-3's answers by the official code, for test/unit/engine/maia23.test.ts (PLAN.md §5.188).

    python -I maia3-reference.py <maia3 checkout> <maia3-23m.pt> > test/fixtures/maia/reference-23m.json

24 positions from seeded games (a few book moves, then moves picked at random), half with the
positions that led to them (up to seven), half alone, and the starting position; tokens, legal moves and probabilities all by
CSSLab/maia3's own functions on the PyTorch checkpoint.
"""
import sys, types, random, json

repo, ckpt_path = sys.argv[1:3]
sys.path.insert(0, repo)
import torch, chess
from maia3.models import MAIA3Model
from maia3.model_registry import MODEL_SPECS
from maia3.dataset import tokenize_board, get_historical_tokens, get_legal_moves_mask
from maia3.utils import get_all_possible_moves, mirror_move

spec = next(s for s in MODEL_SPECS if s.name == 'maia3-23m')
cfg = types.SimpleNamespace(**spec.config)
model = MAIA3Model(cfg)
ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=True)
state = ckpt['model_state_dict'] if isinstance(ckpt, dict) and 'model_state_dict' in ckpt else ckpt
model.load_state_dict({k.replace('smolgen', 'gab'): v for k, v in state.items()})
model.eval()
all_moves = get_all_possible_moves()
index = {m: i for i, m in enumerate(all_moves)}

BOOK = ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7', 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1', 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5']
rng = random.Random(23)
out = []
while len(out) < 25:
    board = chess.Board()
    fens = [board.fen()]
    # The last one: the starting position alone at 1100 (the browser test's, test/e2e/maia.spec.ts).
    start = len(out) == 24
    for u in [] if start else BOOK[len(out) % len(BOOK)].split():
        board.push_uci(u)
        fens.append(board.fen())
    for _ in range(0 if start else rng.randrange(0, 60)):
        moves = list(board.legal_moves)
        if not moves:
            break
        captures = [m for m in moves if board.is_capture(m)]
        board.push(rng.choice(captures if captures and rng.random() < 0.5 else moves))
        fens.append(board.fen())
    if board.is_game_over():
        continue
    with_history = len(out) % 2 == 0 and not start
    keep = fens[-cfg.history:] if with_history else fens[-1:]
    hist = [tokenize_board(chess.Board(f)) for f in keep]
    tokens = get_historical_tokens(hist, cfg, 0.0, 0.0, 0.0, 0.0).unsqueeze(0)
    elo = 1100 if start else rng.choice([800, 1100, 1500, 1900, 2300, 2600])
    with torch.no_grad():
        logits, value, _ = model(tokens, torch.tensor([elo]), torch.tensor([elo]))
    mask = get_legal_moves_mask(board, index)
    probs = torch.softmax(logits[0].masked_fill(~mask, float('-inf')), -1)
    top = torch.topk(probs, k=min(5, int(mask.sum())))
    uci = lambda i: all_moves[i] if board.turn == chess.WHITE else mirror_move(all_moves[i])
    out.append({'fens': keep, 'elo': elo, 'top5': [{'uci': uci(int(i)), 'prob': round(float(p), 6)} for p, i in zip(top.values, top.indices)], 'value': [round(float(v), 5) for v in value[0]]})
json.dump(out, sys.stdout, indent=1)

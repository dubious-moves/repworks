import json, sys
S = '/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
import subprocess
P = "1. Nc3 d5 2. d4 Nf6 3. Bf4 Bf5 4. e3"
N = P + " Nc6 5. Nb5"
E = P + " e6 5. Nf3"
D = E + " Bd6 6. Ne5"
DO = D + " O-O 7. g4"
DN = D + " Nbd7 7. Be2"
B = E + " Bb4 6. Bd3"
C5 = E + " c5 6. Nb5"
NA = C5 + " Na6 7. c3"
NAE = NA + " Be7 8. Ne5 O-O 9. g4"
QA = C5 + " Qa5+ 7. b4"
C = P + " c6 5. Nf3"
CE = C + " e6 6. Ne5"
CN = CE + " Nbd7 7. g4"
CD = CE + " Bd6 7. g4"

cut = [
  N + " e5 6. dxe5 Nh5", N + " e5 6. dxe5 Ne4 7. e6 Bd6", N + " e5 6. dxe5 Ne4 7. e6 Nd6", N + " Rc8 6. Bd3 Bxd3",
  E + " Be7", E + " Nbd7", E + " h6", E + " Nc6",
] + [D + " " + m for m in ["Bxe5", "Nc6", "Ne4", "h6", "Nfd7"]] + [
  DO + " Be4",
  DO + " Bg6 8. h4 h5 9. gxh5 Bxh5 10. Be2 Bxe2 11. Qxe2 Nbd7",
  DO + " Bg6 8. h4 h6 9. g5 Nh5",
  DO + " Bxe5 8. dxe5 Bxg4",
  DO + " Bxe5 8. dxe5 Nxg4 9. f3 Qh4+",
  DN + " Bxe5", DN + " h6", DN + " Ne4 8. Nxe4 Bxe4 9. f3 Bg6", DN + " O-O 8. g4 Bg6", DN + " O-O 8. g4 Be4",
] + [B + " " + m for m in ["Bg6", "Bg4", "Bxc3+", "O-O", "Be4"]] + [
  B + " Ne4 7. O-O Bxc3", B + " Ne4 7. O-O Nxc3 8. bxc3 Bxc3 9. Rb1 b6", B + " Ne4 7. O-O Nxc3 8. bxc3 Bxc3 9. Rb1 Bxd3",
] + [NA + " " + m for m in ["c4", "Nh5", "cxd4"]] + [
  NAE + " Be4", NAE + " Bg6 10. h4 h5", NAE + " Bg6 10. h4 h6",
  QA + " Qxb4+ 8. c3 Qb2", QA + " Qxb4+ 8. c3 Qa5 9. Nc7+ Kd7", QA + " Qxb4+ 8. c3 Qa5 9. Nc7+ Kd8",
  QA + " cxb4 8. Nc7+ Kd8", QA + " cxb4 8. Nc7+ Kd7",
  C + " Nbd7", C + " h6",
] + [CE + " " + m for m in ["Be7", "Bb4", "h6"]] + [
  CN + " Nxe5", CN + " Be4", CN + " Bg6 8. h4 Nxe5", CN + " Bg6 8. h4 h6",
  CN + " Bg6 8. h4 h5 9. Nxg6 fxg6 10. Bd3 Kf7 11. g5 Ng8",
  CD + " Bxe5", CD + " Bg6 8. h4 h6", CD + " Bg6 8. h4 Bxe5",
]


com = [
 (N + " e5 6. dxe5",
  "...e5 gave a pawn so that a pawn on e5 blocks our f4-bishop's path to c7. Against ...Ne4 and ...Nd7, e6 clears the path again with tempo: Nxc7+ and exf7+ are both threats.\n"
  "...Nh5 just drops the knight to the queen: (6... Nh5 7. Qxh5)"),
 (N + " e5 6. dxe5 Ne4 7. e6",
  "...Bd6 and ...Nd6 block the bishop's path to c7, but lose the f7-pawn with check, and Qxd5+ also hits the e4-knight: (7... Bd6 8. exf7+ Kxf7 9. Qxd5+) (7... Nd6 8. exf7+)"),
 (N + " e5 6. dxe5 Nd7 7. e6",
  "e6 hits the d7-knight and f7. After ...Nde5, the knight blocks the f4-bishop's path to c7 again, so take on f7 with check. "
  "After ...fxe6, Nxc7+ forks king and rook, and ...Qxc7 loses the queen to Bxc7.\n"
  "(7... Nde5 8. exf7+) (7... fxe6 8. Nxc7+)"),
 (N + " Rc8 6. Bd3",
  "After ...Bxd3, take back with the c-pawn. Against ...a6 or ...e6, take on f5 first: after ...axb5, the f5-bishop takes the c8-rook.\n"
  "(6... Bg6 7. Nf3) (6... a6 7. Bxf5 axb5 8. Bxc8) (6... e6 7. Bxf5)"),
 (E,
  "The rarer moves:\n"
  "Against ...Be7, the same plan as against ...Bd6, Ne5 and g4: (5... Be7 6. Ne5 O-O 7. g4)\n"
  "Against ...Nbd7, Nb5 hits c7 with the f4-bishop, and only the queen guards it. With the knight on d7 the queen can't take back on d6, so ...Bd6 loses a pawn, and ...Rc8 leaves a7 to the knight: "
  "(5... Nbd7 6. Nb5 Bd6 7. Bxd6 cxd6 8. Nxd6+) (5... Nbd7 6. Nb5 Rc8 7. Nxa7)\n"
  "Against ...Nc6, Bb5 pins the knight, and Ne5 follows: (5... Nc6 6. Bb5 Bd6 7. Ne5)\n"
  "Against ...h6, Bd3 offers the bishop trade, and we take back with the c-pawn: (5... h6 6. Bd3 Bxd3 7. cxd3)"),
 (D,
  "Against the rarer moves, keep chasing the f5-bishop with g4 and h4: (6... Ne4 7. g4) (6... Nfd7 7. g4) (6... h6 7. h4)\n"
  "Against ...Nc6, h4 first: g4 would drop the pawn to ...Bxe5 and ...Nxg4. (6... Nc6 7. h4)\n"
  "After ...Bxe5, take back with the d-pawn: the f6-knight has to move."),
 (DO + " Bg6 8. h4 h5 9. gxh5 Bxh5 10. Be2 Bxe2 11. Qxe2",
  "Against ...Nbd7, castle long as well: (11... Nbd7 12. O-O-O)"),
 (DO + " Bg6 8. h4 h6 9. g5",
  "After ...Nh5, take on g6: (9... Nh5 10. Nxg6)"),
 (DO + " Bxe5 8. dxe5",
  "After ...Bxg4, f3 hits the bishop while the f6-knight is still attacked, so Black loses a piece: (8... Bxg4 9. f3)"),
 (DO + " Bxe5 8. dxe5 Nxg4 9. f3",
  "Against ...Qh4+, block with Bg3: the g4-knight is still attacked. (9... Qh4+ 10. Bg3)"),
 (DN,
  "Against ...h6, g4 as usual: (7... h6 8. g4)\nAfter ...Bxe5, take back with the d-pawn."),
 (DN + " Ne4 8. Nxe4 Bxe4 9. f3",
  "Against ...Bg6, h4: h5 next hits the bishop again. (9... Bg6 10. h4)"),
 (DN + " O-O 8. g4",
  "Chase the bishop: (8... Bg6 9. h4) (8... Be4 9. f3)"),
 (B,
  "Against most moves, castle. Against ...Bg6, h4 threatens h5 against the bishop: (6... Bg6 7. h4)\n"
  "After ...Bxc3+, take back with the b-pawn."),
 (B + " Bxd3 7. cxd3",
  "Rc1 on the half-open c-file, and castle: (7... O-O 8. Rc1) (7... Nc6 8. O-O)\n"
  "Against ...Nbd7, Qb3 hits the b4-bishop, and b7 behind it: (7... Nbd7 8. Qb3)\n"
  "After ...Bxc3+, take back with the b-pawn."),
 (B + " Ne4 7. O-O",
  "After ...Bxc3, take back with the b-pawn; if the knight then grabs c3, Qe1 hits it: (7... Bxc3 8. bxc3 Nxc3 9. Qe1)"),
 (B + " Ne4 7. O-O Nxc3 8. bxc3 Bxc3 9. Rb1",
  "Black has a pawn, but the c3-bishop is out of play and Rb1 hits b7.\n"
  "Against ...b6, take on f5 first: after ...exf5, Qd3 hits f5 and the c3-bishop together. (9... b6 10. Bxf5 exf5 11. Qd3)\n"
  "After ...Bxd3, take back with the c-pawn: (9... Bxd3 10. cxd3)"),
 (NA,
  "With the c8-bishop on f5 and the knight on a6, nothing covers d7 or c6: the a4-e8 diagonal to Black's king is open. "
  "Against ...c4 or ...Nh5, Qa4 puts the queen behind the b5-knight, so every knight move gives a discovered check: "
  "(7... c4 8. Qa4) (7... Nh5 8. Qa4 Nxf4 9. Nd6+ Ke7 10. Nxf5+ exf5 11. exf4)\n"
  "After ...cxd4, Nbxd4 hits the f5-bishop and opens Bb5+: (7... cxd4 8. Nbxd4)"),
 (NAE,
  "Against ...Be4, f3 and the bishop has to go back: (9... Be4 10. f3)"),
 (NAE + " Bg6 10. h4",
  "g5 drives the f6-knight away: (10... h5 11. g5) (10... h6 11. g5)"),
 (QA + " Qxb4+ 8. c3",
  "Against ...Qb2, Nc7+ at once (Rb1 isn't possible here, since the f5-bishop covers b1): "
  "(8... Qb2 9. Nc7+ Kd8 10. Qc1) (8... Qb2 9. Nc7+ Kd7 10. Bb5+)"),
 (QA + " Qxb4+ 8. c3 Qa5 9. Nc7+",
  "Take the rook: (9... Kd7 10. Nxa8) (9... Kd8 10. Nxa8)"),
 (QA + " cxb4 8. Nc7+",
  "Don't take on a8 yet: ...b3+ would uncover a check from the a5-queen. Bd3 first, and Nd2 blocks the check: "
  "(8... Kd8 9. Bd3 b3+ 10. Nd2) (8... Kd7 9. Bd3)"),
 (C,
  "Against ...Nbd7, Ne5 as usual; ...e6 transposes to 5...e6 6.Ne5 Nbd7. (5... Nbd7 6. Ne5 Nxe5 7. dxe5)\n"
  "Against ...h6, Bd3 offers the bishop trade, and we take back with the c-pawn: (5... h6 6. Bd3 Bxd3 7. cxd3)"),
 (CE,
  "Against the rarer moves, g4 and h4 as usual: (6... Be7 7. g4 Bg6 8. h4) (6... Bb4 7. g4 Bg6 8. h4) (6... h6 7. g4 Bh7 8. h4)"),
 (CN,
  "After ...Nxe5, take the bishop first (after dxe5, the f6-knight would escape by taking on g4): (7... Nxe5 8. gxf5)\n"
  "Against ...Be4, f3 and h4: (7... Be4 8. f3 Bg6 9. h4)"),
 (CN + " Bg6 8. h4",
  "After ...Nxe5 and dxe5, the f6-knight has to move, and h5 or f3 hits the bishop: (8... Nxe5 9. dxe5 Nd7 10. h5) (8... Nxe5 9. dxe5 Ne4 10. Nxe4 Bxe4 11. f3)\n"
  "Against ...h6, take on g6: (8... h6 9. Nxg6 fxg6 10. Bd3)"),
 (CN + " Bg6 8. h4 h5 9. Nxg6 fxg6 10. Bd3 Kf7 11. g5",
  "(11... Ng8 12. Qf3)"),
 (CD,
  "After ...Bxe5 and ...Nxg4, f3 and h4, as after 4...e6 5.Nf3 Bd6 6.Ne5 O-O 7.g4 Bxe5: (7... Bxe5 8. dxe5 Nxg4 9. f3 Nh6 10. h4)"),
 (CD + " Bg6 8. h4",
  "Against ...h6, take on g6: (8... h6 9. Nxg6 fxg6 10. Bd3)\nAfter ...Bxe5, take back with the d-pawn."),
]
paths = [a for a, c in com]
json.dump(paths, open(S + 'r12/compaths.json', 'w'))
old = json.loads(subprocess.run(['node', S + 'r12/getcom_json.mjs', S + 'nc3_study_v19.pgn', S + 'r12/compaths.json'], capture_output=True, text=True, check=True).stdout)
missing = [a for a in paths if old[a] is None]
assert not missing, missing
com = [(a, (old[a] + '\n' + c) if old[a] else c) for a, c in com]
kept = [a for a in paths if old[a]]
print('appended to existing comments at:', kept)
ops = {"chapter": "Jobava simplified", "cut": [{"at": c, "mode": "node"} for c in cut], "lines": [], "comments": [{"at": a, "comment": c} for a, c in com]}
json.dump(ops, open(S + 'r12/ops3.json', 'w'), indent=1)
print(len(cut), 'cuts', len(com), 'comments')

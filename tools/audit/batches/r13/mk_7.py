import json
S = '/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
P = "1. Nc3 d5 2. d4 Nf6 3. Bf4 a6 4. e3"
F = P + " Bf5 5. Nf3 e6 6. Ne5"
N = P + " Nc6 5. Bd3"
G = "1. Nc3 d5 2. d4 Nf6 3. Bf4 Bf5 4. e3"
CUT = [F + " Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Ng8",
       F + " c5 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Nfd7",
       F + " Bd6 7. g4 Bg6",
       P + " Bf5 5. Nf3 Nc6 6. Ne5 Nxe5",
       P + " Bf5 5. Nf3 h6 6. Bd3 Bxd3",
       N + " Bg4 6. f3 Bh5 7. h4 Bg6"]
com = [
 (F + " Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5", "g5 drives the f6-knight back. Against ...Ng8, Bh3 hits e6; against ...Ne4, Qd3 hits the knight a second time.\n"
     "(10... Ng8 11. Bh3) (10... Ne4 11. Qd3)"),
 (F + " c5 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5", "g5 drives the f6-knight back. Against ...Nfd7, Bd3 hits g6, and after ...Kf7, Qf3. Against ...Ng8, Bh3 hits e6.\n"
     "(10... Nfd7 11. Bd3 Kf7 12. Qf3) (10... Ng8 11. Bh3) (10... Ne4 11. Nxe4)"),
 (F + " Bd6 7. g4", "Against ...Bg6, h4; after ...h5, Nxg6 and g5, as against ...Nbd7. Against ...Bxe5, dxe5: the f6-knight and the f5-bishop are both attacked. Against ...Be4, f3 and h4.\n"
     "(7... Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5) (7... Bxe5 8. dxe5) (7... Be4 8. f3 Bg6 9. h4)"),
 (P + " Bf5 5. Nf3 Nc6 6. Ne5", "After ...Nxe5, dxe5 hits the f6-knight; after ...Nd7, nothing guards d5: (6... Nxe5 7. dxe5 Ne4 8. Nxe4) (6... Nxe5 7. dxe5 Nd7 8. Qxd5)\n"
     "Against ...e6, g4 and h4 as usual: (6... e6 7. g4 Bg6 8. h4)\n"
     "Against ...Nb4, which hits c2, Rc1 guards it and keeps the light bishop: (6... Nb4 7. Rc1)"),
 (P + " Bf5 5. Nf3 h6 6. Bd3", "After ...Bxd3, take back with the c-pawn; Qb3 then hits b7 and d5: (6... Bxd3 7. cxd3 e6 8. Qb3)\n"
     "Against ...Ne4, take the knight; against ...Bg4, h3: (6... Ne4 7. Bxe4) (6... Bg4 7. h3)"),
 (N + " Bg4 6. f3 Bh5 7. h4", "Against ...h6, g4 drives the bishop to g6; after Bxg6 fxg6, Qd3 hits the g6-pawn.\n"
     "Against ...Bg6, g4 as well; after ...Bxd3, take back with the queen: (7... Bg6 8. g4 h6 9. Bxg6 fxg6 10. Qd3) (7... Bg6 8. g4 h5 9. Bxg6) (7... e6 8. g4)"),
 (N + " Bg4 6. f3 Bh5 7. h4 h6 8. g4 Bg6 9. Bxg6 fxg6 10. Qd3", "Qd3 hits the g6-pawn: after ...Kf7, castle long; against the rest, Qxg6+.\n"
     "(10... Kf7 11. O-O-O) (10... Nb4 11. Qxg6+) (10... Qd7 11. Qxg6+)"),
 (G + " Nc6 5. Nb5 e5 6. dxe5 Ne4 7. e6", "...Bd6 and ...Nd6 block the bishop's path to c7, but lose the f7-pawn with check. The same against ...Nd6: (7... Nd6 8. exf7+)"),
 (G + " Nc6 5. Nb5 e5 6. dxe5 Ne4 7. e6 Bd6 8. exf7+ Kxf7 9. Qxd5+", "The check also hits the e4-knight, which only the f5-bishop guards: if the bishop blocks on e6, Qxe4.\n"
     "(9... Be6 10. Qxe4) (9... Kf6 10. Nxd6)"),
 (G + " e6 5. Nf3 Bb4 6. Bd3 Ne4 7. O-O Nxc3 8. bxc3 Bxc3 9. Rb1", "Black has a pawn, but the c3-bishop is out of play and Rb1 hits b7. Against ...b6, take on f5 first.\n"
     "After ...Bxd3, take back with the c-pawn: (9... Bxd3 10. cxd3)"),
 (G + " e6 5. Nf3 Bb4 6. Bd3 Ne4 7. O-O Nxc3 8. bxc3 Bxc3 9. Rb1 b6 10. Bxf5 exf5 11. Qd3", "Qd3 hits the f5-pawn and the c3-bishop together: (11... Ba5 12. Qxf5)"),
 (G + " e6 5. Nf3 c5 6. Nb5 Qa5+ 7. b4 cxb4 8. Nc7+", "Don't take on a8 yet: ...b3+ would uncover a check from the a5-queen. Bd3 first: (8... Kd7 9. Bd3)"),
 (G + " e6 5. Nf3 c5 6. Nb5 Qa5+ 7. b4 cxb4 8. Nc7+ Kd8 9. Bd3", "Against ...b3+, Nd2 blocks the check: (9... b3+ 10. Nd2)"),
]
ops = {"chapter": "Jobava simplified", "cut": [{"at": x, "mode": "node"} for x in CUT], "lines": [S + 'r13/lines7.pgn'],
       "comments": [{"at": a, "comment": c} for a, c in com]}
json.dump(ops, open(S + 'r13/ops7.json', 'w'), indent=1); print(len(CUT), 'cuts', len(com), 'comments')

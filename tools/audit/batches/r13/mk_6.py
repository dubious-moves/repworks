import json, subprocess
S = '/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
exec(open(S + 'r13/cuts6.py').read())
CUT.append(C + " Bxc5 8. Bxf6 Qxf6")
com = [
 (P, "Against ...Bg4, f3; then h4 against ...Bh5 and g4 against ...Bf5: (4... Bg4 5. f3 Bh5 6. h4) (4... Bg4 5. f3 Bf5 6. g4)\n"
     "Against ...b5 or ...g6, h4: (4... b5 5. h4) (4... g6 5. h4)\nAgainst ...h6, Nf3: (4... h6 5. Nf3)"),
 (P + " Bf5 5. Nf3", "Against ...Nbd7, Ne5 as usual: (5... Nbd7 6. Ne5)"),
 (F, "Against the rest, g4 as well, and h4 once the bishop drops to g6: (6... Bb4 7. g4 Bg6 8. h4) (6... h6 7. g4) (6... Be7 7. g4)"),
 (F + " Nbd7 7. g4", "Against ...Be4, f3 drives the bishop to g6, then h4: (7... Be4 8. f3 Bg6 9. h4)"),
 (F + " Nbd7 7. g4 Nxe5 8. gxf5", "Take the bishop first. After dxe5, the f6-knight takes on g4, and the f5-bishop is safe. "
     "Now the e5-knight is attacked by the d-pawn and the f4-bishop and has to move.\n(8... Nc6 9. Bd3) (8... Ned7 9. fxe6) (8... Nc4 9. Bxc4)"),
 (F + " Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5", "Against ...Ne4, Qd3 hits the knight a second time: (10... Ne4 11. Qd3)"),
 (F + " Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Ng8 11. Bh3", "Bh3 hits the e6-pawn.\n(11... Kf7 12. Qf3) (11... Qe7 12. e4)"),
 (F + " Bd6 7. g4", "Against ...Bxe5, dxe5: the f6-knight and the f5-bishop are both attacked. Against ...Be4, f3 and h4.\n"
     "(7... Bxe5 8. dxe5) (7... Be4 8. f3 Bg6 9. h4)"),
 (F + " Bd6 7. g4 Bg6 8. h4", "Against ...h6, take on g6 all the same; against ...Bxe5, dxe5: (8... h6 9. Nxg6) (8... Bxe5 9. dxe5)"),
 (F + " Bd6 7. g4 Bg6 8. h4 h5 9. Nxg6", "After ...fxg6, g5 drives the knight back, as against ...Nbd7: (9... fxg6 10. g5)"),
 (F + " c5 7. g4", "Against ...Be4, f3: (7... Be4 8. f3)"),
 (F + " c5 7. g4 Bg6 8. h4", "Against ...h6, take on g6 all the same; against ...cxd4, take back with the e-pawn: (8... h6 9. Nxg6) (8... cxd4 9. exd4)"),
 (F + " c5 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5", "Against ...Ng8, Bh3 hits e6, as against ...Nbd7: (10... Ng8 11. Bh3) (10... Ne4 11. Nxe4)"),
 (F + " c5 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Nfd7 11. Bd3 Kf7 12. Qf3", "Against ...Kg8, Bxg6 wins a pawn: (12... Kg8 13. Bxg6)"),
 (P + " Bf5 5. Nf3 Nc6 6. Ne5", "Against ...e6, g4 and h4 as usual: (6... e6 7. g4 Bg6 8. h4)\n"
     "Against ...Nb4, which hits c2, Rc1 guards it and keeps the light bishop: (6... Nb4 7. Rc1)"),
 (P + " Bf5 5. Nf3 Nc6 6. Ne5 Nxe5 7. dxe5", "dxe5 hits the f6-knight. After ...Nd7, nothing guards d5 any more.\n(7... Ne4 8. Nxe4) (7... Nd7 8. Qxd5)"),
 (P + " Bf5 5. Nf3 h6 6. Bd3", "Against ...Ne4, take the knight; against ...Bg4, h3: (6... Ne4 7. Bxe4) (6... Bg4 7. h3)"),
 (P + " Bf5 5. Nf3 h6 6. Bd3 Bxd3 7. cxd3", "Qb3 hits b7 and d5: (7... e6 8. Qb3)"),
 (P + " c5 5. dxc5", "Against ...Qa5, which pins the c3-knight, Nf3: (5... Qa5 6. Nf3)"),
 (P + " c5 5. dxc5 e6 6. Na4", "Na4 guards the c5-pawn. After ...Bxc5 Nxc5 Qa5+ c3 Qxc5, Black has the pawn back, but we have the bishop pair. "
     "Against ...Nbd7, b4 holds the pawn; against ...Qa5+, c3.\n(6... Bxc5 7. Nxc5 Qa5+ 8. c3 Qxc5 9. Nf3) (6... Nbd7 7. b4) (6... Qa5+ 7. c3)"),
 (C + " Bxc5 8. Bxf6", "Bxf6 removes a guard of the d5-pawn, and Qxd5 wins it. The same against ...Qxf6: (8... Qxf6 9. Qxd5)"),
 (C + " Bxc5 8. Bxf6 gxf6 9. Qxd5", "After the queen trade, take back with the knight.\n(9... Qe7 10. Ne4) (9... Qb6 10. O-O-O)"),
 (C + " Be6 8. b4", "b4 holds the c5-pawn. Against ...h6, take on f6 at once: Bh4 runs into ...g5.\n(8... h6 9. Bxf6) (8... d4 9. exd4) (8... a5 9. Nf3)"),
 (C + " Be6 8. b4 Be7 9. Be2", "(9... h6 10. Bh4) (9... d4 10. exd4)"),
 (C + " Be6 8. b4 Be7 9. Be2 O-O 10. Nf3", "Against ...d4, Bxf6 and Ne4, as after ...h6: (10... d4 11. Bxf6 Bxf6 12. Ne4)"),
 (C + " d4 8. Na4 Qa5+ 9. c3", "(9... Ne4 10. b4 Qc7 11. cxd4)"),
 (C + " d4 8. Na4 Qa5+ 9. c3 dxc3 10. b4", "b4 hits the queen. Against ...Qc7, Nb6 hits the a8-rook.\n(10... Nxb4 11. axb4 Qxb4 12. Qc2) (10... Qc7 11. Nb6)"),
 (N, "Against ...h6, a3 keeps the knight out of b4, where it would hit the d3-bishop: (5... h6 6. a3)\nAgainst ...g6, Nf3: (5... g6 6. Nf3)"),
 (N + " e6 6. Nf3", "Against ...Bb4, castle; against ...h6 and ...Be7, a3: (6... Bb4 7. O-O) (6... h6 7. a3) (6... Be7 7. a3)"),
 (N + " e6 6. Nf3 Bd6 7. Ne5", "Against ...O-O, h4 starts the attack; against ...Bxe5, dxe5 hits the f6-knight.\n(7... O-O 8. h4) (7... Bxe5 8. dxe5)"),
 (N + " Bg4 6. f3", "Against ...Bd7, Nge2: (6... Bd7 7. Nge2)"),
 (N + " Bg4 6. f3 Bh5 7. h4", "Against ...h6, g4 and Bxg6; after ...fxg6, Qd3 hits g6: (7... h6 8. g4 Bg6 9. Bxg6 fxg6 10. Qd3)\nAgainst ...e6, g4: (7... e6 8. g4)"),
 (N + " Bg4 6. f3 Bh5 7. h4 Bg6 8. g4", "After ...Bxd3, take back with the queen.\n(8... h6 9. Bxg6 fxg6 10. Qd3) (8... h5 9. Bxg6) (8... e6 9. a3)"),
]
paths = [a for a, _ in com]
json.dump(paths, open(S + 'r13/compaths.json', 'w'))
old = json.loads(subprocess.run(['node', S + 'r12/getcom_json.mjs', S + 'nc3_study_v22.pgn', S + 'r13/compaths.json'], capture_output=True, text=True).stdout)
out = []
for a, c in com:
    o = old.get(a)
    if o is None: print('MISSING', a); continue
    if o: print('EXISTING', a, '|', o[:80].replace('\n', ' / '))
    out.append({"at": a, "comment": (o + '\n' + c) if o else c})
ops = {"chapter": "Jobava simplified", "cut": [{"at": x, "mode": "node"} for x in CUT], "lines": [], "comments": out}
json.dump(ops, open(S + 'r13/ops6.json', 'w'), indent=1); print(len(CUT), 'cuts', len(out), 'comments')

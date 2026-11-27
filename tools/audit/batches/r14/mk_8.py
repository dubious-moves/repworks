import json, subprocess
S = '/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
E = "1. Nc3 d5 2. d4 Nf6 3. Bf4 c6 4. e3"
B = E + " Bg4 5. f3 Bh5 6. h4"
G = E + " g6 5. h4"
CUT = [E + " e6 5. g4 h6", E + " e6 5. g4 Bb4", E + " e6 5. g4 Be7", E + " e6 5. g4 Nbd7",
       E + " e6 5. g4 Bd6 6. Qf3 h6", E + " e6 5. g4 Bd6 6. Qf3 O-O",
       B + " h6 7. Bd3 Nbd7", B + " h6 7. Bd3 Bg6", B + " h6 7. Bd3 g5",
       B + " Bg6 7. g4 h6 8. Bd3 Bxd3", B + " Bg6 7. g4 h5 8. g5 Nfd7",
       G + " Bg7 6. Bd3 h5", G + " Bg7 6. Bd3 Nbd7", G + " Bg7 6. Bd3 O-O 7. h5 Bg4", G + " h5 6. Nf3 Bg4",
       E + " Nbd7 5. Bd3 g6", E + " Nbd7 5. Bd3 e6 6. g4 h6", E + " Nbd7 5. Bd3 e6 6. g4 Be7"]
com = [
 (E + " e6 5. g4", "Against ...h6, h4 first, then g5; against ...Bb4, Bd3; against ...Be7 or ...Nbd7, g5 at once.\n"
     "(5... h6 6. h4 Bd6 7. Qf3) (5... Bb4 6. Bd3) (5... Be7 6. g5 Nfd7 7. h4) (5... Nbd7 6. g5)"),
 (E + " e6 5. g4 Bd6 6. Qf3", "Against ...h6, h4 first, then g5: (6... h6 7. h4)\nAgainst ...O-O, g5 at once: (6... O-O 7. g5)"),
 (E + " e6 5. g4 Bd6 6. Qf3 Qc7 7. Bxd6 Qxd6 8. Bd3 h6 9. h4", "Then g5; against ...e5, Qg3, as after 8...e5: (9... Nbd7 10. g5) (9... e5 10. Qg3)"),
 (B + " h6 7. Bd3", "Against ...Nbd7, g4; against ...Bg6, take it; against ...g5, give the bishop for the b8-knight and play g4.\n"
     "(7... Nbd7 8. g4) (7... Bg6 8. Bxg6) (7... g5 8. Bxb8 Rxb8 9. g4)"),
 (B + " h6 7. Bd3 e6 8. g4 Bg6 9. Bxg6 fxg6 10. Qd3 Kf7 11. O-O-O Bd6 12. Nge2", "Next Bxd6; after ...Bxf4, take back with the knight."),
 (B + " Bg6 7. g4 h6 8. Bd3", "After ...Bxd3, take back with the queen, then Nge2: (8... Bxd3 9. Qxd3 e6 10. Nge2)"),
 (B + " Bg6 7. g4 h5 8. g5", "g5 drives the knight back: (8... Nfd7 9. Nge2 e6 10. Bh2) (8... Ng8 9. e4)"),
 (G + " Bg7 6. Bd3", "h5 only once Black has castled. Against ...h5 or ...Nbd7, Nf3: (6... h5 7. Nf3 Bg4 8. Qd2) (6... Nbd7 7. Nf3)"),
 (G + " Bg7 6. Bd3 O-O 7. h5", "Against a castled king, h5 at once. Against ...Bg4, f3; against ...Nbd7, take on g6.\n(7... Bg4 8. f3) (7... Nbd7 8. hxg6)"),
 (G + " Bg7 6. Bd3 O-O 7. h5 Nxh5 8. Rxh5 gxh5 9. Qxh5 f5 10. Nf3", "Against ...Qe8, which offers a queen trade, Qh2 keeps the queens on: (10... Qe8 11. Qh2) (10... Nd7 11. O-O-O)"),
 (G + " h5 6. Nf3", "Against ...Bg4, Qd2: (6... Bg4 7. Qd2)"),
 (E + " Nbd7 5. Bd3", "Against ...g6, h4: (5... g6 6. h4)"),
 (E + " Nbd7 5. Bd3 e6 6. g4", "Against ...h6 or ...Bb4, Qf3; against ...Be7, g5; against ...c5, Nb5 hits c7.\n"
     "(6... h6 7. Qf3) (6... Bb4 7. Qf3) (6... Be7 7. g5) (6... c5 7. Nb5)"),
 (E + " Qb6 5. Na4", "After ...Qa5+, c3; Qd2 would drop the a4-knight. Against ...Qb4+, c3 as well: the queen can't take on a4, which our queen guards: (5... Qb4+ 6. c3)"),
 (E + " Qb6 5. Na4 Qa5+ 6. c3", "Nc5 brings the knight back into play: (6... Bf5 7. Nc5) (6... b5 7. Nc5) (6... e6 7. Nf3)"),
]
json.dump([a for a, _ in com], open(S + 'r14/compaths.json', 'w'))
old = json.loads(subprocess.run(['node', S + 'r12/getcom_json.mjs', S + 'nc3_study_v23.pgn', S + 'r14/compaths.json'], capture_output=True, text=True).stdout)
out = []
for a, c in com:
    o = old.get(a)
    if o is None: print('MISSING', a); continue
    if o: print('EXISTING', a[-40:], '|', o[:100].replace('\n', ' / '))
    out.append({"at": a, "comment": (o + '\n' + c) if o else c})
ops = {"chapter": "Jobava simplified", "cut": [{"at": x, "mode": "node"} for x in CUT], "lines": [], "comments": out}
json.dump(ops, open(S + 'r14/ops8.json', 'w'), indent=1); print(len(CUT), 'cuts', len(out), 'comments')

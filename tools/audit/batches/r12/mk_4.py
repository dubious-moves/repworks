import json
S = '/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
E = "1. Nc3 d5 2. d4 Nf6 3. Bf4 Bf5 4. e3 e6 5. Nf3"
NA = E + " c5 6. Nb5 Na6 7. c3"
Q = NA + " c4 8. Qa4"
NB = E + " Nbd7 6. Nb5"
com = [
 (E, "The rarer moves:\n"
     "Against ...Be7, the same plan as against ...Bd6, Ne5 and g4: (5... Be7 6. Ne5 O-O 7. g4)\n"
     "Against ...Nc6, Bb5 pins the knight, and Ne5 follows: (5... Nc6 6. Bb5 Bd6 7. Ne5)\n"
     "Against ...h6, Bd3 offers the bishop trade, and we take back with the c-pawn: (5... h6 6. Bd3 Bxd3 7. cxd3)"),
 (E + " Bd6 6. Ne5 Nbd7 7. Be2", "Against ...h6, g4 as usual: (7... h6 8. g4)\nAfter ...Bxe5, take back with the d-pawn."),
 (NA, "With the c8-bishop on f5 and the knight on a6, nothing stands on c6 or d7: the a4-e8 diagonal to Black's king is open.\n"
      "Against ...c4, Qa4 puts the queen behind the b5-knight, and Black has to block the diagonal.\n"
      "The same Qa4 against ...Nh5: (7... Nh5 8. Qa4 Nxf4 9. Nd6+ Ke7 10. Nxf5+ exf5 11. exf4)\n"
      "After ...cxd4, Nbxd4 hits the f5-bishop and opens Bb5+: (7... cxd4 8. Nbxd4)"),
 (Q, "Black has to block the diagonal with ...Nd7 or ...Qd7; otherwise a knight move gives a double check: (8... Be7 9. Nc7+ Kf8 10. Nxa8)"),
 (Q + " Nd7 9. b3", "b3 hits the c4-pawn, and Nd6+ comes next: after ...Bxd6 Bxd6, our bishop covers f8, so Black can't castle.\n"
      "Against ...Bd3, take on c4: (9... Bd3 10. bxc4)"),
 (Q + " Nd7 9. b3 Be7 10. Nd6+ Bxd6 11. Bxd6", "The d6-bishop covers f8, so Black can't castle. Against ...Qb6, which hits it, Ba3 stays on the f8 diagonal; after ...cxb3, take back with the a-pawn.\n"
      "(11... Qb6 12. Ba3) (11... cxb3 12. axb3)"),
 (Q + " Nd7 9. b3 cxb3 10. axb3", "Against ...Be7, Nd6+ as above. Against ...Qb6 or ...Rc8, Ne5 hits the d7-knight: (10... Qb6 11. Ne5) (10... Rc8 11. Ne5)"),
 (Q + " Nd7 9. b3 cxb3 10. axb3 Be7 11. Nd6+ Bxd6 12. Bxd6", "As after 9...Be7: the d6-bishop covers f8, so Black can't castle."),
 (Q + " Qd7 9. Ne5", "Ne5 hits the queen, and it can't stay on the diagonal: once it leaves, a knight move gives a double check.\n"
      "(9... Qd8 10. Nc7+) (9... Qc8 10. Nd6+) (9... Qe7 10. Nd6+)\n"
      "Against ...Bc2, which hits our queen, b3 blocks: (9... Bc2 10. b3)"),
 (NB, "Nb5 hits c7 with the f4-bishop, and only the queen guards it. ...Bb4+ is Black's best.\n"
      "The d7-knight stops the queen from taking back on d6, so ...Bd6 loses a pawn, and ...Rc8 leaves a7 to the knight: "
      "(6... Bd6 7. Bxd6 cxd6 8. Nxd6+) (6... Rc8 7. Nxa7) (6... e5 7. dxe5)"),
 (NB + " Bb4+ 7. c3 Ba5 8. Qa4", "Qa4 hits the a5-bishop and stands behind the b5-knight on the a4-e8 diagonal. "
      "Against ...c6, Nd6+ with check, and the a5-bishop is still attacked: (8... c6 9. Nd6+)"),
 (NB + " Bb4+ 7. c3 Ba5 8. Qa4 Bb6 9. c4", "(9... dxc4 10. Bxc4 O-O 11. O-O) (9... a6 10. Nc3 O-O 11. c5)\n"
      "Against ...c6, Nd6+: nothing can take the knight there. (9... c6 10. Nd6+)"),
]
ops = {"chapter": "Jobava simplified", "cut": [], "lines": [S + 'r12/lines4.pgn'], "comments": [{"at": a, "comment": c} for a, c in com]}
json.dump(ops, open(S + 'r12/ops4.json', 'w'), indent=1); print(len(com), 'comments')

import json
S = '/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
E = "1. Nc3 d5 2. d4 Nf6 3. Bf4 Bf5 4. e3 e6 5. Nf3"
NA = E + " c5 6. Nb5 Na6 7. c3"
Q = NA + " c4 8. Qa4"
com = [
 (NA, "c3 takes the c-pawn off the d1-a4 diagonal, so the queen can come to a4, and it covers b4 and d4.\n"
      "With the c8-bishop on f5 and the knight on a6, nothing stands on c6 or d7: the a4-e8 diagonal to Black's king is open.\n"
      "Against ...c4, Qa4 puts the queen behind the b5-knight, and Black has to block the diagonal.\n"
      "The same Qa4 against ...Nh5: (7... Nh5 8. Qa4 Nxf4 9. Nd6+ Ke7 10. Nxf5+ exf5 11. exf4)\n"
      "After ...cxd4, Nbxd4 hits the f5-bishop and opens Bb5+: (7... cxd4 8. Nbxd4)"),
 (Q + " Nd7 9. b3", "b3 hits the c4-pawn, and Nd6+ comes next: after ...Bxd6 Bxd6, our bishop covers f8, so Black can't castle.\n"
      "Against ...Be7, Nd6+ at once: (9... Be7 10. Nd6+ Bxd6 11. Bxd6)\n"
      "Against ...Bd3, take on c4: (9... Bd3 10. bxc4)"),
 (Q + " Nd7 9. b3 cxb3 10. axb3", "Against ...Qb6 or ...Rc8, Ne5 hits the d7-knight: (10... Qb6 11. Ne5) (10... Rc8 11. Ne5)"),
 (Q + " Nd7 9. b3 cxb3 10. axb3 Be7 11. Nd6+ Bxd6 12. Bxd6",
      "The d6-bishop covers f8, so Black can't castle. Against ...Qb6, which hits it, Ba3 keeps it on the f8 diagonal. "
      "Against ...Nc7, Ne5 hits the d7-knight, which our queen pins.\n"
      "(12... Qb6 13. Ba3) (12... Nc7 13. Ne5)"),
 (Q + " Qd7 9. Ne5", "Ne5 hits the queen, and it can't stay on the diagonal: once it leaves, Nc7+ or Nd6+ is a double check.\n"
      "(9... Qd8 10. Nc7+) (9... Qc8 10. Nd6+) (9... Qe7 10. Nd6+)\n"
      "Against ...Bc2, which hits our queen, b3 blocks: (9... Bc2 10. b3)"),
]
ops = {"chapter": "Jobava simplified", "cut": [{"at": Q + " Nd7 9. b3 Be7", "mode": "node"}], "lines": [], "comments": [{"at": a, "comment": c} for a, c in com]}
json.dump(ops, open(S + 'r13/ops5.json', 'w'), indent=1); print(len(com), 'comments')

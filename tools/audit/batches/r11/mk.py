import json
S='/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
P="1. Nc3 d5 2. d4 Nf6 3. Bf4 e6 4. e3"
com=[
 (P+" Bd6 5. Qf3 Bxf4 6. Qxf4 Nc6 7. Nb5",
  "Sets up a trap, but it's not a bad move even if\nblack responds correctly.\nMost other replies also cost Black the c7-pawn.\nIf black tries to go for the same fork, both knights end up trapped in the corners, but Bd3 keeps Black's knight in (the a2-pawn covers b3, the bishop covers c2) and we come out ahead: (7... Nb4 8. Qxc7 Qxc7 9. Nxc7+ Kd8 10. Nxa8 Nxc2+ 11. Kd2 Nxa1 12. Bd3)\nIf the king goes to e7 instead, leave the rook for now: Bd3 covers c2 and we stay a pawn up. (7... Nb4 8. Qxc7 Qxc7 9. Nxc7+ Ke7 10. Bd3)"),
 (P+" a6 5. g4 h6 6. h4",
  "Against ...Bd6, Qf3 as usual. After ...Bxf4 it will likely turn into a familiar situation: (6... Bd6 7. Qf3 Bxf4 8. Qxf4 Qd6 9. Qxd6 cxd6 10. f3)"),
 (P+" c5 5. Nb5 Qa5+ 6. b4 Qxb4+ 7. c3",
  "If the queen goes to b2 instead, Rb1 chases it first, and the fork follows:\n(7... Qb2 8. Rb1 Qxa2 9. Nc7+)"),
 (P+" c5 5. Nb5",
  "...c5 leaves c7 guarded only by the queen, so Nb5 and the f4-bishop threaten Nc7+, forking king and rook. After ...Na6 the knight also takes the a6-square from Black's a-pawn, so nothing can chase our knight away: c3 and a4 keep it on b5, and we carry on with Bd3, then g4 or h4 against the castled king."),
 (P+" c5 5. Nb5 Na6 6. c3 Bd7 7. a4 Be7 8. Bd3",
  "If Black closes the centre with ...c4, the bishop drops to b1, not c2: after ...Bxb5 axb5 Nc7 we answer b6. (8... c4 9. Bb1 Bxb5 10. axb5 Nc7 11. b6)"),
 (P+" Bb4 5. Bd3 c5 6. dxc5 Bxc5 7. Nb5",
  "The same idea as after 4...c5: with the c-pawn gone and the bishop on c5, only the queen guards c7, so Nb5 and the f4-bishop threaten Nc7+. After ...Na6 we develop with Nf3 and castle, then c3 and b4 chase the c5-bishop.\nAgainst ...Bb6, Nd6+ (the f4-bishop covers d6); against ...Qa5+, c3, since the c5-bishop could take on b4: (7... Bb6 8. Nd6+) (7... Qa5+ 8. c3)"),
]
ops={"chapter":"Jobava simplified","cut":[],"lines":[],"comments":[{"at":a,"comment":c} for a,c in com]}
json.dump(ops,open(S+'r11/ops.json','w'),indent=1); print(len(com))

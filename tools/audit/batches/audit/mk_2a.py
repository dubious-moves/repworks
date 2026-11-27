import json
S='/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
Q="1. Nc3 d5 2. d4 Nf6 3. Bf4 e6 4. e3 Bd6 5. Qf3"
X=Q+" Bxf4 6. Qxf4"
cut=[Q+" "+m for m in ["a6","c6","c5"]] + [X+" "+m for m in ["a6","Nbd7","c6","c5"]] + \
    [X+" O-O 7. g4 "+m for m in ["Nc6","Nbd7","e5"]] + [X+" Nc6 7. Nb5 "+m for m in ["O-O","Kd7","a6","Nb4","Nh5","Bd7"]] + \
    [X+" Nc6 7. Nb5 e5 8. dxe5 "+m for m in ["Nh5","Nd7"]] + [X+" Qd6 7. Qxd6 cxd6 8. Nb5 Kd7"] + \
    [Q+" O-O 6. g4 "+m for m in ["Nc6","b6","Bb4","e5","Nbd7","h6"]]
com=[
 (Q, "Nc6 transposes into 2... Nc6 3. Bf4\ne6 4. e3 Bd6\n5. Qf3 Nf6\nAgainst the rarer moves, g4 as usual: (5... a6 6. g4) (5... c6 6. g4) (5... c5 6. g4 cxd4 7. exd4)"),
 (X, "Against the rarer moves, g4 as usual: (6... a6 7. g4) (6... c6 7. g4 O-O 8. Nf3) (6... c5 7. g4)\nAgainst ...Nbd7, Nb5 hits c7, which only the queen guards: (6... Nbd7 7. Nb5 O-O 8. Qxc7) (6... Nbd7 7. Nb5 e5 8. dxe5)"),
 (X+" O-O 7. g4", "g5 drives the f6-knight away: (7... Nc6 8. g5) (7... Nbd7 8. g5)\nAgainst ...e5, take: after ...Nxg4, Be2 hits the knight. (7... e5 8. dxe5 Nxg4 9. Be2)"),
 (X+" Nc6 7. Nb5", "\nSets up a trap, but it's not a bad move even if\nblack responds correctly. Remember to take with the queen: (7... O-O 8. Qxc7 Qxc7 9. Nxc7 Rb8 10. Nb5)\nThe other replies also cost Black the c7-pawn, except ...Kd7, which guards it: (7... a6 8. Nxc7+) (7... Nb4 8. Qxc7) (7... Nh5 8. Qxc7) (7... Bd7 8. Nxc7+) (7... Kd7 8. Nf3)"),
 (X+" Nc6 7. Nb5 e5 8. dxe5", "Other knight moves: (8... Nh5 9. Qf3 g6 10. Qxd5) (8... Nd7 9. e6)"),
 (X+" Qd6 7. Qxd6 cxd6 8. Nb5", "The knight eyes c7 and d6. After ...Kd7, a3, and the knight drops back once ...a6 comes: (8... Kd7 9. a3 a6 10. Nc3)\nIf c7 or d6 is left unguarded, the knight takes: (8... Na6 9. Nxd6+) (8... Ke7 9. Nc7)"),
 (Q+" O-O 6. g4", "Bxf4 likely transposes\nOtherwise g5 drives the f6-knight away: (6... Nc6 7. g5) (6... Nbd7 7. g5) (6... h6 7. g5)\nAgainst ...b6, take on d6 first: (6... b6 7. Bxd6)\nAgainst ...Bb4, Ne2 keeps our pawns intact: (6... Bb4 7. Ne2)\nAgainst ...e5, take: (6... e5 7. dxe5)"),
]
ops={"chapter":"Jobava simplified","cut":[{"at":c,"mode":"node"} for c in cut],"lines":[],"comments":[{"at":a,"comment":c} for a,c in com]}
json.dump(ops,open(S+'audit/ops_2a.json','w'),indent=1); print(len(cut),'cuts',len(com),'comments')

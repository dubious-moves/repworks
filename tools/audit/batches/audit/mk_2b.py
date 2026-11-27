import json
S='/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
P="1. Nc3 d5 2. d4 Nf6 3. Bf4 e6 4. e3"
N=P+" c5 5. Nb5 Na6 6. c3"
B=P+" Bb4 5. Bd3"
A=P+" a6 5. g4"
E=P+" Be7 5. g4"
cut=[N+" "+m for m in ["c4","cxd4","Qb6"]] + [N+" Bd7 7. a4 "+m for m in ["Bxb5","c4","cxd4"]] + [N+" Be7 7. a4 O-O 8. Bd3 c4"] + \
 [P+" c5 5. Nb5 Qa5+ 6. b4 Qxb4+ 7. c3 Qb2"] + [B+" "+m for m in ["Bxc3+","Nc6","Nbd7","Ne4","c6","h6"]] + [B+" O-O 6. Nf3 "+m for m in ["Nbd7","Nc6","Ne4","h6"]] + \
 [B+" c5 6. dxc5 "+m for m in ["Bxc5","Qa5","Nc6"]] + [B+" c5 6. dxc5 Nbd7 7. Nf3 Nxc5 8. O-O "+m for m in ["O-O","Nxd3"]] + \
 [A+" "+m for m in ["Be7","b5"]] + [A+" c5 6. g5 Ne4", A+" c5 6. g5 Nfd7 7. Qg4 cxd4", A+" c5 6. g5 Nfd7 7. Qg4 Nc6 8. O-O-O cxd4", A+" h6 6. h4 Bd6", A+" h6 6. h4 c5 7. Qf3 cxd4"] + \
 [A+" Bb4 6. Ne2 "+m for m in ["Nxg4","c5","Ne4"]] + [E+" "+m for m in ["c5","b6"]] + [E+" O-O 6. g5 "+m for m in ["Nfd7","Ne8"]] + [E+" O-O 6. g5 Ne4 7. Nxe4 dxe4 8. h4 c5 9. c3 Nc6"]
com=[
 (N, "Against ...c4, b3 hits the chain at once: (6... c4 7. b3)\nAfter ...cxd4, take back with the e-pawn: (6... cxd4 7. exd4)\nAgainst ...Qb6, a4 keeps the knight on b5: (6... Qb6 7. a4)"),
 (N+" Bd7 7. a4", "If Black takes on b5, take back with check, then Nf3 and Ne5: (7... Bxb5 8. Bxb5+ Nd7 9. Nf3 Nc7 10. Bxc7 Qxc7 11. Ne5)\nAgainst ...c4, develop with Nf3; after ...cxd4, take back with the e-pawn: (7... c4 8. Nf3) (7... cxd4 8. exd4)"),
 (P+" c5 5. Nb5 Qa5+ 6. b4 Qxb4+ 7. c3", "If the queen goes to b2 instead, the fork comes all the same, and Ne2 then guards c3: (7... Qb2 8. Nc7+ Kd7 9. Ne2) (7... Qb2 8. Nc7+ Kd8 9. Ne2)"),
 (B, "Against most moves, Nf3 and castle: (5... Nc6 6. Nf3) (5... Nbd7 6. Nf3) (5... c6 6. Nf3) (5... h6 6. Nf3)\nAgainst ...Ne4, Ne2, so that ...Nxc3 doesn't wreck our pawns: (5... Ne4 6. Ne2)\nAfter ...Bxc3+, take back with the pawn: (5... Bxc3+ 6. bxc3)"),
 (B+" O-O 6. Nf3", "Against the quiet moves, castle: (6... Nbd7 7. O-O) (6... Nc6 7. O-O) (6... Ne4 7. O-O)\nAgainst ...h6, g4 goes for the king: (6... h6 7. g4)"),
 (B+" c5 6. dxc5", "After ...Bxc5, Nb5 hits c7 with the f4-bishop: (6... Bxc5 7. Nb5)\nAgainst ...Qa5, Ne2 guards c3 a second time: (6... Qa5 7. Ne2)\nAgainst ...Nc6, develop with Nf3: (6... Nc6 7. Nf3)"),
 (B+" c5 6. dxc5 Nbd7 7. Nf3 Nxc5 8. O-O", "Against ...O-O, Bg5 pins the knight; after ...Nxd3, take back with the c-pawn: (8... O-O 9. Bg5) (8... Nxd3 9. cxd3)"),
 (A, "g5 next, as against everything: (5... Be7 6. g5) (5... b5 6. g5)"),
 (A+" c5 6. g5", "After ...Ne4, take, and Bg2 hits the e4-pawn: (6... Ne4 7. Nxe4 dxe4 8. Bg2)"),
 (A+" c5 6. g5 Nfd7 7. Qg4", "After ...cxd4, take back with the e-pawn: (7... cxd4 8. exd4)"),
 (A+" c5 6. g5 Nfd7 7. Qg4 Nc6 8. O-O-O", "After ...cxd4, take back with the e-pawn: (8... cxd4 9. exd4)"),
 (A+" h6 6. h4", "Against ...Bd6, Qf3 as usual: (6... Bd6 7. Qf3)"),
 (A+" h6 6. h4 c5 7. Qf3", "After ...cxd4, take back with the e-pawn: (7... cxd4 8. exd4)"),
 (A+" Bb4 6. Ne2", "With the knight on e2, ...Bxc3+ no longer wrecks our pawns. Next a3 asks the bishop; if Black grabs g4, Rg1 hits the knight: (6... c5 7. a3) (6... Ne4 7. a3) (6... Nxg4 7. Rg1)"),
 (E, "g5 next: (5... c5 6. g5) (5... b6 6. g5)"),
 (E+" O-O 6. g5", "If the knight retreats, h4 and h5 follow: (6... Nfd7 7. h4) (6... Ne8 7. h4)"),
 (E+" O-O 6. g5 Ne4 7. Nxe4 dxe4 8. h4 c5 9. c3", "Against ...Nc6, Bg2 hits the e4-pawn: (9... Nc6 10. Bg2)"),
]
ops={"chapter":"Jobava simplified","cut":[{"at":c,"mode":"node"} for c in cut],"lines":[],"comments":[{"at":a,"comment":c} for a,c in com]}
json.dump(ops,open(S+'audit/ops_2b.json','w'),indent=1); print(len(cut),'cuts',len(com),'comments')

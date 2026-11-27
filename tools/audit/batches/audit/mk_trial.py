# builds audit/ops_trial.json for the 2...Bf5 3.f3 e6 trial batch (Practical-dependent comments filled from PRAC below)
import json, sys
P="1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 dxe4 5. fxe4"
G=P+" Bg6 6. Nf3"
B=G+" Bb4 7. Bd3"
H="1. Nc3 d5 2. d4 Bf5 3. f3 e6 4. e4 Bg6 5. h4"
PRAC=json.load(open('/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/audit/prac_comments.json'))
cut=[P+" Bg4"]+[G+" "+x for x in ["Nc6","c6","h6","Be7","Nd7","Bh5","a6"]]+[B+" Bh5", B+" Nf6 8. Bg5 h6", B+" Nf6 8. Bg5 Be7", B+" Nf6 8. Bg5 Nbd7",
  B+" Ne7 8. O-O O-O", G+" Nf6 7. Bd3 c6", G+" c5 7. d5 Nf6", G+" c5 7. d5 exd5 8. Bb5+ Nc6", H+" h6 6. exd5 exd5 7. Qe2+ Be7 8. Bf4 Nf6", H+" h5 6. Bg5 f6 7. Be3 Bd6"]
com=[
 (P, "If the bishop goes to g4, it simply hangs: (5... Bg4? 6. Qxg4)"),
 (G, "Against the rarer moves we develop with Bd3 and castle: (6... c6 7. Bd3 Nd7 8. O-O) (6... h6 7. Bd3 Nd7 8. O-O) (6... Be7 7. Bd3) (6... Nd7 7. Bd3) (6... Bh5 7. Bd3) (6... a6 7. Bd3)\nWith a knight on c6, Bb5 pins it instead: (6... Nc6 7. Bb5)"),
 (B, "Against ...Bh5 we castle as usual: (7... Bh5 8. O-O)"),
 (B+" Nf6 8. Bg5", "The f6-knight is pinned, so e5 is coming. After ...h6 the bishop keeps the pin; after ...Be7, which breaks it, h4 goes for the g6-bishop: (8... h6 9. Bh4) (8... Be7 9. h4) (8... Nbd7 9. e5 h6 10. exf6)"),
 (G+" Nf6 7. Bd3", "Bb4 transposes\ninto 6... Bb4 7. Bd3 Nf6\nAgainst ...c6, e5 drives the knight away: (7... c6 8. e5)"),
 (G+" c5 7. d5", "If Black doesn't take, Bb5+ all the same: (7... Nf6 8. Bb5+)"),
 (G+" c5 7. d5 exd5 8. Bb5+", "After ...Nc6, take back on d5: the c6-knight is pinned. (8... Nc6 9. exd5)"),
 (G+" c5 7. d5 exd5 8. Bb5+ Nd7 9. Ne5", "The d7-knight is pinned, and the d5-pawn falls: (9... Nf6 10. Nxd5) (9... Bd6 10. Qxd5)"),
 (H+" h6 6. exd5 exd5 7. Qe2+ Be7 8. Bf4", "Against ...Nf6 too, castle long, then g4 and g5: (8... Nf6 9. O-O-O)"),
 (H+" h5 6. Bg5 f6 7. Be3", "Against ...Bd6, Qd2 and castle long, as against 6...Be7: (7... Bd6 8. Qd2)"),
]
com += [(B+" "+k, v) for k, v in PRAC.items()]
ops={"chapter":"Jobava simplified","cut":[{"at":c,"mode":"node"} for c in cut],"lines":[],"comments":[{"at":a,"comment":c} for a,c in com]}
json.dump(ops,open('/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/audit/ops_trial.json','w'),indent=1)
print(len(cut),'cuts',len(com),'comments')

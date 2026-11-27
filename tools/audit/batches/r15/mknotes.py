import json, re
S='/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
R='/home/user/repworks-data/review/JX3v8kXM/'
def num(sans):
    out=[]
    for i,s in enumerate(sans):
        out.append(f'{i//2+1}. {s}' if i%2==0 else s)
    return ' '.join(out)
def mv(sans):  # "10.g5" style for the last move
    i=len(sans)-1; return f'{i//2+1}.{sans[-1]}' if i%2==0 else f'{i//2+1}...{sans[-1]}'
def inv(f):
    d={}
    for r in json.load(open(S+'audit/'+f)):
        p=' '.join(t for t in re.sub(r'\d+\.(\.\.)?',' ',r['path']).split())
        for y in r['reps']: d[p+' '+y['san']]=y
    return d
def notes(listname, invf, specific, extra=()):
    items=json.load(open(R+listname+'.json'))['items']
    I=inv(invf) if invf else {}
    out=[]; used=set()
    for it in items:
        own=it['at']+([it['san']] if it['kind']=='removed' else [])
        k=' '.join(own)
        if k in specific: out.append({'moves':num(own),'text':specific[k]}); used.add(k); continue
        if it['kind']=='removed' and k in I:
            y=I[k]; n=round(1/(y.get('reachAll') or y['reach']))
            out.append({'moves':num(own),'text':f"{round(100*y['share'])}% at this position, about 1 in {n:,} games over all move orders: under the guide (1 in 2,000 and 10%), and not sharp or hard to find. Now a clickable on {mv(it['at'])}."})
    missing=[k for k in specific if k not in used]
    for k in missing: out.append({'moves':num(k.split()),'text':specific[k]})  # questions at moves
    return out, missing
A='Nc3 d5 d4 Nf6 Bf4 Bf5 e3 e6 Nf3'
b3={
 A+' c5 Nb5 Na6 c3 c4 Qa4 Qd7': "The other way to block the diagonal. 9.Ne5 hits the queen, and once it leaves, Nc7+ or Nd6+ is a double check (Practical 93.2%).",
 A+' c5 Nb5 Na6 c3': "Rewritten after your answer: the exact point of c3 is that the c2-pawn blocks the queen's way to a4 (7.Qa4 is illegal before c3). Your arrows here are kept. The idea is also the new deck card 5e.",
 A+' Bd6 Ne5 Nbd7 Be2': "Your \"O-O transposes...\" text removed, as you asked.",
 A+' c5 Nb5 Na6 c3 c4 Qa4 Nd7 b3': "As you said, only the most likely reply is drilled: 9...cxb3 (Maia 58%). 9...Be7 is this clickable.",
 A: "The ...Nbd7 part is dropped: your 6.Nb5 Bb4+ line is drilled now.",
 A+' Nbd7 Nb5 Bb4+ c3 Ba5 Qa4 Bb6 c4': "Your text kept; I added (9... c6 10. Nd6+): +4.0, because nothing can take the knight on d6.",
 A+' c5 Nb5 Na6 c3 c4 Qa4': "Why Black has to block: 8...Be7 9.Nc7+ is a double check.",
}
P='Nc3 d5 d4 Nf6 Bf4 a6 e3'; F=P+' Bf5 Nf3 e6 Ne5'; C=P+' c5 dxc5 Nc6 a3 e5 Bg5'; N=P+' Nc6 Bd3'
b4={
 N+' Bg4 f3 Bh5 h4 h6': "7...h6 (28%) is a mistake: after 8.g4 Bg6 9.Bxg6 fxg6 10.Qd3, Qd3 hits g6 and White is about +1.9 (Practical 78.1). 7...Bg6 (46%) is level after 8.g4, so it's a clickable on 7.h4, the same pattern as your 6.Nb5 Bb4+.",
 'Nc3 d5 d4 Nf6 Bf4 Bf5 e3 e6 Nf3 Bb4 Bd3 Ne4 O-O Nxc3 bxc3 Bxc3 Rb1 b6': "Restored from batch 3 because the follow-up is a tactic: Bxf5 exf5 Qd3 forks f5 and the c3-bishop and wins the gambit pawn back (Practical 72.0; Stockfish +1.6 vs +0.9 for anything else).",
 'Nc3 d5 d4 Nf6 Bf4 Bf5 e3 e6 Nf3 c5 Nb5 Qa5+ b4 cxb4 Nc7+ Kd8': "Restored from batch 3 because 9.Bd3 is hard to find: 9.Nxa8? runs into ...b3+, uncovering a check from the a5-queen. Practical 85.6 vs 48.6 for Nxa8.",
 'Nc3 d5 d4 Nf6 Bf4 Bf5 e3 Nc6 Nb5 e5 dxe5 Ne4 e6 Bd6': "Restored from batch 3: 8.exf7+ Kxf7 (98%) 9.Qxd5+, and the check also hits the e4-knight.",
 F+' Nbd7 g4 Bg6 h4 h5 Nxg6 fxg6 g5 Ng8': "The line now ends on 10.g5: after 8...h5, the most common reply, Nxg6 and g5 give +3, so it's kept that far. 10...Ng8 11.Bh3 (1 in 8,866) is a clickable on 10.g5.",
 F+' Nbd7 g4 Bg6 h4 h5 Nxg6 fxg6 g5 Ne4': "A clickable on 10.g5, now with 11.Qd3, which hits the knight a second time (Stockfish +3.7 vs +3.4 for 11.Nxe4; Practical agrees).",
 F+' Nbd7 g4 Bg6 h4 Nxe5': "Your clickables on 8.h4 already show this line, so the drilled copy goes.",
 F+' Nbd7 g4 Bg6 h4 h6': "Your clickables on 8.h4 already show this line, so the drilled copy goes.",
 F+' Bd6 g4 Bg6': "1 in 3,546, and the same idea as the ...Nbd7 line (h4, then Nxg6 and g5 against ...h5): a clickable on 7.g4.",
 F+' c5 g4 Bg6 h4 h5 Nxg6 fxg6 g5 Nfd7': "The line now ends on 10.g5 (+2.7). 10...Nfd7 11.Bd3 Kf7 12.Qf3 (1 in 9,887) is a clickable there.",
 P+' Bf5 Nf3 Nc6 Ne5 Nxe5': "A plain recapture (1 in 3,651). The clickables on 6.Ne5 show dxe5 and the trap after ...Nd7: nothing guards d5, so Qxd5.",
 P+' Bf5 Nf3 h6 Bd3 Bxd3': "A plain recapture (cxd3, 1 in 3,531): a clickable on 6.Bd3, with Qb3 next.",
 N+' Bg4 f3 Bh5 h4 Bg6': "46% but level after 8.g4 (Stockfish +0.03), while 7...h6 is a mistake (+1.9): so 7...h6 is drilled and this is a clickable on 7.h4.",
 N+' Bg4 f3 Bh5 h4 h6 g4 Bg6 Bxg6 fxg6 Qd3 Kf7': "The line now ends on 10.Qd3; castling long after ...Kf7 is a clickable there.",
 P+' c5 dxc5 Qa5': "A clickable on 5.dxc5, now with 6.Nf3 (Practical 59.3 vs 54.9 for 6.a3).",
 C+' Be6 b4 Be7 Be2 d4': "A clickable on 9.Be2, now with 10.exd4 (Practical 61.8 vs 57.4 for 10.Na4; Stockfish +0.46 vs +0.14).",
 C+' Bxc5 Bxf6 Qxf6': "The same idea as 8...gxf6 9.Qxd5, so a clickable on 8.Bxf6, as you asked for the Qa4 line.",
 P+' Bg4': "5% (1 in 1,245). f3, then h4 or g4, is rule 10, drilled in the ...Nc6 ...Bg4 line: a clickable on 4.e3.",
 P+' c5 dxc5 e6 Na4': "Kept drilled below the guide (19%, 1 in 2,102) because Na4 is hard to find. Practical prefers 7.Bxb8 against ...Bxc5 (55.9 vs 51.5), but 7.Bxb8 has 1 game in the database and 7.Nxc5 2,339, and Stockfish prefers 7.Nxc5 (+0.35 vs 0.00). I used 7.Nxc5 and recommend keeping it.",
 F+' Nbd7 g4 Nxe5 gxf5': "Kept drilled below the guide (22%, 1 in 5,562) because it's hard to find: the natural 8.dxe5 is -0.8 after 8...Nxg4.",
 C+' Bxc5 Bxf6': "Kept drilled (23%, 1 in 2,691): Bxf6 and Qxd5 win a pawn (Practical 75.6%, Stockfish +1.4).",
 C+' d4 Na4 Qa5+ c3 dxc3 b4': "Kept drilled: 9.c3 and 10.b4 are only moves (9.Nc3 -3.2; 10.Nxc3 -1.5, 10.bxc3 -2.0).",
}
E='Nc3 d5 d4 Nf6 Bf4 c6 e3'
b5={
 E+' g6 h4 Bg7 Bd3 O-O': "Drilled because it's sharp: 7.h5 Nxh5 8.Rxh5 gxh5 9.Qxh5, about +2 (Practical 69.8; rule 10, h5 at once against a castled king). 6...h5 (33%) is the most common reply but quiet, so it's a clickable on 6.Bd3, as with your 6.Nb5 Bb4+.",
 E+' g6 h4 Bg7 Bd3 h5': "Quiet and level (Stockfish 0.00): a clickable on 6.Bd3.",
 E+' e6 g4 Bd6 Qf3 h6': "1 in 2,757 counting both move orders: under the guide. A clickable on 6.Qf3: h4 first, then g5.",
 E+' e6 g4 h6': "Reaches the same position as 6.Qf3 h6 7.h4: a clickable on 5.g4.",
 E+' Bg4 f3 Bh5 h4 h6 Bd3 g5': "A clickable on 7.Bd3, with the trick 8.Bxb8 Rxb8 9.g4 (+3.1, against +1.5 for 8.Be5).",
 E+' Bg4 f3 Bh5 h4 Bg6 g4 h6 Bd3 Bxd3': "A plain recapture (Qxd3), then Nge2: a clickable on 8.Bd3.",
 E+' Bg4 f3 Bh5 h4 Bg6 g4 h5 g5 Nfd7': "A clickable on 8.g5 (1 in 4,889).",
 E+' Nbd7 Bd3 g6': "30% (1 in 3,111): a clickable on 5.Bd3. Practical: h4 54.2, h3 54.2, Nf3 53.8, so the system move h4.",
 E+' Nbd7 Bd3 e6 g4': "Kept drilled (4...Nbd7 is 1 in 939). Stockfish dislikes 6.g4 (-0.22 vs 6.a3 +0.32), but Practical prefers it (61.6 vs 60.6 for a3, 58.6 for Nf3), and it's rule 7's g4 storm. I recommend keeping 6.g4.",
 E+' e6 g4': "Your 5.g4: Stockfish -0.06 vs 5.a3 +0.41, just under my flag; Practical 58.8. Kept (your move, card 7b).",
 E+' Bg4 f3 Bh5 h4 h6 Bd3 e6 g4 Bg6 Bxg6 fxg6 Qd3 Kf7 O-O-O Bd6 Nge2': "Your line's end: Practical gives 12.Nge2 88.2, the same as 12.Nh3, so your move stays.",
 E+' Qb6 Na4': "Kept drilled (1 in 1,878): your 5.Na4 is hard to find, and 6.Qd2? would drop the a4-knight (-4).",
 E+' g6 h4 Bg7 Bd3 O-O h5 Nxh5 Rxh5 gxh5 Qxh5 f5 Nf3': "10.Nf3 79.6 vs 10.O-O-O 79.3 at Practical.",
}
for name,invf,spec,out in [('batch-3-answers',None,b3,'notes-3a.json'),('batch-4','inv_nf6a6.json',b4,'notes-4.json'),('batch-5','inv_nf6c6.json',b5,'notes-5.json')]:
    n,miss=notes(name,invf,spec)
    json.dump(n,open(S+'r15/'+out,'w'),indent=1,ensure_ascii=False)
    print(name, len(n),'notes; as questions (no matching change):', miss)

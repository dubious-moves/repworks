import json,sys
D=json.load(open('alldec_v4.json'))
W={};Bk={}
for d in D:
    (Bk if d.get('black') else W).setdefault(d['path'],[]).append(d)
def show_black(path, depth=1, ind=''):
    for b in Bk.get(path,[])[:1]:
        print(f"{ind}[{path.split()[-1] if path else ''}] Black to move, n={b['n']} reach={b['reach']*100 if b['reach'] else 0:.3f}%  (ch: {b['ch']})")
        ours=set(b['ours'])
        for san,n,pc,w in b['replies'] or []:
            if pc<2: continue
            mark='*' if san in ours else ' '
            wp=path+' '+san
            wm=W.get(wp)
            our=wm[0]['moves'] if wm else None
            print(f"{ind}  {mark}{san:6} {pc:5.1f}% n={n:6}  -> ours: {our}")
            if depth>1 and wm:
                for m in wm[0]['moves']:
                    show_black(wp+' '+m, depth-1, ind+'      ')
for p in sys.argv[1:]:
    show_black(p, 2); print()

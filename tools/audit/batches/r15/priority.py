import json, re, datetime, os
S='/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/'
R='/home/user/repworks-data/review/JX3v8kXM/'
A=json.load(open(S+'r15/answers.json'))
def inv(f):
    d={}
    for r in json.load(open(S+'audit/'+f)):
        p=' '.join(re.sub(r'\d+\.(\.\.)?',' ',r['path']).split())
        for y in r['reps']: d[p+' '+y['san']]=y
    return d
I={**inv('inv_nf6a6.json'),**inv('inv_nf6c6.json')}
PRE='1. Nc3 d5 2. d4 Nf6 3. Bf4 '
HIGH={'a6 4. e3 Nc6 5. Bd3 Bg4 6. f3 Bh5 7. h4 h6','a6 4. e3 Nc6 5. Bd3 Bg4 6. f3 Bh5 7. h4 Bg6 8. g4',
      'c6 4. e3 g6 5. h4 Bg7 6. Bd3 O-O','c6 4. e3 g6 5. h4 Bg7 6. Bd3 h5 7. Nf3 Bg4 8. Qd2',
      'a6 4. e3 c5 5. dxc5 e6 6. Na4','c6 4. e3 Nbd7 5. Bd3 e6 6. g4','a6 4. e3 Bg4 5. f3 Bh5 6. h4'}
MED={'a6 4. e3 Bf5 5. Nf3 e6 6. Ne5 Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Ne4 11. Nxe4',
     'a6 4. e3 c5 5. dxc5 Nc6 6. a3 e5 7. Bg5 Be6 8. b4 Be7 9. Be2 d4 10. Na4','a6 4. e3 c5 5. dxc5 Qa5 6. a3',
     'a6 4. e3 Bf5 5. Nf3 e6 6. Ne5 Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Ng8 11. Bh3',
     'a6 4. e3 Bf5 5. Nf3 e6 6. Ne5 c5 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Nfd7 11. Bd3 Kf7 12. Qf3',
     'c6 4. e3 Bg4 5. f3 Bh5 6. h4 h6 7. Bd3 g5 8. Bxb8','a6 4. e3 b5 5. h4','a6 4. e3 g6 5. h4','a6 4. e3 h6 5. Nf3'}
ALL_ORDERS={'c6 4. e3 e6 5. g4 Bd6 6. Qf3 h6 7. h4 Bxf4 8. Qxf4':1/2757,'c6 4. e3 e6 5. g4 h6 6. h4 Bd6 7. Qf3':1/2757}
def prio(it):
    line=(it['lead']+' '+it['part']).strip()
    short=line[len(PRE):] if line.startswith(PRE) else line
    if short in HIGH: return 'high'
    if short in MED: return 'medium'
    if it['kind']=='removed':
        own=' '.join(it['at']+[it['san']])
        y=I.get(own); reach=ALL_ORDERS.get(short) or (y and (y.get('reachAll') or y['reach'])); share=y['share'] if y else 0
        if reach and (reach>=1/4000 or (share>=0.30 and reach>=1/5500)): return 'medium'
    return 'low'
groups={'high':[],'medium':[],'low':[]}
chapters={'k2kyJU1R':'Jobava simplified'}
for L in A[1:]:
    for e in L['items']:
        if e['state']!='open': continue
        groups[prio(e['item'])].append(e['item'])
fx=json.load(open(R+'tmp-fixes.json'))['items']; groups['low']+=fx
ch=json.load(open(R+'tmp-chapters.json'))
for it in ch['items']:
    it['text']="One of your three other Jobava chapters, as it was in my study (unchanged since your round-10 export). Later batches audit it the same way."
    groups['low'].append(it)
chapters.update(ch['chapters'])
now=datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
meta={'high':("Jobava review: high priority", "I'm unsure you'll approve, or the change is big",2),
      'medium':("Jobava review: medium priority","I expect you'll approve, but check",1),
      'low':("Jobava review: low priority","I'm confident you'll approve",0)}
for k,items in groups.items():
    title,why,off=meta[k]
    used={i['cid'] for i in items}
    d={'v':1,'sid':'JX3v8kXM','name':f'priority-{k}','title':f'{title} ({len(items)})','created':(now+datetime.timedelta(seconds=off)).isoformat().replace('+00:00','Z'),
       'from':'repworks-data@bb9b630','to':'repworks-data@76b3dd5','chapters':{c:n for c,n in chapters.items() if c in used},'items':items}
    json.dump(d,open(R+f'priority-{k}.json','w'),indent=2,ensure_ascii=False); open(R+f'priority-{k}.json','a').write('\n')
    print(k, len(items))
for n in ['tmp-fixes','tmp-chapters','batch-3-answers','batch-4','batch-5']: os.remove(R+n+'.json')

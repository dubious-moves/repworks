#!/bin/bash
# per card: grade d20 (answer + alternatives), maia 2000/2200, look
D=/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad/deck
export STOCKFISH=/usr/games/stockfish STOCKFISH_THREADS=3 IDEAS_CACHE=$D/cache
cd /home/user/repworks
python3 -c "import json;[print(c['id']+'\t'+c['moves']+'\t'+' '.join([c['ans']]+c['alts'])) for c in json.load(open('$D/cards.json'))]" | while IFS=$'\t' read id mv cands; do
  out=$D/ev/c$id.txt
  [ -s $out ] && continue
  { echo "== card $id: $mv"; node scripts/ideas/cv.ts grade "$mv" $cands --depth 20; echo "-- maia"; node scripts/ideas/cv.ts maia "$mv" --elo 2000,2200; echo "-- look"; node scripts/ideas/cv.ts look "$mv"; } > $out.tmp 2>&1 && mv $out.tmp $out
done
echo EVID DONE

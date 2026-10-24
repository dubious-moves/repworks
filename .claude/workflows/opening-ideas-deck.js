export const meta = {
  name: 'opening-ideas-deck',
  description: 'Find, verify and write the key ideas of a repertoire as an idea deck (PLAN.md §5.128)',
  whenToUse: 'From the opening-ideas skill, once the repertoire, its tree and its profile are in the work folder and the owner has opted into workflows',
  phases: [
    { title: 'Analyse', detail: 'five lenses look for ideas among the ranked decisions, development first, every claim backed by a tool run' },
    { title: 'Curate', detail: 'pick the decisions worth a card (about 12), group them into ideas, write the rules of thumb' },
    { title: 'Verify', detail: 'skeptics try to refute each idea with the engine' },
    { title: 'Write', detail: 'the deck in the approved PGN format, checked to zero errors' },
    { title: 'Review', detail: 'a critic reads the deck; a fixer applies the fixes' },
  ],
}

// args: {
//   work: folder holding repertoire.pgn, tree.txt (cv.ts tree --min 0.5), profile.txt
//         (cv.ts profile --engine 18 --top 20), develop.txt (cv.ts develop) and decisions.txt
//         (cv.ts decisions --min 2 --top 40); notes go in <work>/notes
//   deck: the deck's path
//   opening: what the opening is, e.g. "Black's Scandinavian Gambit, 1. e4 d5 2. exd5 c6 3. dxc6 Nxc6"
//   side: 'white' | 'black'
//   start: the FEN of the opening's starting position (the overview chapter's)
//   event: the deck's Event header, e.g. "Ideas: Scandinavian Gambit (1.e4 d5 2.exd5 c6)"
//   about: what the repertoire is and what its comments mean
//   level: the owner's level and the opponents', e.g. "club player; opponents read with Maia at 2000–2200"
//   hints: optional { pieces, pawns, structure, tactics, orders }: what to look at in this opening
//   lenses: optional, the lenses to run (default all five), e.g. ['pieces', 'pawns'] for the
//           development ideas alone
//   lean: optional; true runs two agents: the writer chooses from decisions.txt, verifies and
//         writes, and the critic fixes what it finds (no analysts, curator or skeptics; about 14
//         agents for the full run)
//   cards: optional, the deck's cards (default 12; the check refuses more than 15)
// }
const A = args
const W = A.work
const DECK = A.deck
const US = A.side === 'white' ? 'White' : 'Black'
const THEM = A.side === 'white' ? 'Black' : 'White'
const KINDS = ['overview', 'structure', 'break', 'placement', 'maneuver', 'king', 'exchange', 'tactic', 'trap', 'move-order', 'endgame']
const CARDS = A.cards || 12
const hint = (k) => (A.hints && A.hints[k] ? `\nIn this opening, look especially at: ${A.hints[k]}` : '')

const CONTEXT = `You are one of several agents building an "idea deck" for an opening repertoire, for the owner of repworks (a chess training site; this repository, /home/user/repworks). The owner learns an opening's KEY IDEAS and RULES OF THUMB before drilling its lines. Level: ${A.level}.

The opening: ${A.opening}. We play ${US}.
${A.about}

THE OWNER'S THREE RULES (2026-10-20):
1. THE REPERTOIRE IS RIGHT. The deck teaches the repertoire; it does not review it or look for better moves. The owner's builder chose each move for a reason (practical eval, ease of learning, transpositions, moves that recur across lines). At a position of the repertoire, the card's answer and the main line's move are the repertoire's move, whatever the engine says. Never call it a mistake, never show or suggest a better move, never call it "best" unless grade says great. Use the engine to explain it (what it does, why the other squares are worse there) and beyond the repertoire's line ends. Do not report gaps or improvements.
2. MAIA AT 2000 OR MORE (it plays weaker than its number; the tool refuses less). The repertoire's own move shares come first.
3. DEVELOPMENT FIRST (as revised 2026-10-24). The first ideas say where each of our pieces develops and when, pawn moves included: e.g. when the f8-bishop goes to e7, d6 or c5, and why. But a CARD is only a decision a player could get wrong (below): a square the piece goes to because it is the only sensible one, or the natural one (a recapture, the gambit pawn taken back), gets no card; it goes in the rule of thumb and the explanations. The contrast between a piece's squares is taught by its rule and its cards' explanations ("here e7, not c5, because…").

A CARD IS A DECISION (the owner, 2026-10-24, after the first decks asked "where does the f8-bishop go?" where it had one square). ${W}/decisions.txt ranks the repertoire's positions by what missing our move there costs: reach × how often Maia 2000/2200 misses it × what Maia's likeliest other move gives up. Cards come from its candidates, best value first; its "natural or forced" list are rules of thumb, not cards. A deck has about ${CARDS} cards, never more than 15. The QUESTION is neutral and lets the board ask: it may say what ${THEM} has just played ("White has just played 5. Bg2. What do we play, and why?"), but never names the square our answer goes to or takes on, never lists our candidate moves, and names the piece that moves only when that piece still has a real choice. The check enforces this with Stockfish and Maia: it refuses a card whose answer is the only sensible move (unless Maia misses it), whose question names the answer's square, or names the moving piece when that leaves one sensible move or Maia then finds it 85% of the time; it warns on a card Maia finds 80% of the time unprompted and on one under 2% reach.

Read these first:
- The repertoire PGN: ${W}/repertoire.pgn.
- ${W}/tree.txt: every position reached by ≥0.5% of the repertoire's games, with its reach (share of games), our move or their replies.
- ${W}/profile.txt: what we play, where our pieces stand at the line ends, pawn structures, material, and Stockfish's eval (from our side) of the most reached line ends.
- ${W}/develop.txt: the development map: each of our pieces and pawns in the order they come out, its first squares by reach, the positions where it goes there, the setup features that stand there and not at its other squares ("with": share here, share elsewhere; "without"), and its routes to the line ends.
- ${W}/decisions.txt: our positions at 2% reach or more, ranked by value (reach × Maia's miss × the miss's cost), each with its FEN, our move, how often Maia finds it, Maia's likeliest other move and what it gives up, and our sensible moves; then the natural or forced ones (rules of thumb, not cards).

Chess vision tools. Run them with Bash from /home/user/repworks. <pos> is movetext from the start in quotes ("1. e4 e5 2. Nf3") or a FEN:
  node scripts/ideas/cv.ts look <pos> --side ${A.side}
      board, material, pawns (islands, chains, isolated, doubled, passed, backward), files, development, king cover, each piece's mobility, what is attacked and undefended, what an exchange would lose, pins, both sides' pawn breaks and outposts, the side to move's checks / captures (with the exchange's value) / double attacks, and the other side's threats
  node scripts/ideas/cv.ts line <pos> <move> <move> ... [--full]
      plays moves (SAN) from <pos>; refuses an illegal one and lists the legal moves; --full adds the look of the end position; prints the FEN
  node scripts/ideas/cv.ts engine <pos> --side ${A.side} [--depth 18] [--lines 4]
      Stockfish's best lines, scores from our side
  node scripts/ideas/cv.ts grade <pos> <move> <move> ... [--depth 18]
      each move against the best move, banded great/good/ok/bad/blunder by the win% it gives up (<3, <6, <10, <20, ≥20: the site's own scale)
  node scripts/ideas/cv.ts squares <pos> <square> [--depth 18]
      every move of the piece on that square, graded, with each line: why the repertoire's square and not another
  node scripts/ideas/cv.ts develop ${W}/repertoire.pgn --piece <name, e.g. f8-bishop>
      one piece's map with every position's FEN and setup
  node scripts/ideas/cv.ts threat <pos>
      what the side NOT to move would play if it could move again (its threat)
  node scripts/ideas/cv.ts maia <pos> [--elo 2000,2200] [--grade 14]
      what people at those ratings (2000 or more) play here; with --grade each likely move's band (a natural move that loses is a trap)
  node scripts/ideas/cv.ts playout <pos> --n 6 --plies 20 --white maia:2000 --black sf:12:25 --seed 1
      short games from a position (Maia samples human moves; sf:<depth>:<spread> picks among moves within the spread), with counts of what each side played
  node scripts/ideas/cv.ts check <deck.pgn> --rep ${W}/repertoire.pgn --depth 18 --verbose
      the deck's check; --verbose also prints each card's sensible moves and how often Maia finds its answer, unprompted and once the question has named the piece
Searches are cached on disk and shared between agents. Without a native STOCKFISH the engine is the single-threaded lite build: depth 18 with 4 lines takes ~10 s, depth 22 up to a minute; choose depths deliberately (18 to explore, 20+ for a claim that goes in the deck).

THE RULE THAT MATTERS MOST: you are good at chess knowledge and at explaining, and bad at seeing the board. Every concrete claim (a move is good or bad, a piece is loose, a square is weak, a tactic works, a line is forced, how often something happens) must rest on a tool output you ran, cited as command → the relevant output. Use your knowledge to decide what to look for and how to say it, never as evidence. Run look on a position before saying anything about it. Grade or engine a move at depth ≥ 18 before saying it works. Never write a move sequence you have not played through line (it rejects illegal moves). Prefer positions that occur in the repertoire (cite their reach from tree.txt); at those, our move is the repertoire's. A rule that claims to be general ("in this structure…", "whenever ${THEM} plays…") must be tested in at least two repertoire positions; if it fails in one, narrow its wording with the condition that makes it true.

Do not edit anything in the repository. You may write scratch notes under ${W}/notes/.`

const POSITION = {
  type: 'object',
  properties: {
    moves: { type: 'string', description: 'movetext from the start reaching the position where the card asks its question' },
    fen: { type: 'string', description: 'its FEN, as line printed it' },
    reach: { type: 'string', description: 'its reach from tree.txt (e.g. "7.2%"), or "off-repertoire"' },
    role: { type: 'string', enum: ['main', 'example', 'fails'] },
    question: { type: 'string', description: "what the card asks here, neutrally: what the opponent has just played and what we do, never the answer's square, our candidate moves, or the moving piece unless it still has a real choice" },
    answer: { type: 'string', description: "the idea's move from this position in SAN (the repertoire's move at a repertoire position), or '' when the answer is in words" },
    others: { type: 'string', description: 'other moves of ours worth showing beside it as side lines, each with its grade and what it gives up or allows (from squares or grade); never one that grades better than the repertoire\'s move' },
    line: { type: 'string', description: 'a short SAN continuation from this position showing the idea, played through line' },
    arrows: { type: 'array', items: { type: 'string' }, description: 'e.g. Gc8g4; G our plan, R their threat or what we prevent, B a second option' },
    circles: { type: 'array', items: { type: 'string' }, description: 'e.g. Yd4: Y a key square, G our target, R their target' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'command → key output, for each claim' },
  },
  required: ['moves', 'fen', 'reach', 'role', 'question', 'answer', 'others', 'line', 'arrows', 'circles', 'evidence'],
}

const IDEA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'short slug' },
    section: { type: 'string', enum: ['development', 'plans'], description: 'development: where a piece or pawn goes first, and when; plans: everything else' },
    title: { type: 'string' },
    kind: { type: 'string', enum: KINDS },
    rule: { type: 'string', description: 'the rule of thumb, one sentence, with its condition' },
    why: { type: 'string', description: 'why it works, 2–4 plain sentences' },
    importance: { type: 'integer', description: '1–5: how often it comes up (reach) times how much it matters' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    positions: { type: 'array', items: POSITION },
  },
  required: ['id', 'section', 'title', 'kind', 'rule', 'why', 'importance', 'confidence', 'positions'],
}

const IDEAS = { type: 'object', properties: { ideas: { type: 'array', items: IDEA }, notes: { type: 'string' } }, required: ['ideas', 'notes'] }

const DECIDE = `Cards come from ${W}/decisions.txt: a position of an idea is one of its candidates (cite its value and how often Maia finds our move), or beyond the repertoire a position Maia misses (run maia). A position from its "natural or forced" list, or where our move is the only sensible one, is no card: say it in the rule and the explanations.`

const LENSES = [
  {
    key: 'pieces',
    prompt: `Your lens: DEVELOPMENT OF THE PIECES (section "development"). For each of our knights and bishops, and the queen if it comes out early, take every first square with 3% or more reach in develop.txt. For each square: (a) its CONDITION, the visible setup that sends the piece there: start from develop.txt's "with"/"without" features, then confirm on the board with look at two or more of its positions (cv.ts develop --piece <name> lists them with FENs); narrow it until it holds in every position listed for that square and fails at the piece's other squares; (b) its REASON: run squares at the main position on the piece's square and say what the repertoire's square does there and what each other natural square allows or loses (from the graded lines; play them with line). The repertoire's square is right by definition: if another square grades better, just don't show it; (c) its usual route afterwards (develop.txt's routes). Return one idea per piece whose first square varies, with a position for each square that is a real decision (in decisions.txt's candidates; role main for the most valuable, example for the others), ordered by how the pieces come out; a square that is natural or forced there (decisions.txt's last list) gets no position but a clause of the rule. Pieces with one square can share an idea ("the setup"). Read the owner's own notes in the repertoire (comments that are not move shares or transpositions) and explain them where they touch a piece's square.${hint('pieces')} Return 3–7 ideas.`,
  },
  {
    key: 'pawns',
    prompt: `Your lens: DEVELOPMENT OF THE PAWNS, THE KING AND THE ROOKS (section "development"). From develop.txt: each pawn move we make with 3% or more reach and when (the condition, from "with"/"without", confirmed with look), what it does and what it gives up (look before and after: squares, breaks, weaknesses; squares or grade for the alternatives); when we castle and when we wait; where the rooks go and why. The repertoire's moves are right by definition. Return ideas whose positions are real decisions (decisions.txt), one per distinct condition, ordered by when they come up; a pawn move with one sensible alternative or none is a clause of a rule, not a position.${hint('pawns')} Return 2–5 ideas.`,
  },
  {
    key: 'structure',
    prompt: `Your lens: STRUCTURE, MATERIAL AND THE CENTRE (section "plans"). What each side gets for what it gives (material, development count, open and half-open files, centre control: use look on the main positions), the pawn structures the repertoire reaches (profile.txt), each side's pawn breaks and when each is good (grade them), what the typical exchanges and queen trades mean for us, and whether to chase or return material.${hint('structure')} Return 3–6 ideas.`,
  },
  {
    key: 'tactics',
    prompt: `Your lens: TACTICS, TRAPS AND ATTACK (section "plans"). Recurring tactical motifs for us in the repertoire's positions; ${THEM}'s natural mistakes (run maia --elo 2000,2200 --grade 16 on the most reached positions where ${THEM} is to move: a likely move graded bad or blunder is a trap; then show our punishment with engine); the tactics we must AVOID (maia with us to move at 2000/2200, graded: where does a natural move other than the repertoire's lose?); when an attack on the enemy king works and when it is too early. Use threat to read what ${THEM} threatens in our key positions.${hint('tactics')} Return 4–8 ideas, each with the position before the tactic as the card's position.`,
  },
  {
    key: 'orders',
    prompt: `Your lens: MOVE ORDERS, TRANSPOSITIONS AND ${THEM.toUpperCase()}'S CHOICES (section "plans"). How the repertoire answers each ${THEM} move with 5% or more reach (tree.txt), short rules ("after X, Y comes next") with their exceptions, the transpositions the repertoire's comments note (they are part of its design: moves that recur and lines that meet) and any move-order trap behind them, which ${THEM} setups are most dangerous for us (by the engine's eval at the line ends in profile.txt, and by Maia's choices) and how the repertoire plays there.${hint('orders')} Return 3–6 ideas.`,
  },
]

const RUN = A.lenses && A.lenses.length ? LENSES.filter((l) => A.lenses.includes(l.key)) : LENSES

phase('Analyse')
// Lean runs no analysts: the writer chooses from decisions.txt.
const found = A.lean ? [] : await parallel(RUN.map((l) => () =>
  agent(`${CONTEXT}\n\n${l.prompt}\n\n${DECIDE} For each idea give 1–3 positions: the main one (the most valuable decision), maybe an example where the same idea recurs, maybe one where it FAILS (role "fails": the idea's move there grades bad or worse, and the card teaches the condition). Arrows: green for our plan, red for ${THEM}'s threat or what we prevent, blue for a second option; circles: yellow for a key square. Importance 1–5 = reach × consequence. In notes, list what you looked at that did NOT become an idea and why, then any trouble with the tools. Do not report gaps in the repertoire or better moves: the repertoire is right by definition.`,
    { label: `analyse:${l.key}`, phase: 'Analyse', schema: IDEAS })))
const candidates = found.flatMap((r, i) => (r ? r.ideas.map((x) => ({ ...x, id: `${RUN[i].key}-${x.id}` })) : []))
const lost = A.lean ? [] : RUN.filter((_, i) => !found[i]).map((l) => l.key)
const analystNotes = found.map((r, i) => `${RUN[i].key}: ${r ? r.notes : '(agent failed)'}`)
if (!A.lean) log(`${candidates.length} candidate ideas from ${found.filter(Boolean).length} analysts${lost.length ? `; no ideas from ${lost.join(', ')} (agent failed)` : ''}`)

const FORMAT = `The deck format (the owner approved it; the site imports it as a reference study and the checker enforces it):
- One PGN game per chapter, Lichess dialect. Headers, in this order, each on one line, no double quotes inside a value:
  [Event "${A.event}"]
  [ChapterName "<n>. <title>"]   (more positions of the same idea: "<n>b. <title> (another position)", "<n>c. …")
  [Orientation "${A.side}"]
  [FEN "<the card's position>"]
  [SetUp "1"]
  [IdeaKind "<one of: ${KINDS.join(', ')}; overview only for the rules of thumb, which make no card>"]
  [IdeaQuestion "<the question, answerable by looking at the board>"]
  [IdeaSource "<short provenance: repertoire reach and path end, engine checks (depth, band), Maia figures (2000+)>"]
- Then a blank line, then the movetext: first the explanation as a comment before the first move: { 1–3 plain sentences [%csl Yd4][%cal Gc8g4,Rf3e5] }; then the idea's move(s) (a glyph like ! right after a move where it earns it), each with a short comment where it helps; the continuation that shows the idea; a side line in parentheses for the case where it fails, its move marked ? (or ?? for a blunder), with a comment saying why; then *.
- A card's answers are its first move and any first move marked ! beside it. At a repertoire position the first move is the repertoire's move, never marked ? and never with a ! move beside it; the main line keeps to the repertoire's moves while it is in the repertoire. Another move of ours beside it is a side line showing why that square is worse there: marked ? when it grades bad or worse, else unmarked or ?!, its comment saying what it gives up; never one that grades better than the repertoire's move. Beyond the repertoire, mark ! only a move as good as the main move (graded great). Two cards never start at the same position.
- Movetext from a FEN with Black to move starts "<n>... <move>"; with White to move "<n>. <move>".
- Comments never contain { or }. Arrows and circles: [%cal Gc8g4,Rf3e5] [%csl Yd4,Gf2]: G green = our plan, R red = ${THEM}'s threat or what we prevent, B blue = a second option, Y yellow = a key square. Every arrow starts on a piece in the position it is drawn in, or where another arrow of the same comment ends (a route).
- The rules of thumb first, in two overview chapters, both [IdeaKind "overview"] and [FEN "${A.start}"], no IdeaQuestion, no moves, each comment under 1500 characters: [ChapterName "0. Rules of thumb: where the pieces go"] with the development ideas' rules numbered "1) … 2) …", then [ChapterName "0b. Rules of thumb: plans and tactics"] with the plans ideas' rules, numbered on from the first chapter's (left out when there are no plans ideas). Then the development ideas' chapters, then the plans ideas'.
- A card is a decision from decisions.txt, about ${CARDS} cards in all (never more than 15). Its question is neutral: it may say what ${THEM} has just played, then asks what we play and why ("White has just played 7. Bg5. What do we play, and why?"). It never names the square our answer goes to or takes on, never lists our candidates ("d6 or d5?"), and names the piece that moves only when that piece still has a real choice there. The chapter name and the kind are hidden while the card asks, but the question isn't.
- A development card's explanation names the condition visible on the board and the reason, and contrasts the piece's other squares in other setups ("against Bb5 the bishop goes to d6; here, with Be2, e7"); its side lines show the other natural squares and what they give up there.
- The rules of thumb: at most 8 in all, each about 100 characters, one condition a player can see on the board, and each backed by at least one card. A placement that is natural or forced (decisions.txt) is a clause of a rule, not a card.
- Never write that the repertoire's move is a mistake, inaccurate or second best, nor "best" unless grade says great.
- Explanations are for the owner's level: plain words, no engine numbers in the explanation (they go in IdeaSource), no claim the evidence does not back.`

const CRITIC_CHECKS = `Check, with the tools: (1) accuracy: spot-check at least 8 concrete claims across the deck (moves, "wins", "threatens", "weak", "guards", arrows) with look/grade/squares/engine/line; (2) is each card a real decision, asked neutrally: does its question name the answer's square, list our candidates, or name a piece that has one sensible move there (cv.ts check --verbose prints the sensible moves and how often Maia finds the answer)? Would a club player miss the answer (decisions.txt's found)? Does the explanation answer it, and does it have one answer on the board; (8) size: about ${CARDS} cards and at most 8 rules; cut the cards worth least (decisions.txt's value) before adding any; (3) are the rules of thumb true, not contradicted by any card (read each rule's condition literally against every card), does every clause of a rule have a card, and do they cover the most reached positions and ${THEM}'s main setups (tree.txt, profile.txt)? Is anything important missing (a ≥5% setup, a frequent trap)? (4) development first: do the development ideas come first, in the order the pieces come out, and is every first square with 3% or more reach in develop.txt covered by a rule (a card only where it is a real decision), with a condition and reason a learner could apply in a new game? (5) the repertoire is right: no card's answer or main line departs from the repertoire at its positions, no text calls its move a mistake or second best, no side line offers a better move; (6) duplication and order; (7) clarity for the owner's level.${RUN.length < LENSES.length ? ` Only these lenses ran: ${RUN.map((l) => l.key).join(', ')}; judge coverage within them.` : ''}`

if (A.lean) {
  phase('Write')
  const writer = await agent(`${CONTEXT}\n\nYou are the WRITER, with no analysts, curator or skeptics before you: you choose the ideas, verify them and write the deck to ${DECK} (create the folder if needed).\n\n1. CHOOSE. ${DECIDE} Take decisions.txt's candidates by value, about ${CARDS} of them (never more than 15), and group them into ideas (at most 8): the same reason is one idea. Development ideas first, in the order the pieces come out (develop.txt's order), then the rest in the order they come up in a game. Write one rule of thumb per idea, about 100 characters, naming the piece and each square with the condition a player can see on the board; a first square with 3% or more reach in develop.txt that has no card (natural or forced there) is a clause of its piece's rule.\n2. VERIFY every position before you write it: play its moves with line (the FEN must match) and run look; at a repertoire position (tree.txt) its answer must be the repertoire's move; the reason and every factual phrase ("guards e5", "hits b2", "can't be chased") must match a squares, grade or look output; each side line's grade and what it gives up must come from squares or grade; arrows start on pieces of the right colour. Read each rule literally against every card of its idea and against develop.txt's positions for that square (develop --piece lists them): narrow it or drop the idea when it fails. Keep your evidence in ${W}/notes.\n3. WRITE the deck.\n\n${FORMAT}\n\nEach position of an idea becomes one chapter; its "fails" position a side line in the main chapter where it fits, or its own chapter (the move marked ?); a position's "others" side lines beside its first move. A piece's other squares, where each is a real decision, are its "b", "c" chapters.\n4. Run node scripts/ideas/cv.ts check ${DECK} --rep ${W}/repertoire.pgn --depth 18 --verbose and fix every ERROR (fix the content, never just the glyph unless the glyph is what was wrong) and every warning you can, until it reports 0 errors.\nReturn a summary: the ideas and chapters written, what you dropped or narrowed and why, the final check's last line, any warnings left and why.`,
    { label: 'write', phase: 'Write', effort: 'high' })
  phase('Review')
  const critic = await agent(`${CONTEXT}\n\nYou are the CRITIC, a strong player and a demanding teacher, and you fix what you find. Read the deck at ${DECK} (the writer's report: ${writer}).\n\n${FORMAT}\n\n${CRITIC_CHECKS}\n\nThen apply each fix to the deck yourself, verifying every new or changed claim with the tools first (a fix the tools do not back is not applied), and run node scripts/ideas/cv.ts check ${DECK} --rep ${W}/repertoire.pgn --depth 18 until it reports 0 errors. Return: what you found (chapter, severity, problem, evidence), which fixes you applied and which not and why, the final check's last line, and a verdict: is this deck worth a learner's time, and what is its biggest weakness.`,
    { label: 'critic', phase: 'Review', effort: 'high' })
  return { deck: DECK, analystNotes, candidates: candidates.length, writer, critic }
}

phase('Curate')
const CURATED = {
  type: 'object',
  properties: {
    rules: { type: 'array', items: { type: 'string' }, description: 'one rule of thumb per idea, in the ideas\' order (rule n sums up idea n, the development ideas first), each about 100 characters with one condition a player can see on the board' },
    ideas: { type: 'array', items: IDEA },
    dropped: { type: 'array', items: { type: 'string' }, description: 'candidate ids dropped or merged, and why' },
  },
  required: ['rules', 'ideas', 'dropped'],
}
const curated = await agent(`${CONTEXT}\n\nYou are the CURATOR. The analysts proposed these candidate ideas (JSON):\n${JSON.stringify(candidates)}\n${lost.length ? `\nThe ${lost.join(', ')} lens produced nothing (its agent failed): cover its ground yourself where the candidates leave a gap.\n` : ''}\nMerge duplicates (the same idea from two lenses becomes one, keeping the best positions and evidence), settle contradictions with the tools (run them; do not guess), and pick at most 8 ideas with about ${CARDS} positions in all (never more than 15), by decisions.txt's value. ${DECIDE} DEVELOPMENT FIRST: the development ideas come first, ordered as the pieces come out (develop.txt's order); a piece whose square varies is one idea, with a position for each square that is a real decision; a first square with 3% or more reach that is natural or forced there is a clause of its rule, not a position. Pieces with one square can share an idea. Then the plans ideas a learner needs most, by importance and reach, ordered by when they come up in a game: what the pawn or the opening buys, the middlegame plans, tactics and attacks. Every ${THEM} setup with ≥5% reach in tree.txt must be covered by at least one idea or rule. A plans idea has 1 main position, at most 1 example and at most 1 "fails" position. Every answer at a repertoire position is the repertoire's move (check tree.txt): drop or fix any position whose answer is not. No two positions may be the same (merge them). Write one rule of thumb per idea, in the same order (rule n sums up idea n): short (about 100 characters; the development rules and the plans rules each stay under 1500 characters together), each with one condition a player can see on the board (sub-cases belong on the cards); a development rule names the piece and each square with its condition. Each rule is true by the evidence and not contradicted by any of the ideas' positions read literally. Keep every field of each idea, including evidence.`,
  { label: 'curate', phase: 'Curate', schema: CURATED })
if (!curated) return { error: 'the curator failed', candidates }
log(`${curated.ideas.length} ideas and ${curated.rules.length} rules picked; ${curated.dropped.length} dropped or merged`)

phase('Verify')
const VERDICTS = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['keep', 'fixed', 'drop'] },
          idea: IDEA,
          checked: { type: 'array', items: { type: 'string' }, description: 'what was checked: command → output → conclusion' },
        },
        required: ['verdict', 'idea', 'checked'],
      },
    },
    rulesWrong: { type: 'array', items: { type: 'string' }, description: 'rules of thumb (verbatim) these checks show to be wrong or too broad, with the correction' },
  },
  required: ['results', 'rulesWrong'],
}
const BATCHES = 4
const batches = Array.from({ length: BATCHES }, (_, b) => curated.ideas.filter((_, i) => i % BATCHES === b)).filter((b) => b.length)
const verified = await parallel(batches.map((batch, b) => () =>
  agent(`${CONTEXT}\n\nYou are a SKEPTIC. Your job is to REFUTE these ideas where they are wrong; an idea survives only what you cannot break. For each idea and each of its positions:\n1. Play its moves with line; the FEN must match. Run look.\n2. At a repertoire position (tree.txt) the answer must be the repertoire's move: it is right by definition, so do not judge it by its grade; if the idea's answer is another move, fix the idea to the repertoire's move or drop the position. Beyond the repertoire, grade the answer at depth 20: it must be great. A "fails" move must grade bad or blunder. A side line of ours ("others") must not grade better than the repertoire's move; its stated grade and what it gives up must match squares or grade.\n3. Play its line with line, and engine the end at depth 18: does it show what the text says?\n4. Every arrow must start on a piece of the right colour in that position (or where another of its arrows ends: a route), and say what the text says; circles mark the squares the text names.\n5. Every factual phrase of title, rule, why and question (e.g. "wins a piece", "the knight can't be chased", "the king is weak", "guards e5") must be confirmed by a tool output, or rewritten to what the output shows. For a development idea, run squares at each position: the reason given for the square, and against the other squares, must match the graded lines. No text may suggest the repertoire's move is a mistake or that a better one exists.\n6. Test the rule's generality in two other positions from tree.txt (or develop.txt) where it should apply: does the repertoire play what the rule says there? If not, narrow the rule (add the condition) or drop the idea.\nReturn every idea with a verdict: keep (unchanged), fixed (corrected: give the whole corrected idea), or drop; and list what you checked. Also check these rules of thumb that touch your ideas, and report any that is wrong or too broad:\n${JSON.stringify(curated.rules)}\n\nIdeas (JSON):\n${JSON.stringify(batch)}`,
    { label: `verify:${b + 1}`, phase: 'Verify', schema: VERDICTS, effort: 'high' })))
const results = verified.filter(Boolean).flatMap((v) => v.results)
const kept = results.filter((r) => r.verdict !== 'drop').map((r) => r.idea)
const rulesWrong = verified.filter(Boolean).flatMap((v) => v.rulesWrong)
log(`verified: ${results.filter((r) => r.verdict === 'keep').length} kept, ${results.filter((r) => r.verdict === 'fixed').length} fixed, ${results.filter((r) => r.verdict === 'drop').length} dropped; ${rulesWrong.length} rule corrections`)
// Ideas a failed verifier never saw are not lost silently: the writer verifies them or leaves them out.
const unverified = batches.flatMap((batch, b) => (verified[b] ? [] : batch))
if (unverified.length) log(`${unverified.length} ideas were not verified (a verifier failed); the writer checks them or leaves them out`)

phase('Write')
const writer = await agent(`${CONTEXT}\n\nYou are the WRITER. Write the idea deck to ${DECK} (create the folder if needed), from these verified ideas and rules.\n\n${FORMAT}\n\nRules of thumb (fix any that the verifiers found wrong, listed after them):\n${JSON.stringify(curated.rules)}\nCorrections from the verifiers:\n${JSON.stringify(rulesWrong)}\n\nVerified ideas (JSON):\n${JSON.stringify(kept)}\n${unverified.length ? `\nNOT verified (a verifier failed): verify these yourself with grade at depth 20 before writing them, or leave them out:\n${JSON.stringify(unverified)}` : ''}\n\nEach position of an idea becomes one chapter (main, examples), its "fails" position becoming a side line in the main chapter where it fits, or its own chapter (the move marked ?) where it does not; a position's "others" become side lines beside its first move. Number the ideas in the given order (the development ideas first, as the curator ordered them; a piece's other squares are its "b", "c" chapters, each asking the same question at its own setup). Then run: node scripts/ideas/cv.ts check ${DECK} --rep ${W}/repertoire.pgn --depth 18 --verbose\nFix every ERROR (a move the checker grades worse than its mark says means the text or the move is wrong: re-check with grade and fix the content, never just the glyph unless the glyph is what was wrong) and every warning you can; run the check again until it reports 0 errors. Return a summary: the chapters written, the final check's last line, any warnings left and why.`,
  { label: 'write', phase: 'Write' })

phase('Review')
const REVIEW = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { chapter: { type: 'string' }, severity: { type: 'string', enum: ['wrong', 'misleading', 'unclear', 'missing', 'polish'] }, problem: { type: 'string' }, fix: { type: 'string' }, evidence: { type: 'string' } },
        required: ['chapter', 'severity', 'problem', 'fix', 'evidence'],
      },
    },
    verdict: { type: 'string', description: 'is this deck worth a learner’s time, and what is its biggest weakness' },
  },
  required: ['fixes', 'verdict'],
}
const review = await agent(`${CONTEXT}\n\nYou are the CRITIC, a strong player and a demanding teacher. Read the deck at ${DECK} (the writer's report: ${writer}).\n\n${FORMAT}\n\n${CRITIC_CHECKS} Return concrete fixes (chapter, severity, problem, fix, evidence) and a verdict.`,
  { label: 'critic', phase: 'Review', schema: REVIEW, effort: 'high' })
const fixes = review ? review.fixes : []
const fixer = fixes.length
  ? await agent(`${CONTEXT}\n\nYou are the FIXER. Apply these fixes to the deck at ${DECK}, verifying every new or changed claim with the tools first (a fix the tools do not back is not applied; say so):\n${JSON.stringify(fixes)}\n\n${FORMAT}\n\nThen run node scripts/ideas/cv.ts check ${DECK} --rep ${W}/repertoire.pgn --depth 18 until it reports 0 errors. Return: which fixes were applied, which were not and why, and the final check's last line.`,
    { label: 'fix', phase: 'Review' })
  : 'no fixes'

return {
  deck: DECK,
  analystNotes,
  candidates: candidates.length,
  curated: curated.ideas.map((x) => `${x.id} (${x.section}): ${x.title}`),
  rules: curated.rules,
  dropped: curated.dropped,
  verification: results.map((r) => ({ id: r.idea.id, verdict: r.verdict, checked: r.checked.slice(0, 6) })),
  rulesWrong,
  writer,
  review,
  fixer,
}

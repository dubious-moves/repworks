// Runs mistake-lab's own voice matcher (index.html at c525403: `voiceHeardToValues`,
// `voiceBuildMovePhrasings`, `voiceTokenDistance`, `voiceMatchMove`, `voiceMoveToSpeech`) on
// voice.json's cases and writes `expected` back.
// node mistake-lab-voice.cjs <index.html> voice.json <a folder with chess.js@0.10.3 installed>
const fs = require('fs');
const path = require('path');
const { sandbox } = require('./mistake-lab-sandbox.cjs');
const [indexHtml, file, chessDir] = process.argv.slice(2);
const { Chess } = require(path.join(chessDir, 'node_modules', 'chess.js'));
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const world = sandbox(indexHtml, {
  state: `var gameEngine = null, voicePendingMove = null;`,
  globals: ['Chess', 'Float32Array'],
  constants: ['VOICE_LEX', 'VOICE_FILES', 'VOICE_RANKS', 'VOICE_PIECES'],
  functions: ['voiceHeardToValues', 'voiceBuildMovePhrasings', 'voiceTokenDistance', 'voiceMatchMove', 'voiceMoveToSpeech'],
});
for (const c of j.cases) {
  const w = world({ Chess, Float32Array });
  w.set({ gameEngine: new Chess(c.fen), voicePendingMove: c.pending ? 'x' : null });
  const values = w.voiceHeardToValues(c.heard);
  const r = w.voiceMatchMove(values);
  c.expected = { values, result: r };
}
const w = world({ Chess, Float32Array });
j.speechExpected = j.speech.map((s) => w.voiceMoveToSpeech(s));
fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n');
for (const c of j.cases) console.log(c.heard.padEnd(22), JSON.stringify(c.expected.values), JSON.stringify(c.expected.result));
console.log(j.speechExpected);

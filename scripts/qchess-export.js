// Repworks: export a Qchess study for import (PLAN.md §4.10, DECISIONS.md D18).
//
// Paste this into the DevTools console (F12 → Console) on your qchess.net study page and press
// Enter. Chrome asks you to type "allow pasting" the first time. It downloads one PGN file with
// every chapter, which Repworks imports (Import → PGN file). It changes nothing on Qchess.
//
// To each chapter's stored PGN it adds what Qchess's own "Download Study PGN" leaves out:
// - [Orientation "white" | "black"] from the chapter's side (perspective);
// - [StudyName "<the study's name>"];
// - [QchessFolder "<name>"] for a chapter in a folder;
// - [QchessTrain "false"] for a chapter, or a chapter in a folder, excluded from the MoveTrainer.
// The intro chapter is left out while it still holds Qchess's default text.
//
// Written against the study page's source as read on 2026-10-06: the globals studyData (with
// chapters[].name, pgn, perspective, is_intro, chapter_uuid, exclude_from_movetrainer, and
// folders[].name, chapter_uuids, exclude_from_movetrainer), saveCurrentChapterPgn() and
// _introPgnIsDefault(pgn). Off a Qchess page the script only hands back its pure part,
// qchessStudyToPgn, which the tests call (test/unit/scripts/qchessExport.test.ts).
(() => {
  'use strict';

  // Headers Repworks writes itself; any old copy in the stored PGN is replaced.
  const OWN = ['StudyName', 'Orientation', 'QchessFolder', 'QchessTrain', 'ChapterPerspective', 'ChapterColor'];

  // Qchess stores headers as [Tag "value"] lines without escaping, so a value may hold a bare
  // quote: the line's last quote ends it.
  function readStored(pgn) {
    const headers = [];
    const lines = String(pgn || '').replace(/\r\n?/g, '\n').split('\n');
    let i = 0;
    for (; i < lines.length; i++) {
      const m = /^\s*\[(\w+)\s+"(.*)"\]\s*$/.exec(lines[i]);
      if (m) headers.push([m[1], m[2]]);
      else if (lines[i].trim() !== '') break;
    }
    return { headers, moves: lines.slice(i).join('\n').trim() };
  }

  const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  /**
   * Every chapter of a Qchess study as one PGN text: each chapter followed by three newlines, as
   * a Lichess study export is. `isDefaultIntro` tells whether an intro chapter's PGN is still
   * Qchess's default text (the page's own _introPgnIsDefault).
   */
  function qchessStudyToPgn(study, isDefaultIntro) {
    const folders = Array.isArray(study.folders) ? study.folders : [];
    let out = '';
    (study.chapters || []).forEach((ch, i) => {
      const pgn = ch.pgn || '';
      if (ch.is_intro && isDefaultIntro && isDefaultIntro(pgn)) return;
      const { headers, moves } = readStored(pgn);
      const kept = headers.filter(([tag]) => !OWN.includes(tag));
      if (!kept.some(([tag]) => tag === 'ChapterName')) kept.unshift(['ChapterName', ch.name || `Chapter ${i + 1}`]);
      if (ch.fen && !kept.some(([tag]) => tag === 'FEN')) kept.push(['SetUp', '1'], ['FEN', ch.fen]);
      kept.unshift(['StudyName', study.name || 'Qchess study']);
      kept.push(['Orientation', ch.perspective === 'black' ? 'black' : 'white']);
      const folder = folders.find((f) => Array.isArray(f.chapter_uuids) && f.chapter_uuids.includes(ch.chapter_uuid));
      if (folder) kept.push(['QchessFolder', folder.name || '']);
      if (ch.exclude_from_movetrainer || (folder && folder.exclude_from_movetrainer)) kept.push(['QchessTrain', 'false']);
      out += `${kept.map(([tag, value]) => `[${tag} "${escape(value)}"]`).join('\n')}\n\n${moves || '*'}\n\n\n`;
    });
    return out;
  }

  if (typeof studyData === 'undefined' || typeof saveCurrentChapterPgn !== 'function') {
    console.log('Repworks: this is not a Qchess study page. Open your study on qchess.net and paste the script there.');
    return qchessStudyToPgn;
  }
  if (!studyData) return 'Repworks: the study has not loaded yet. Wait for it, then paste the script again.';
  // The open chapter's latest edits, as Qchess's own download does first.
  saveCurrentChapterPgn();
  const text = qchessStudyToPgn(studyData, typeof _introPgnIsDefault === 'function' ? _introPgnIsDefault : undefined);
  const chapters = (text.match(/^\[StudyName /gm) || []).length;
  const file = `${String(studyData.name || 'study').replace(/[^A-Za-z0-9 _.-]+/g, '_').trim() || 'study'}.qchess.pgn`;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return `Repworks: ${chapters} chapter(s) saved as ${file}. Import it in Repworks: Import → PGN file.`;
})();

// The page's title kept in step with the screen (PLAN.md §5.164; `pageTitle` in core/app/title.ts):
// the study and chapter names from the open study, the studies' list and the repertoire as read.
import { effect } from '@preact/signals';
import { pageTitle, type TitleNames } from '../core/app/title.ts';
import { ENDGAMES } from '../core/endgames/endgames.ts';
import { header } from '../core/study/model.ts';
import { study } from './editor.ts';
import { mode } from './mode.ts';
import { repById } from './repertoireEndgames.ts';
import { studies } from './state.ts';
import { trainData } from './train.ts';

const names: TitleNames = {
  study: (sid) => studies.value.find((s) => s.id === sid)?.name ?? trainData.value?.studyNames.get(sid),
  chapter: (sid, cid) => {
    const open = study.value;
    const here = open?.sid === sid ? open.chapters.find((c) => c.id === cid)?.name : undefined;
    if (here) return here;
    const c = trainData.value?.chapters.get(`${sid}/${cid}`);
    return c ? header(c, 'ChapterName') : undefined;
  },
  endgame: (id) => ENDGAMES.find((e) => e.id === id)?.title ?? repById(id)?.title,
};

/** Starts keeping `document.title` to the screen shown; the names arriving later rename it. */
export function keepTitle(): void {
  effect(() => {
    document.title = pageTitle(mode.value, names);
  });
}

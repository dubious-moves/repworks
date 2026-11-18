// Imported first by the composition root (src/app/main.ts), so the page's fetch is guarded before
// any other module runs (PLAN.md §5.203).
import { guardFetch } from './offline.ts';

guardFetch();

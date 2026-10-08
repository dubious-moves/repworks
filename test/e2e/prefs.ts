// The training settings kept per device (src/app/trainPrefs.ts), set before the page loads.
import type { Page } from '@playwright/test';

/**
 * Each line walked once and its mistakes not asked again at its end (the defaults before §5.77):
 * for specs about something else, so their walks stay as written. Set once: a reload, or settings
 * saved from the dialog, keep what is stored.
 */
export async function walkOnce(page: Page, prefs: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((p) => {
    if (localStorage.getItem('repworks.trainPrefs') === null) localStorage.setItem('repworks.trainPrefs', JSON.stringify(p));
  }, { repetitions: 1, mistakeRetries: 0, ...prefs });
}

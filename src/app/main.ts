// The composition root: wires the platform adapters to the app state and mounts the UI.
// Offline mode's guard on fetch comes before everything else (PLAN.md §5.203).
import '../platform/offlineGuard.ts';
import { h, render } from 'preact';
import '../ui/themes.css';
import '../ui/app.css';
import { App } from '../ui/App.tsx';
import { tellServiceWorker } from '../platform/offline.ts';
import { registerServiceWorker } from '../platform/serviceWorker.ts';
import { startBoardSpeech } from './boardSpeech.ts';
import { carryOverLocalLists } from './checklist.ts';
import { closeDialogsOnBackdrop } from './lightDismiss.ts';
import { takeLichessCallback } from './lichess.ts';
import { installSelectFocusRelease } from './selectFocus.ts';
import { takeSetupFromAddress } from './setup.ts';
import { shellVersion, updateReady } from './shell.ts';
import { startApp } from './state.ts';
import { startFileLaunch } from './share.ts';
import { applyTheme } from './theme.ts';
import { keepTitle } from './title.ts';

// First of all: a setup link's token, or Lichess's login code, leaves the address bar before
// anything else runs.
const link = takeSetupFromAddress();
const lichessCallback = takeLichessCallback();

applyTheme();
render(h(App, {}), document.getElementById('app')!);
// The tab's title names the screen (§5.164).
keepTitle();
closeDialogsOnBackdrop();
installSelectFocusRelease();
// Safari on iOS shows :active (a button's press, app.css) only once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });
// A frame of the styles gallery (styles.html): shown in another theme, never syncing.
void startApp(link, lichessCallback, !new URLSearchParams(location.search).has('preview'));
carryOverLocalLists();
// A .pgn opened with the installed app (§5.159).
startFileLaunch();
// The opponent's moves said on the Chessnut Move, when asked (CHESSNUT.md §4.10).
startBoardSpeech();

if (import.meta.env.PROD) {
  // The service worker's copy of offline mode follows this device's setting (§5.203).
  void tellServiceWorker();
  registerServiceWorker(import.meta.env.BASE_URL, {
    onUpdateReady: () => (updateReady.value = true),
    onVersion: (version) => (shellVersion.value = version),
  });
}

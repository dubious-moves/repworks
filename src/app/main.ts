// The composition root: wires the platform adapters to the app state and mounts the UI.
import { h, render } from 'preact';
import '../ui/app.css';
import { App } from '../ui/App.tsx';
import { registerServiceWorker } from '../platform/serviceWorker.ts';
import { shellVersion, updateReady } from './shell.ts';

render(h(App, {}), document.getElementById('app')!);

if (import.meta.env.PROD) {
  registerServiceWorker(import.meta.env.BASE_URL, {
    onUpdateReady: () => (updateReady.value = true),
    onVersion: (version) => (shellVersion.value = version),
  });
}

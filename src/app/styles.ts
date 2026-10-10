// The styles gallery's page (styles.html, src/ui/Styles.tsx): the themes side by side.
import { h, render } from 'preact';
import '../ui/themes.css';
import '../ui/app.css';
import { Styles } from '../ui/Styles.tsx';
import { applyTheme } from './theme.ts';

applyTheme();
render(h(Styles, {}), document.getElementById('app')!);

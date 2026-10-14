import { render } from 'preact';
import w400 from '@fontsource/barlow/files/barlow-latin-400-normal.woff2?url';
import w500 from '@fontsource/barlow/files/barlow-latin-500-normal.woff2?url';
import w600 from '@fontsource/barlow/files/barlow-latin-600-normal.woff2?url';
import { App } from './ui/App';
import './ui/styles.css';

// Fonts are inlined as data URIs by the single-file build, so the page works offline.
for (const [weight, url] of [
  ['400', w400],
  ['500', w500],
  ['600', w600],
] as const) {
  const face = new FontFace('Barlow', `url(${url}) format('woff2')`, { weight });
  face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
}

render(<App />, document.getElementById('app')!);

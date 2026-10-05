// Renders the app icons in public/icons from the cburnett knight that chessground ships
// (GPLv2+, Colin M.L. Burnett). Run after changing the design: `node scripts/make-icons.mjs`.
// The PNGs are committed; this script is not part of the build.
//
// In a cloud container whose Chromium doesn't match Playwright's version, set
// REPWORKS_CHROMIUM to the browser binary (CLAUDE.md).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const css = readFileSync('node_modules/@lichess-org/chessground/assets/chessground.cburnett.css', 'utf8');
const match = /piece\.knight\.white\s*\{\s*background-image:\s*url\(['"]?data:image\/svg\+xml;base64,([^'")]+)/.exec(css);
if (!match) throw new Error('white knight not found in chessground.cburnett.css');
const knight = Buffer.from(match[1], 'base64').toString('utf8');
const knightBody = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(knight)[1];

const DARK = '#22412e';
const LIGHT = '#2b5139';

// The knight's drawing spans about x 7-39 and y 9.5-40 of its 45-unit box.
function iconSvg({ maskable }) {
  const scale = maskable ? 8 : 9.6;
  const cx = 23, cy = 24.75;
  const tx = 256 - cx * scale, ty = 262 - cy * scale;
  const squares = [];
  for (let r = 0; r < 4; r++) for (let f = 0; f < 4; f++) {
    if ((r + f) % 2) squares.push(`<rect x="${f * 128}" y="${r * 128}" width="128" height="128"/>`);
  }
  const clip = maskable ? '' : '<clipPath id="r"><rect width="512" height="512" rx="104"/></clipPath>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>${clip}</defs>
<g${maskable ? '' : ' clip-path="url(#r)"'}>
<rect width="512" height="512" fill="${DARK}"/>
<g fill="${LIGHT}">${squares.join('')}</g>
<g transform="translate(${tx} ${ty}) scale(${scale})">${knightBody}</g>
</g>
</svg>
`;
}

mkdirSync('public/icons', { recursive: true });
const any = iconSvg({ maskable: false });
const maskable = iconSvg({ maskable: true });
writeFileSync('public/icons/icon.svg', any);

const browser = await chromium.launch(process.env.REPWORKS_CHROMIUM ? { executablePath: process.env.REPWORKS_CHROMIUM } : {});
const page = await browser.newPage();
async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
}
await render(any, 192, 'public/icons/icon-192.png');
await render(any, 512, 'public/icons/icon-512.png');
await render(maskable, 512, 'public/icons/icon-maskable-512.png');
await browser.close();
console.log('wrote public/icons/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png');

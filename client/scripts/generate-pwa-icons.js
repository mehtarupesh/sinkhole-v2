/**
 * Generates pwa-192.png and pwa-512.png in client/public using Playwright
 * to render icon.svg (which matches the OneBIcon component design).
 * Run from client dir: npm run generate-pwa-icons
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svgPath = join(publicDir, 'icon.svg');

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

const svgContent = readFileSync(svgPath, 'utf-8');

async function createIcon(size) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: size, height: size });

  // Render the SVG full-bleed with no page margin
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
  *, html, body { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; overflow: hidden; background: #000; }
  svg { width: ${size}px; height: ${size}px; display: block; }
</style>
</head>
<body>
${svgContent}
</body>
</html>`);

  const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(join(publicDir, `pwa-${size}.png`), buffer);
  await browser.close();
  console.log(`Created pwa-${size}.png`);
}

await createIcon(192);
await createIcon(512);
console.log('Done — pwa-192.png and pwa-512.png written to client/public');

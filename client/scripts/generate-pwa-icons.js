/**
 * Generates pwa-192.png and pwa-512.png in client/public.
 * Run from client dir: npm run generate-pwa-icons
 */
import { createWriteStream } from 'fs';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const black = 0;
  const alpha = 0xff;
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = black;
    png.data[i + 1] = black;
    png.data[i + 2] = black;
    png.data[i + 3] = alpha;
  }
  return new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(createWriteStream(join(publicDir, `pwa-${size}.png`)))
      .on('finish', resolve)
      .on('error', reject);
  });
}

await createIcon(192);
await createIcon(512);
console.log('Created pwa-192.png and pwa-512.png in client/public');

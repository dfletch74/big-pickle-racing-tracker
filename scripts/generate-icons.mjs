// Generates the app icons from embedded base64 (the GitHub push path can't
// carry binary files, so the PNGs are materialized here at build time).
// Runs via the `prebuild` npm hook, before Vite copies public/ -> dist.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPLE_TOUCH_ICON, ICON_192, ICON_512 } from './icon-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(pub, { recursive: true });
writeFileSync(join(pub, 'apple-touch-icon.png'), Buffer.from(APPLE_TOUCH_ICON, 'base64'));
writeFileSync(join(pub, 'icon-192.png'), Buffer.from(ICON_192, 'base64'));
writeFileSync(join(pub, 'icon-512.png'), Buffer.from(ICON_512, 'base64'));
console.log('app icons generated');

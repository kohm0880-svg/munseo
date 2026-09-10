import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const required = [
  'index.html',
  'apps/web/src/main.js',
  'apps/web/src/styles.css',
  'packages/core/src/index.js',
  'packages/formats/src/index.js',
  'packages/hwpx/src/importer.js',
  'packages/layout/src/index.js',
  'packages/storage/src/index.js'
];

for (const relative of required) await access(path.join(dist, relative));
const index = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!index.includes('./apps/web/src/main.js')) throw new Error('배포 index가 상대 module 경로를 사용해야 합니다.');
if (!index.includes('./apps/web/src/styles.css')) throw new Error('배포 index가 상대 CSS 경로를 사용해야 합니다.');
console.log('Static deployment smoke check passed.');

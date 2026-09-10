import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'apps'), path.join(dist, 'apps'), { recursive: true });
await cp(path.join(root, 'packages'), path.join(dist, 'packages'), { recursive: true });
await cp(path.join(root, 'samples'), path.join(dist, 'samples'), { recursive: true });

console.log(`Built static site -> ${dist}`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['apps', 'packages', 'scripts'];

test('all relative JavaScript imports resolve', async () => {
  const files = [];
  for (const dir of sourceRoots) await collect(path.join(root, dir), files);
  for (const file of files.filter((name) => name.endsWith('.js') || name.endsWith('.mjs'))) {
    const text = await readFile(file, 'utf8');
    const imports = [...text.matchAll(/(?:from\s+|import\s*)['\"](\.[^'\"]+)['\"]/g)].map((match) => match[1]);
    for (const specifier of imports) {
      const target = path.resolve(path.dirname(file), specifier);
      await assert.doesNotReject(() => access(target), `${path.relative(root, file)} -> ${specifier} 가 존재해야 합니다.`);
    }
  }
});

test('core package does not depend on app or external format packages', async () => {
  const files = [];
  await collect(path.join(root, 'packages/core'), files);
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /apps\/|packages\/(hwpx|formats|storage|layout)/);
  }
});

async function collect(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(target, out);
    else out.push(target);
  }
}

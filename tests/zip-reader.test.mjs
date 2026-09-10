import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzip } from '../packages/hwpx/src/zip-reader.js';

test('sample HWPX opens as a ZIP package', async () => {
  const bytes = await readFile(new URL('../samples/sample-fixture.hwpx', import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const files = await unzip(buffer);
  assert.ok(files.has('Contents/section0.xml'));
  assert.ok(files.size > 0);
});

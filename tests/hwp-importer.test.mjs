import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFile } from '../packages/hwp/src/index.js';

test('HWP bridge output can be wrapped as a file-like HWPX object', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const file = memoryFile('converted.hwpx', bytes);
  assert.equal(file.name, 'converted.hwpx');
  assert.equal(file.size, 4);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
});

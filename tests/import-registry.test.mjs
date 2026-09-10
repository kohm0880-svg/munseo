import test from 'node:test';
import assert from 'node:assert/strict';
import { canImport, listImportFormats, requiresModeSelection } from '../packages/formats/src/index.js';

test('file format support is isolated behind the import registry', () => {
  assert.equal(canImport('sample.HWP'), true);
  assert.equal(canImport('sample.HWPX'), true);
  assert.equal(canImport('sample.docx'), false);
  assert.equal(requiresModeSelection('sample.hwp'), true);
  assert.equal(requiresModeSelection('sample.hwpx'), true);
  assert.deepEqual(listImportFormats().map((format) => format.extensions), [['.hwp'], ['.hwpx']]);
});

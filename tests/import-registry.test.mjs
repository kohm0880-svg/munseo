import test from 'node:test';
import assert from 'node:assert/strict';
import { canImport, listImportFormats, requiresModeSelection } from '../packages/formats/src/index.js';

test('editor format registry only exposes importers that are actually normalized into Munseo documents', () => {
  assert.equal(canImport('sample.HWPX'), true);
  assert.equal(canImport('sample.HWP'), false);
  assert.equal(canImport('sample.docx'), false);
  assert.equal(requiresModeSelection('sample.hwpx'), true);
  assert.deepEqual(listImportFormats().map((format) => format.extensions), [['.hwpx']]);
});

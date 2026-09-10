import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, paragraph, table, validateDocument } from '../packages/core/src/index.js';

test('document model has a stable schema version and ids', () => {
  const doc = createDocument({ blocks: [paragraph('hello'), table([['a', 'b']])] });
  assert.equal(doc.schemaVersion, 1);
  assert.ok(doc.id);
  assert.ok(doc.blocks.every((block) => block.id));
  assert.deepEqual(validateDocument(doc), { ok: true, errors: [] });
});

test('table model keeps importer geometry without coupling core to HWPX', () => {
  const block = table([[{
    text: '자료명',
    colSpan: 2,
    rowSpan: 1,
    attrs: { sourceWidthMm: 34.64, paddingMm: { left: 1.8, right: 1.8 } }
  }]], {
    columnWidths: [0.12, 0.25, 0.63],
    sourceWidthMm: 271.8
  });

  assert.equal(block.rows[0][0].colSpan, 2);
  assert.equal(block.rows[0][0].attrs.sourceWidthMm, 34.64);
  assert.deepEqual(block.rows[0][0].attrs.paddingMm, { left: 1.8, right: 1.8 });
  assert.deepEqual(block.attrs.columnWidths, [0.12, 0.25, 0.63]);
  assert.equal(block.attrs.sourceWidthMm, 271.8);
});

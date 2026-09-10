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

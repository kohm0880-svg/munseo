import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordTree, parseHwpFileHeader, parseParagraphText, readRecords } from '../packages/hwp/src/index.js';

test('HWP FileHeader is parsed without an HWPX bridge', () => {
  const bytes = new Uint8Array(256);
  bytes.set(new TextEncoder().encode('HWP Document File'), 0);
  bytes[32] = 0; // revision
  bytes[33] = 1; // build
  bytes[34] = 1; // minor
  bytes[35] = 5; // major
  new DataView(bytes.buffer).setUint32(36, 1, true); // compressed

  const header = parseHwpFileHeader(bytes);
  assert.equal(header.versionString, '5.1.1.0');
  assert.equal(header.flags.compressed, true);
  assert.equal(header.flags.passwordEncrypted, false);
});

test('record reader preserves hierarchy and raw bytes', () => {
  const first = record(66, 0, Uint8Array.of(1, 2, 3, 4));
  const child = record(67, 1, Uint8Array.of(5, 6));
  const next = record(66, 0, Uint8Array.of(7));
  const bytes = concat(first, child, next);

  const records = readRecords(bytes);
  assert.equal(records.length, 3);
  assert.deepEqual(Array.from(records[1].data), [5, 6]);
  assert.equal(records[0].raw.byteLength, first.byteLength);

  const tree = buildRecordTree(records);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].tagId, 67);
});

test('paragraph text keeps HWP source-word positions across extended controls', () => {
  const bytes = new Uint8Array(2 + 16 + 2 + 2);
  writeU16(bytes, 0, 'A'.charCodeAt(0));
  writeU16(bytes, 2, 9); // tab: eight UTF-16 words in HWP stream
  writeU16(bytes, 18, 'B'.charCodeAt(0));
  writeU16(bytes, 20, 13); // paragraph break

  const parsed = parseParagraphText(bytes);
  assert.equal(parsed.visibleText, 'A\tB');
  assert.equal(parsed.tokens[0].sourceStart, 0);
  assert.equal(parsed.tokens[1].sourceStart, 1);
  assert.equal(parsed.tokens[1].sourceLength, 8);
  assert.equal(parsed.tokens[2].sourceStart, 9);
});

function record(tagId, level, data) {
  if (data.byteLength >= 0xfff) throw new Error('test helper only supports short records');
  const bytes = new Uint8Array(4 + data.byteLength);
  const header = (tagId & 0x3ff) | ((level & 0x3ff) << 10) | ((data.byteLength & 0xfff) << 20);
  new DataView(bytes.buffer).setUint32(0, header >>> 0, true);
  bytes.set(data, 4);
  return bytes;
}

function concat(...chunks) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function writeU16(bytes, offset, value) {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}

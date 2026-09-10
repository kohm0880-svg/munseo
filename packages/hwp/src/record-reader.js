import { readU32, toUint8Array } from './cfb-reader.js';

/** HWP BodyText/DocInfo common record header parser. */
export function readRecords(input) {
  const bytes = toUint8Array(input);
  const records = [];
  let offset = 0;
  let index = 0;

  while (offset + 4 <= bytes.byteLength) {
    const recordOffset = offset;
    const header = readU32(bytes, offset);
    offset += 4;

    const tagId = header & 0x3ff;
    const level = (header >>> 10) & 0x3ff;
    let size = (header >>> 20) & 0xfff;
    let headerSize = 4;

    if (size === 0xfff) {
      if (offset + 4 > bytes.byteLength) throw new Error(`확장 레코드 크기를 읽을 수 없습니다. offset=${recordOffset}`);
      size = readU32(bytes, offset);
      offset += 4;
      headerSize = 8;
    }

    if (offset + size > bytes.byteLength) {
      throw new Error(`HWP 레코드가 스트림 경계를 넘습니다. tag=${tagId}, offset=${recordOffset}, size=${size}`);
    }

    const data = bytes.subarray(offset, offset + size);
    const raw = bytes.subarray(recordOffset, offset + size);
    records.push({ index, tagId, level, size, headerSize, offset: recordOffset, data, raw });
    index += 1;
    offset += size;
  }

  if (offset !== bytes.byteLength) {
    throw new Error(`HWP 레코드 스트림 끝에 ${bytes.byteLength - offset}바이트가 남았습니다.`);
  }
  return records;
}

/**
 * Level 정보를 부모/자식 관계로 바꾼다. 원본 순서와 raw bytes는 각 node에 그대로 남는다.
 */
export function buildRecordTree(records) {
  const roots = [];
  const stack = [];

  for (const record of records) {
    const node = { ...record, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

export function subtreeEnd(records, index) {
  const level = records[index]?.level;
  if (level == null) return index + 1;
  let cursor = index + 1;
  while (cursor < records.length && records[cursor].level > level) cursor += 1;
  return cursor;
}

export async function inflateHwpStream(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('이 브라우저는 HWP 압축 해제에 필요한 DecompressionStream을 지원하지 않습니다.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

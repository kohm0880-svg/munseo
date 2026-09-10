export async function unzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 65557);

  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP 중앙 디렉터리를 찾지 못했습니다.');

  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder('utf-8');
  const files = new Map();
  let ptr = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error('ZIP 중앙 디렉터리가 손상되었습니다.');
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));

    if (!name.endsWith('/')) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`ZIP 항목을 읽을 수 없습니다: ${name}`);
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let data;

      if (method === 0) {
        data = compressed;
      } else if (method === 8) {
        if (!globalThis.DecompressionStream) {
          throw new Error('이 실행 환경은 ZIP deflate 압축 해제를 지원하지 않습니다.');
        }
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error(`아직 지원하지 않는 ZIP 압축 방식입니다: ${method}`);
      }

      if (uncompressedSize && data.length !== uncompressedSize) {
        console.warn('ZIP size mismatch', name, data.length, uncompressedSize);
      }
      files.set(name, data);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

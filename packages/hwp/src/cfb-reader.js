const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;

/**
 * Minimal Compound File Binary reader for HWP 5.x.
 *
 * This module knows CFB only. It deliberately knows nothing about HWP records,
 * document models, DOM, or rendering. Keeping this boundary small lets us
 * replace/verify HWP semantics without touching the container reader.
 */
export class CfbReader {
  constructor(input) {
    this.bytes = toUint8Array(input);
    if (!hasCfbSignature(this.bytes)) throw new Error('CFB 시그니처가 아닙니다.');
    if (this.bytes.byteLength < 512) throw new Error('CFB 헤더가 너무 짧습니다.');

    this.sectorSize = 1 << readU16(this.bytes, 30);
    this.miniSectorSize = 1 << readU16(this.bytes, 32);
    this.numFatSectors = readU32(this.bytes, 44);
    this.firstDirectorySector = readU32(this.bytes, 48);
    this.miniStreamCutoff = readU32(this.bytes, 56);
    this.firstMiniFatSector = readU32(this.bytes, 60);
    this.numMiniFatSectors = readU32(this.bytes, 64);

    this.fat = this.#buildFat();
    this.entries = this.#readDirectory();
    this.root = this.entries[0] ?? null;
    this.miniStream = this.root
      ? this.#readRegularChain(this.root.startSector).subarray(0, Number(this.root.size))
      : new Uint8Array();
    this.miniFat = this.numMiniFatSectors && !isChainEnd(this.firstMiniFatSector)
      ? u32Array(this.#readRegularChain(this.firstMiniFatSector))
      : [];

    this.paths = new Map();
    if (this.root) this.#walkStorage(0, '');
  }

  listPaths(pattern = null) {
    const paths = Array.from(this.paths.keys());
    return pattern ? paths.filter((path) => pattern.test(path)) : paths;
  }

  hasStream(path) {
    const index = this.paths.get(path);
    return index != null && this.entries[index]?.type === 2;
  }

  readStream(path) {
    const index = this.paths.get(path);
    if (index == null) return null;
    const entry = this.entries[index];
    if (!entry || entry.type !== 2) return null;

    if (entry.size < this.miniStreamCutoff && this.miniFat.length) {
      const chunks = [];
      for (const sector of chain(entry.startSector, this.miniFat)) {
        const start = sector * this.miniSectorSize;
        chunks.push(this.miniStream.subarray(start, start + this.miniSectorSize));
      }
      return concat(chunks).subarray(0, Number(entry.size));
    }

    return this.#readRegularChain(entry.startSector).subarray(0, Number(entry.size));
  }

  #buildFat() {
    const difat = [];
    for (let i = 0; i < 109; i += 1) difat.push(readU32(this.bytes, 76 + i * 4));

    let nextDifat = readU32(this.bytes, 68);
    const numDifat = readU32(this.bytes, 72);
    for (let n = 0; n < numDifat && !isChainEnd(nextDifat); n += 1) {
      const sector = this.#readSector(nextDifat);
      const count = this.sectorSize / 4;
      for (let i = 0; i < count - 1; i += 1) difat.push(readU32(sector, i * 4));
      nextDifat = readU32(sector, (count - 1) * 4);
    }

    const fat = [];
    for (const sectorId of difat.filter((value) => value !== FREE_SECTOR).slice(0, this.numFatSectors)) {
      fat.push(...u32Array(this.#readSector(sectorId)));
    }
    return fat;
  }

  #readDirectory() {
    const bytes = this.#readRegularChain(this.firstDirectorySector);
    const entries = [];
    for (let offset = 0; offset + 128 <= bytes.byteLength; offset += 128) {
      const view = bytes.subarray(offset, offset + 128);
      const nameLength = readU16(view, 64);
      const name = nameLength >= 2
        ? decodeUtf16(view.subarray(0, Math.min(64, nameLength - 2)))
        : '';
      entries.push({
        name,
        type: view[66],
        left: readU32(view, 68),
        right: readU32(view, 72),
        child: readU32(view, 76),
        startSector: readU32(view, 116),
        size: readU64(view, 120)
      });
    }
    return entries;
  }

  #walkStorage(index, prefix) {
    const entry = this.entries[index];
    if (!entry) return;
    for (const childIndex of this.#treeIds(entry.child)) {
      const child = this.entries[childIndex];
      if (!child?.name) continue;
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      this.paths.set(path, childIndex);
      if (child.type === 1) this.#walkStorage(childIndex, path);
    }
  }

  #treeIds(rootIndex) {
    const output = [];
    const seen = new Set();
    const visit = (index) => {
      if (index === FREE_SECTOR || index === END_OF_CHAIN || index >= this.entries.length || seen.has(index)) return;
      seen.add(index);
      const entry = this.entries[index];
      if (!entry) return;
      visit(entry.left);
      output.push(index);
      visit(entry.right);
    };
    visit(rootIndex);
    return output;
  }

  #readRegularChain(startSector) {
    const chunks = chain(startSector, this.fat).map((sector) => this.#readSector(sector));
    return concat(chunks);
  }

  #readSector(sectorId) {
    const start = 512 + sectorId * this.sectorSize;
    return this.bytes.subarray(start, start + this.sectorSize);
  }
}

export function hasCfbSignature(input) {
  const bytes = toUint8Array(input);
  return bytes.byteLength >= 8 && CFB_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('바이트 배열이 필요합니다.');
}

export function readU16(bytes, offset) {
  if (offset + 2 > bytes.byteLength) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

export function readU32(bytes, offset) {
  if (offset + 4 > bytes.byteLength) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

export function readI32(bytes, offset) {
  if (offset + 4 > bytes.byteLength) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true);
}

function readU64(bytes, offset) {
  if (offset + 8 > bytes.byteLength) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  if (typeof view.getBigUint64 === 'function') return Number(view.getBigUint64(0, true));
  return view.getUint32(0, true) + view.getUint32(4, true) * 0x100000000;
}

function u32Array(bytes) {
  const output = [];
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) output.push(readU32(bytes, offset));
  return output;
}

function chain(start, fat) {
  const output = [];
  const seen = new Set();
  let current = start;
  while (!isChainEnd(current) && current < fat.length && !seen.has(current) && output.length < 100000) {
    seen.add(current);
    output.push(current);
    current = fat[current];
  }
  return output;
}

function isChainEnd(value) {
  return value === END_OF_CHAIN || value === FREE_SECTOR || value >= 0xfffffffc;
}

function decodeUtf16(bytes) {
  return new TextDecoder('utf-16le').decode(bytes).replace(/\u0000+$/g, '');
}

function concat(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

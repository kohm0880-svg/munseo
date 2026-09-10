const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const HWP_TAG_CTRL_HEADER = 71;
const HWP_TAG_LIST_HEADER = 72;
const HWP_TAG_PAGE_DEF = 73;
const HWP_TAG_TABLE = 77;

/**
 * HWP 5.x의 본문 내용은 기존 변환기에 맡기되, 변환 과정에서 빠지는
 * 페이지 방향/여백과 표 셀의 실제 기하만 원본 CFB에서 직접 읽습니다.
 * 이 모듈은 HWP 전체 파서가 아니라 의도적으로 좁은 layout adapter 입니다.
 */
export async function extractHwpLayoutMetadata(input) {
  const bytes = toUint8Array(input);
  if (!hasCfbSignature(bytes)) return { printProfiles: [], tables: [], warnings: ['CFB HWP 5.x 파일이 아닙니다.'] };

  try {
    const cfb = new CfbReader(bytes);
    const header = cfb.readStream('FileHeader');
    const flags = header?.byteLength >= 40 ? readU32(header, 36) : 0;
    const compressed = Boolean(flags & 0x01);
    const sectionPaths = cfb.listPaths(/^BodyText\/Section\d+$/i)
      .sort((a, b) => sectionNumber(a) - sectionNumber(b));

    const printProfiles = [];
    const tables = [];
    const warnings = [];

    for (const path of sectionPaths) {
      let section = cfb.readStream(path);
      if (!section) continue;
      if (compressed) {
        try {
          section = await inflateRaw(section);
        } catch (error) {
          warnings.push(`${path}: 레이아웃 메타데이터 압축 해제 실패 (${error?.message || error})`);
          continue;
        }
      }
      const records = parseRecords(section);
      const pageDef = records.find((record) => record.tagId === HWP_TAG_PAGE_DEF);
      if (pageDef) printProfiles.push(parsePageDef(pageDef.data));
      tables.push(...parseTables(records));
    }

    return {
      printProfiles: printProfiles.filter(Boolean),
      tables,
      warnings
    };
  } catch (error) {
    return {
      printProfiles: [],
      tables: [],
      warnings: [`HWP 원본 레이아웃 메타데이터를 읽지 못했습니다. (${error?.message || error})`]
    };
  }
}

export function applyHwpLayoutMetadata(result, metadata) {
  if (!result?.document || !metadata) return result;
  const firstProfile = metadata.printProfiles?.[0];
  if (firstProfile) result.document.printProfile = { ...result.document.printProfile, ...firstProfile };

  const blocks = result.document.blocks.filter((block) => block.type === 'table');
  for (let index = 0; index < Math.min(blocks.length, metadata.tables?.length || 0); index += 1) {
    const block = blocks[index];
    const source = metadata.tables[index];
    block.attrs ||= {};
    if (source.columnWidths?.length) block.attrs.columnWidths = [...source.columnWidths];
    if (source.rowHeightsMm?.length) block.attrs.rowHeightsMm = [...source.rowHeightsMm];
    if (source.widthMm) block.attrs.sourceWidthMm = source.widthMm;
    if (source.heightMm) block.attrs.sourceHeightMm = source.heightMm;
    if (source.heightMm && source.heightMm <= 180) block.attrs.keepTogether = true;

    const byAddress = new Map();
    for (const row of block.rows || []) {
      for (const cell of row) {
        const col = Number(cell.attrs?.colAddr);
        const rowAddr = Number(cell.attrs?.rowAddr);
        if (Number.isFinite(col) && Number.isFinite(rowAddr)) byAddress.set(`${rowAddr}:${col}`, cell);
      }
    }

    for (const sourceCell of source.cells || []) {
      let cell = byAddress.get(`${sourceCell.row}:${sourceCell.col}`);
      if (!cell) cell = block.rows?.[sourceCell.row]?.find((candidate, i) => i === sourceCell.col);
      if (!cell) continue;
      cell.attrs ||= {};
      cell.attrs.colAddr = sourceCell.col;
      cell.attrs.rowAddr = sourceCell.row;
      cell.attrs.sourceWidthMm = sourceCell.widthMm;
      cell.attrs.sourceHeightMm = sourceCell.heightMm;
      cell.attrs.paddingMm = sourceCell.paddingMm;
      if (sourceCell.colSpan) cell.colSpan = sourceCell.colSpan;
      if (sourceCell.rowSpan) cell.rowSpan = sourceCell.rowSpan;
    }
  }

  if (metadata.warnings?.length) result.warnings = [...(result.warnings || []), ...metadata.warnings];
  return result;
}

function parseTables(records) {
  const tables = [];
  for (let i = 0; i < records.length; i += 1) {
    const ctrl = records[i];
    if (ctrl.tagId !== HWP_TAG_CTRL_HEADER || ctrl.data.byteLength < 4) continue;
    if (ctrlId(ctrl.data) !== 'tbl ') continue;

    const end = subtreeEnd(records, i);
    const children = records.slice(i + 1, end);
    const tableRecordIndex = children.findIndex((record) =>
      record.level === ctrl.level + 1 && record.tagId === HWP_TAG_TABLE
    );
    if (tableRecordIndex < 0) continue;

    const tableRecord = children[tableRecordIndex];
    const tableMeta = parseTableRecord(tableRecord.data);
    const cells = [];
    for (let j = tableRecordIndex + 1; j < children.length; j += 1) {
      const record = children[j];
      if (record.level !== ctrl.level + 1 || record.tagId !== HWP_TAG_LIST_HEADER) continue;
      const cell = parseCellHeader(record.data);
      if (cell) cells.push(cell);
    }

    const columnWidths = inferColumnWidths(cells, tableMeta.colCount);
    const rowHeightsMm = inferRowHeights(cells, tableMeta.rowCount);
    const widthMm = columnWidths?.sourceTotalHwp ? hwpUnitToMm(columnWidths.sourceTotalHwp) : null;
    const heightHwp = rowHeightsMm?.sourceTotalHwp || null;

    tables.push({
      rowCount: tableMeta.rowCount,
      colCount: tableMeta.colCount,
      cells,
      columnWidths: columnWidths?.ratios || null,
      rowHeightsMm: rowHeightsMm?.values || null,
      widthMm,
      heightMm: heightHwp ? hwpUnitToMm(heightHwp) : null
    });
    i = Math.max(i, end - 1);
  }
  return tables;
}

function parseTableRecord(data) {
  if (data.byteLength < 8) return { rowCount: 0, colCount: 0 };
  return { rowCount: readU16(data, 4), colCount: readU16(data, 6) };
}

function parseCellHeader(data) {
  // LIST_HEADER 공통 8 bytes 다음에 HWP 표 셀 메타데이터가 이어집니다.
  if (data.byteLength < 32) return null;
  const col = readU16(data, 8);
  const row = readU16(data, 10);
  const colSpan = Math.max(1, readU16(data, 12));
  const rowSpan = Math.max(1, readU16(data, 14));
  const widthHwp = readU32(data, 16);
  const heightHwp = readU32(data, 20);
  return {
    col,
    row,
    colSpan,
    rowSpan,
    widthHwp,
    heightHwp,
    widthMm: hwpUnitToMm(widthHwp),
    heightMm: hwpUnitToMm(heightHwp),
    paddingMm: {
      left: hwpUnitToMm(readU16(data, 24)),
      right: hwpUnitToMm(readU16(data, 26)),
      top: hwpUnitToMm(readU16(data, 28)),
      bottom: hwpUnitToMm(readU16(data, 30))
    }
  };
}

function inferColumnWidths(cells, colCount) {
  if (!colCount) return null;
  const slots = Array.from({ length: colCount }, () => []);
  const spans = [];
  for (const cell of cells) {
    if (!cell.widthHwp || cell.col < 0 || cell.col >= colCount) continue;
    if (cell.colSpan === 1) slots[cell.col].push(cell.widthHwp);
    else spans.push(cell);
  }
  const widths = slots.map(median);
  for (let pass = 0; pass < colCount + 2; pass += 1) {
    let changed = false;
    for (const cell of spans) {
      const indices = Array.from({ length: Math.min(cell.colSpan, colCount - cell.col) }, (_, offset) => cell.col + offset);
      const unknown = indices.filter((index) => !widths[index]);
      if (!unknown.length) continue;
      const known = indices.reduce((sum, index) => sum + (widths[index] || 0), 0);
      const remaining = Math.max(0, cell.widthHwp - known);
      if (unknown.length === 1 && remaining) {
        widths[unknown[0]] = remaining;
        changed = true;
      } else if (!known && remaining) {
        for (const index of unknown) widths[index] = remaining / unknown.length;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const knownValues = widths.filter(Boolean);
  const fallback = median(knownValues) || 1;
  for (let i = 0; i < widths.length; i += 1) if (!widths[i]) widths[i] = fallback;
  const total = widths.reduce((sum, value) => sum + value, 0);
  return { ratios: widths.map((value) => value / total), sourceTotalHwp: total };
}

function inferRowHeights(cells, rowCount) {
  if (!rowCount) return null;
  const rows = Array.from({ length: rowCount }, () => []);
  for (const cell of cells) if (cell.rowSpan === 1 && cell.row >= 0 && cell.row < rowCount && cell.heightHwp) rows[cell.row].push(cell.heightHwp);
  const hwp = rows.map((values) => median(values));
  const fallback = median(hwp.filter(Boolean)) || null;
  const normalized = hwp.map((value) => value || fallback);
  if (!normalized.some(Boolean)) return null;
  return {
    values: normalized.map((value) => value ? hwpUnitToMm(value) : null),
    sourceTotalHwp: normalized.reduce((sum, value) => sum + (value || 0), 0)
  };
}

function parsePageDef(data) {
  if (data.byteLength < 40) return null;
  const widthMm = hwpUnitToMm(readU32(data, 0));
  const heightMm = hwpUnitToMm(readU32(data, 4));
  const attr = readU32(data, 36);
  const paper = matchPaper(widthMm, heightMm);
  return compact({
    paper,
    orientation: (attr & 0x01) ? 'landscape' : 'portrait',
    marginLeftMm: hwpUnitToMm(readU32(data, 8)),
    marginRightMm: hwpUnitToMm(readU32(data, 12)),
    marginTopMm: hwpUnitToMm(readU32(data, 16)),
    marginBottomMm: hwpUnitToMm(readU32(data, 20))
  });
}

function matchPaper(widthMm, heightMm) {
  const presets = [
    ['A4', 210, 297], ['A3', 297, 420], ['B4_ISO', 250, 353],
    ['B4_JIS', 257, 364], ['LETTER', 215.9, 279.4]
  ];
  const actual = [Math.min(widthMm, heightMm), Math.max(widthMm, heightMm)];
  let best = null;
  let error = Infinity;
  for (const [id, width, height] of presets) {
    const expected = [Math.min(width, height), Math.max(width, height)];
    const next = Math.abs(actual[0] - expected[0]) + Math.abs(actual[1] - expected[1]);
    if (next < error) { best = id; error = next; }
  }
  return error <= 4 ? best : null;
}

function parseRecords(bytes) {
  const records = [];
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const header = readU32(bytes, offset);
    offset += 4;
    const tagId = header & 0x3ff;
    const level = (header >>> 10) & 0x3ff;
    let size = (header >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (offset + 4 > bytes.byteLength) break;
      size = readU32(bytes, offset);
      offset += 4;
    }
    if (size < 0 || offset + size > bytes.byteLength) break;
    records.push({ tagId, level, data: bytes.subarray(offset, offset + size) });
    offset += size;
  }
  return records;
}

function subtreeEnd(records, index) {
  const level = records[index].level;
  let i = index + 1;
  while (i < records.length && records[i].level > level) i += 1;
  return i;
}

function ctrlId(data) {
  if (data.byteLength < 4) return '';
  return String.fromCharCode(data[3], data[2], data[1], data[0]);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 raw deflate 해제를 지원하지 않습니다.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class CfbReader {
  constructor(input) {
    this.bytes = toUint8Array(input);
    if (!hasCfbSignature(this.bytes)) throw new Error('CFB 시그니처가 아닙니다.');
    this.sectorSize = 1 << readU16(this.bytes, 30);
    this.miniSectorSize = 1 << readU16(this.bytes, 32);
    this.numFatSectors = readU32(this.bytes, 44);
    this.firstDirectorySector = readU32(this.bytes, 48);
    this.miniStreamCutoff = readU32(this.bytes, 56);
    this.firstMiniFatSector = readU32(this.bytes, 60);
    this.numMiniFatSectors = readU32(this.bytes, 64);
    this.fat = this.buildFat();
    this.entries = this.readDirectory();
    this.root = this.entries[0];
    this.miniStream = this.root ? this.readRegularChain(this.root.startSector).subarray(0, Number(this.root.size)) : new Uint8Array();
    this.miniFat = this.numMiniFatSectors && !isChainEnd(this.firstMiniFatSector)
      ? u32Array(this.readRegularChain(this.firstMiniFatSector))
      : [];
    this.paths = new Map();
    if (this.root) this.walkStorage(0, '');
  }

  listPaths(pattern) {
    return Array.from(this.paths.keys()).filter((path) => pattern.test(path));
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
    return this.readRegularChain(entry.startSector).subarray(0, Number(entry.size));
  }

  buildFat() {
    const difat = [];
    for (let i = 0; i < 109; i += 1) difat.push(readU32(this.bytes, 76 + i * 4));
    let nextDifat = readU32(this.bytes, 68);
    const numDifat = readU32(this.bytes, 72);
    for (let n = 0; n < numDifat && !isChainEnd(nextDifat); n += 1) {
      const sector = this.readSector(nextDifat);
      const count = this.sectorSize / 4;
      for (let i = 0; i < count - 1; i += 1) difat.push(readU32(sector, i * 4));
      nextDifat = readU32(sector, (count - 1) * 4);
    }
    const fat = [];
    for (const sectorId of difat.filter((value) => value !== FREE_SECTOR).slice(0, this.numFatSectors)) {
      fat.push(...u32Array(this.readSector(sectorId)));
    }
    return fat;
  }

  readDirectory() {
    const bytes = this.readRegularChain(this.firstDirectorySector);
    const entries = [];
    for (let offset = 0; offset + 128 <= bytes.byteLength; offset += 128) {
      const view = bytes.subarray(offset, offset + 128);
      const nameLength = readU16(view, 64);
      const name = nameLength >= 2 ? decodeUtf16(view.subarray(0, Math.min(64, nameLength - 2))) : '';
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

  walkStorage(index, prefix) {
    const entry = this.entries[index];
    if (!entry) return;
    for (const childIndex of this.treeIds(entry.child)) {
      const child = this.entries[childIndex];
      if (!child?.name) continue;
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      this.paths.set(path, childIndex);
      if (child.type === 1) this.walkStorage(childIndex, path);
    }
  }

  treeIds(rootIndex) {
    const output = [];
    const seen = new Set();
    const visit = (index) => {
      if (index === FREE_SECTOR || index === END_OF_CHAIN || index >= this.entries.length || seen.has(index)) return;
      seen.add(index);
      const entry = this.entries[index];
      visit(entry.left);
      output.push(index);
      visit(entry.right);
    };
    visit(rootIndex);
    return output;
  }

  readRegularChain(startSector) {
    const chunks = chain(startSector, this.fat).map((sector) => this.readSector(sector));
    return concat(chunks);
  }

  readSector(sectorId) {
    const start = 512 + sectorId * this.sectorSize;
    return this.bytes.subarray(start, start + this.sectorSize);
  }
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

function hasCfbSignature(bytes) {
  return CFB_SIGNATURE.every((value, index) => bytes[index] === value);
}

function sectionNumber(path) {
  return Number(path.match(/Section(\d+)/i)?.[1] || 0);
}

function hwpUnitToMm(value) {
  return Number(value) * 25.4 / 7200;
}

function median(values) {
  const list = (values || []).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

function readU16(bytes, offset) {
  if (offset + 2 > bytes.byteLength) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readU32(bytes, offset) {
  if (offset + 4 > bytes.byteLength) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
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

function decodeUtf16(bytes) {
  return new TextDecoder('utf-16le').decode(bytes).replace(/\u0000+$/g, '');
}

function concat(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('바이트 배열이 필요합니다.');
}

function isChainEnd(value) {
  return value === END_OF_CHAIN || value === FREE_SECTOR || value >= 0xfffffffc;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null));
}

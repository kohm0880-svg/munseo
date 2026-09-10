import { readI32, readU16, readU32 } from './cfb-reader.js';
import { HWP_TAG, ctrlIdFromBytes } from './tags.js';
import { subtreeEnd } from './record-reader.js';

export function parseHwpSection(records, sectionIndex = 0) {
  const baseLevel = records.length ? Math.min(...records.map((record) => record.level)) : 0;
  const paragraphs = parseParagraphList(records, baseLevel);
  const pageDefRecord = records.find((record) => record.tagId === HWP_TAG.PAGE_DEF);
  return {
    type: 'hwp-section',
    index: sectionIndex,
    page: pageDefRecord ? parsePageDef(pageDefRecord.data) : null,
    paragraphs,
    records
  };
}

export function parseParagraphList(records, baseLevel) {
  const paragraphs = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.tagId !== HWP_TAG.PARA_HEADER || record.level !== baseLevel) continue;
    const end = subtreeEnd(records, index);
    paragraphs.push(parseParagraph(records.slice(index, end)));
    index = end - 1;
  }
  return paragraphs;
}

export function parseParagraph(records) {
  const headerRecord = records[0];
  const baseLevel = headerRecord.level;
  const header = parseParagraphHeader(headerRecord.data);
  let text = emptyTextStream();
  let charShapeChanges = [];
  const lineSegments = [];
  const rangeTags = [];
  const controls = [];

  for (let index = 1; index < records.length; index += 1) {
    const record = records[index];
    if (record.level !== baseLevel + 1) continue;

    if (record.tagId === HWP_TAG.PARA_TEXT) {
      text = parseParagraphText(record.data);
    } else if (record.tagId === HWP_TAG.PARA_CHAR_SHAPE) {
      charShapeChanges = parseCharShapeChanges(record.data);
    } else if (record.tagId === HWP_TAG.PARA_LINE_SEG) {
      lineSegments.push(...parseLineSegments(record.data));
    } else if (record.tagId === HWP_TAG.PARA_RANGE_TAG) {
      rangeTags.push(...parseRangeTags(record.data));
    } else if (record.tagId === HWP_TAG.CTRL_HEADER) {
      const end = subtreeEnd(records, index);
      controls.push(parseControl(record, records.slice(index + 1, end)));
      index = end - 1;
    }
  }

  return {
    type: 'paragraph',
    header,
    text,
    charShapeChanges,
    lineSegments,
    rangeTags,
    controls,
    records
  };
}

function parseParagraphHeader(data) {
  return {
    charCount: data.byteLength >= 4 ? readU32(data, 0) & 0x7fffffff : 0,
    controlMask: data.byteLength >= 8 ? readU32(data, 4) : 0,
    paraShapeId: data.byteLength >= 10 ? readU16(data, 8) : 0,
    styleId: data.byteLength >= 11 ? data[10] : 0,
    divideType: data.byteLength >= 12 ? data[11] : 0,
    charShapeCount: data.byteLength >= 14 ? readU16(data, 12) : 0,
    rangeTagCount: data.byteLength >= 16 ? readU16(data, 14) : 0,
    lineAlignCount: data.byteLength >= 18 ? readU16(data, 16) : 0
  };
}

/**
 * Keeps visible text and source-word positions separately.
 * HWP char-shape positions are based on the source paragraph character stream,
 * where extended controls occupy eight UTF-16 words; flattening them too early
 * would make style positions drift.
 */
export function parseParagraphText(data) {
  const tokens = [];
  let visibleText = '';
  let byteOffset = 0;
  let sourceWord = 0;

  const push = (token) => {
    tokens.push(token);
    if (token.visible) visibleText += token.visible;
  };

  while (byteOffset + 1 < data.byteLength) {
    const ch = readU16(data, byteOffset);
    const startWord = sourceWord;

    if (ch === 0x0d) {
      push({ kind: 'paragraph-break', code: ch, sourceStart: startWord, sourceLength: 1, visible: '' });
      break;
    }
    if (ch === 0x09) {
      push({ kind: 'tab', code: ch, sourceStart: startWord, sourceLength: 8, visible: '\t', raw: data.subarray(byteOffset, Math.min(data.byteLength, byteOffset + 16)) });
      byteOffset += 16;
      sourceWord += 8;
      continue;
    }
    if (ch === 0x0a) {
      push({ kind: 'line-break', code: ch, sourceStart: startWord, sourceLength: 1, visible: '\n' });
      byteOffset += 2;
      sourceWord += 1;
      continue;
    }
    if (isExtendedControl(ch)) {
      push({ kind: 'control', code: ch, sourceStart: startWord, sourceLength: 8, visible: '', raw: data.subarray(byteOffset, Math.min(data.byteLength, byteOffset + 16)) });
      byteOffset += 16;
      sourceWord += 8;
      continue;
    }
    if (ch < 0x20) {
      const visible = ch === 0x18 || ch === 0x19 || ch === 0x1f ? ' ' : ch === 0x1e ? '-' : '';
      push({ kind: 'control-char', code: ch, sourceStart: startWord, sourceLength: 1, visible });
      byteOffset += 2;
      sourceWord += 1;
      continue;
    }

    if (ch >= 0xd800 && ch <= 0xdbff && byteOffset + 3 < data.byteLength) {
      const low = readU16(data, byteOffset + 2);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const visible = String.fromCharCode(ch, low);
        push({ kind: 'text', sourceStart: startWord, sourceLength: 2, visible });
        byteOffset += 4;
        sourceWord += 2;
        continue;
      }
    }

    push({ kind: 'text', sourceStart: startWord, sourceLength: 1, visible: String.fromCharCode(ch) });
    byteOffset += 2;
    sourceWord += 1;
  }

  return { visibleText, sourceWordLength: sourceWord, tokens };
}

function parseCharShapeChanges(data) {
  const changes = [];
  for (let offset = 0; offset + 8 <= data.byteLength; offset += 8) {
    changes.push({ sourceCharPos: readU32(data, offset), charShapeId: readU32(data, offset + 4) });
  }
  return changes;
}

function parseLineSegments(data) {
  // HWP 5.x line segment entries use a fixed-width cache record. The exact
  // interpretation is retained here because these values are useful as import
  // fidelity hints but must be invalidated after edits.
  const segments = [];
  const stride = 36;
  for (let offset = 0; offset + stride <= data.byteLength; offset += stride) {
    segments.push({
      textStart: readU32(data, offset),
      verticalPosition: readI32(data, offset + 4),
      lineHeight: readI32(data, offset + 8),
      textHeight: readI32(data, offset + 12),
      baselineDistance: readI32(data, offset + 16),
      lineSpacing: readI32(data, offset + 20),
      columnStart: readI32(data, offset + 24),
      segmentWidth: readI32(data, offset + 28),
      flags: readU32(data, offset + 32)
    });
  }
  return segments;
}

function parseRangeTags(data) {
  const tags = [];
  const stride = 12;
  for (let offset = 0; offset + stride <= data.byteLength; offset += stride) {
    tags.push({
      start: readU32(data, offset),
      end: readU32(data, offset + 4),
      tag: readU32(data, offset + 8)
    });
  }
  return tags;
}

function parseControl(headerRecord, children) {
  const id = ctrlIdFromBytes(headerRecord.data);
  const baseLevel = headerRecord.level;

  if (id === 'tbl ') return parseTableControl(id, headerRecord, children);

  // Text-bearing controls (header/footer/footnote/text boxes etc.) are kept as
  // nested stories when paragraph records are present. Geometry semantics are
  // intentionally parsed by dedicated control parsers later, not by the UI.
  const paragraphLevels = children
    .filter((record) => record.tagId === HWP_TAG.PARA_HEADER)
    .map((record) => record.level);
  const storyLevel = paragraphLevels.length ? Math.min(...paragraphLevels) : null;
  const story = storyLevel == null ? [] : parseParagraphList(children, storyLevel);

  const outOfScope = children.some((record) =>
    record.tagId === HWP_TAG.CHART_DATA || record.tagId === HWP_TAG.SHAPE_COMPONENT_OLE
  );

  return {
    type: 'control',
    id,
    scope: outOfScope ? 'out-of-scope' : 'standard',
    story,
    header: headerRecord.data,
    records: [headerRecord, ...children],
    baseLevel
  };
}

function parseTableControl(id, headerRecord, children) {
  const baseLevel = headerRecord.level;
  const tableRecordIndex = children.findIndex((record) =>
    record.level === baseLevel + 1 && record.tagId === HWP_TAG.TABLE
  );
  if (tableRecordIndex < 0) {
    return { type: 'table', id, rowCount: 0, colCount: 0, cells: [], records: [headerRecord, ...children] };
  }

  const tableMeta = parseTableMeta(children[tableRecordIndex].data);
  const cells = [];

  for (let index = tableRecordIndex + 1; index < children.length; index += 1) {
    const record = children[index];
    if (record.level !== baseLevel + 1 || record.tagId !== HWP_TAG.LIST_HEADER) continue;

    const cell = parseTableCellMeta(record.data);
    let end = index + 1;
    while (end < children.length) {
      const next = children[end];
      if (next.level < baseLevel + 1) break;
      if (next.level === baseLevel + 1 && (next.tagId === HWP_TAG.LIST_HEADER || next.tagId === HWP_TAG.TABLE)) break;
      end += 1;
    }
    const cellRecords = children.slice(index + 1, end);
    const paraLevels = cellRecords.filter((entry) => entry.tagId === HWP_TAG.PARA_HEADER).map((entry) => entry.level);
    const paraLevel = paraLevels.length ? Math.min(...paraLevels) : null;
    cell.story = paraLevel == null ? [] : parseParagraphList(cellRecords, paraLevel);
    cell.records = [record, ...cellRecords];
    cells.push(cell);
    index = end - 1;
  }

  return {
    type: 'table',
    id,
    ...tableMeta,
    cells,
    records: [headerRecord, ...children]
  };
}

function parseTableMeta(data) {
  const rowCount = data.byteLength >= 6 ? readU16(data, 4) : 0;
  const colCount = data.byteLength >= 8 ? readU16(data, 6) : 0;
  return {
    attr: data.byteLength >= 4 ? readU32(data, 0) : 0,
    rowCount,
    colCount,
    cellSpacingHwp: data.byteLength >= 10 ? readU16(data, 8) : 0,
    defaultCellMarginsHwp: data.byteLength >= 18 ? {
      left: readU16(data, 10),
      right: readU16(data, 12),
      top: readU16(data, 14),
      bottom: readU16(data, 16)
    } : null
  };
}

function parseTableCellMeta(data) {
  if (data.byteLength < 24) {
    return { col: 0, row: 0, colSpan: 1, rowSpan: 1, widthHwp: 0, heightHwp: 0, marginsHwp: null, borderFillId: null };
  }
  return {
    col: readU16(data, 8),
    row: readU16(data, 10),
    colSpan: Math.max(1, readU16(data, 12)),
    rowSpan: Math.max(1, readU16(data, 14)),
    widthHwp: readU32(data, 16),
    heightHwp: readU32(data, 20),
    marginsHwp: data.byteLength >= 32 ? {
      left: readU16(data, 24),
      right: readU16(data, 26),
      top: readU16(data, 28),
      bottom: readU16(data, 30)
    } : null,
    borderFillId: data.byteLength >= 34 ? readU16(data, 32) : null
  };
}

export function parsePageDef(data) {
  if (data.byteLength < 40) return null;
  return {
    widthHwp: readU32(data, 0),
    heightHwp: readU32(data, 4),
    marginsHwp: {
      left: readU32(data, 8),
      right: readU32(data, 12),
      top: readU32(data, 16),
      bottom: readU32(data, 20),
      header: readU32(data, 24),
      footer: readU32(data, 28),
      binding: readU32(data, 32)
    },
    attr: readU32(data, 36),
    orientation: (readU32(data, 36) & 0x01) ? 'landscape' : 'portrait'
  };
}

function isExtendedControl(ch) {
  return (ch >= 1 && ch <= 8) || ch === 11 || ch === 12 || (ch >= 14 && ch <= 23);
}

function emptyTextStream() {
  return { visibleText: '', sourceWordLength: 0, tokens: [] };
}

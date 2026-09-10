import { createDocument, image, paragraph, table, unsupported } from '../../core/src/document-model.js';
import { unzip } from './zip-reader.js';
import { closestAncestorByName, directChildrenByName, localName, parseXml, textOfParagraph } from './xml.js';
import { parseManifest } from './manifest.js';

const IMAGE_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
};
const UNSUPPORTED_NAMES = new Set(['equation', 'shapeObject', 'connectLine', 'ole']);
const PAPER_PRESETS = [
  ['A4', 210, 297],
  ['A3', 297, 420],
  ['B4_ISO', 250, 353],
  ['B4_JIS', 257, 364],
  ['LETTER', 215.9, 279.4]
];

export async function importHwpx(file, { mode = 'general' } = {}) {
  const files = await unzip(await file.arrayBuffer());
  const result = importHwpxEntries(files, { title: file.name.replace(/\.hwpx$/i, ''), sourceName: file.name, mode });
  result.originalFile = file;
  return result;
}

export function importHwpxEntries(files, { title = '가져온 문서', sourceName = null, mode = 'general' } = {}) {
  const sectionNames = Array.from(files.keys())
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (!sectionNames.length) throw new Error('Contents/section0.xml을 찾지 못했습니다. HWPX 파일인지 확인해주세요.');

  const manifest = parseManifest(files);
  const styles = parseStyleCatalog(files);
  const assets = new Map();
  const blocks = [];
  const warnings = [];
  const stats = { paragraphCount: 0, tableCount: 0, imageCount: 0, unsupportedCount: 0 };
  let sourcePrintProfile = null;

  for (const sectionName of sectionNames) {
    const xml = parseXml(files.get(sectionName));
    const root = xml.documentElement;
    const all = Array.from(root.getElementsByTagName('*'));
    if (!sourcePrintProfile) sourcePrintProfile = parsePageProfile(root);

    for (const el of all) {
      if (localName(el) !== 'p') continue;
      if (closestAncestorByName(el, 'tbl', root)) continue;

      const descendants = Array.from(el.getElementsByTagName('*'));
      const text = textOfParagraph(el);
      const ownedBlocks = descendants.filter((node) => {
        const name = localName(node);
        if (!['tbl', 'pic'].includes(name)) return false;
        return !closestAncestorByName(node, name, el);
      });

      if (text || !ownedBlocks.length) {
        blocks.push(paragraph(text || '\u200B', {
          sourceHwpxId: el.getAttribute('id') || null,
          ...paragraphStyle(el, styles)
        }));
        stats.paragraphCount += 1;
      }

      for (const child of ownedBlocks) {
        if (localName(child) === 'tbl') {
          blocks.push(parseTableBlock(child, styles));
          stats.tableCount += 1;
        }
        if (localName(child) === 'pic') {
          const imageBlock = parseImageBlock(child, manifest, files, assets);
          if (imageBlock) {
            blocks.push(imageBlock);
            stats.imageCount += 1;
          }
        }
      }
    }

    const unsupportedInSection = all.filter((node) => UNSUPPORTED_NAMES.has(localName(node))).length;
    if (unsupportedInSection) {
      stats.unsupportedCount += unsupportedInSection;
      warnings.push(`${sectionName}: 아직 재해석하지 않는 특수 개체 ${unsupportedInSection}개`);
    }
  }

  if (stats.unsupportedCount) {
    blocks.unshift(unsupported(`아직 재해석하지 않은 특수 개체 ${stats.unsupportedCount}개가 있습니다. 원본 HWPX는 별도로 유지합니다.`));
  }

  const document = createDocument({
    title,
    mode,
    source: sourceName ? { format: 'hwpx', name: sourceName } : null,
    blocks
  });
  if (sourcePrintProfile) document.printProfile = { ...document.printProfile, ...sourcePrintProfile };

  return { document, assets, warnings, stats, sourceEntries: files };
}

function parseTableBlock(tbl, styles) {
  const parsedRows = directChildrenByName(tbl, 'tr').map((row) =>
    directChildrenByName(row, 'tc').map((cell) => parseTableCell(cell, styles))
  );

  const allCells = parsedRows.flat();
  const colCount = Math.max(
    Number(tbl.getAttribute('colCnt') || 0),
    ...allCells.map((cell) => (cell.attrs?.colAddr ?? 0) + (cell.colSpan || 1)),
    parsedRows[0]?.length || 0
  );
  const tableSize = directChildrenByName(tbl, 'sz')[0];
  const sourceWidthHwp = positiveNumber(tableSize?.getAttribute('width'));
  const sourceHeightHwp = positiveNumber(tableSize?.getAttribute('height'));
  const columnWidths = inferColumnWidths(allCells, colCount, sourceWidthHwp);
  const rowHeightsMm = inferRowHeights(parsedRows);

  return table(parsedRows, {
    sourceHwpxId: tbl.getAttribute('id') || null,
    sourceWidthMm: sourceWidthHwp ? hwpUnitToMm(sourceWidthHwp) : null,
    sourceHeightMm: sourceHeightHwp ? hwpUnitToMm(sourceHeightHwp) : null,
    columnWidths,
    rowHeightsMm,
    keepTogether: Boolean(sourceHeightHwp && hwpUnitToMm(sourceHeightHwp) <= 180)
  });
}

function parseTableCell(cell, styles) {
  const cellSpan = directChildrenByName(cell, 'cellSpan')[0];
  const cellAddr = directChildrenByName(cell, 'cellAddr')[0];
  const cellSize = directChildrenByName(cell, 'cellSz')[0];
  const cellMargin = directChildrenByName(cell, 'cellMargin')[0];
  const subList = directChildrenByName(cell, 'subList')[0];
  const colSpan = safeSpan(cell.getAttribute('colSpan') || cellSpan?.getAttribute('colSpan'));
  const rowSpan = safeSpan(cell.getAttribute('rowSpan') || cellSpan?.getAttribute('rowSpan'));
  const paragraphs = Array.from(cell.getElementsByTagName('*')).filter((node) =>
    localName(node) === 'p' && !closestAncestorByName(node, 'tbl', cell)
  );
  const firstParagraph = paragraphs.find((node) => textOfParagraph(node).trim()) || paragraphs[0];
  const widthHwp = positiveNumber(cellSize?.getAttribute('width'));
  const heightHwp = positiveNumber(cellSize?.getAttribute('height'));

  return {
    text: paragraphs.map(textOfParagraph).join('\n'),
    colSpan,
    rowSpan,
    attrs: {
      colAddr: nonNegativeNumber(cellAddr?.getAttribute('colAddr')),
      rowAddr: nonNegativeNumber(cellAddr?.getAttribute('rowAddr')),
      sourceWidthHwp: widthHwp,
      sourceHeightHwp: heightHwp,
      sourceWidthMm: widthHwp ? hwpUnitToMm(widthHwp) : null,
      sourceHeightMm: heightHwp ? hwpUnitToMm(heightHwp) : null,
      paddingMm: parseCellMargins(cellMargin),
      verticalAlign: normalizeVerticalAlign(subList?.getAttribute('vertAlign')),
      ...(firstParagraph ? paragraphStyle(firstParagraph, styles) : {})
    }
  };
}

function inferColumnWidths(cells, colCount, tableWidthHwp) {
  if (!Number.isFinite(colCount) || colCount <= 0) return null;
  const candidates = Array.from({ length: colCount }, () => []);
  const spans = [];

  for (const cell of cells) {
    const start = Number(cell.attrs?.colAddr);
    const span = Math.max(1, Number(cell.colSpan) || 1);
    const width = positiveNumber(cell.attrs?.sourceWidthHwp);
    if (!Number.isFinite(start) || start < 0 || start >= colCount || !width) continue;
    if (span === 1) candidates[start].push(width);
    else spans.push({ start, span: Math.min(span, colCount - start), width });
  }

  const widths = candidates.map((values) => median(values));
  for (let pass = 0; pass < colCount + 2; pass += 1) {
    let changed = false;
    for (const constraint of spans) {
      const indices = Array.from({ length: constraint.span }, (_, index) => constraint.start + index);
      const unknown = indices.filter((index) => !widths[index]);
      if (!unknown.length) continue;
      const knownSum = indices.reduce((sum, index) => sum + (widths[index] || 0), 0);
      const residual = Math.max(0, constraint.width - knownSum);
      if (unknown.length === 1 && residual > 0) {
        widths[unknown[0]] = residual;
        changed = true;
      } else if (knownSum === 0 && residual > 0) {
        for (const index of unknown) widths[index] = residual / unknown.length;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const knownSum = widths.reduce((sum, value) => sum + (value || 0), 0);
  const missing = widths.filter((value) => !value).length;
  const fallback = missing
    ? Math.max(1, ((tableWidthHwp || knownSum || colCount) - knownSum) / missing)
    : 1;
  for (let index = 0; index < widths.length; index += 1) if (!widths[index]) widths[index] = fallback;

  const total = widths.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return widths.map((value) => value / total);
}

function inferRowHeights(rows) {
  const values = rows.map((row) => {
    const heights = row
      .filter((cell) => (cell.rowSpan || 1) === 1)
      .map((cell) => positiveNumber(cell.attrs?.sourceHeightHwp))
      .filter(Boolean);
    const height = median(heights);
    return height ? hwpUnitToMm(height) : null;
  });
  return values.some(Boolean) ? values : null;
}

function parsePageProfile(root) {
  const pagePr = Array.from(root.getElementsByTagName('*')).find((node) => localName(node) === 'pagePr');
  if (!pagePr) return null;
  const widthMm = hwpUnitToMm(positiveNumber(pagePr.getAttribute('width')) || 0);
  const heightMm = hwpUnitToMm(positiveNumber(pagePr.getAttribute('height')) || 0);
  const paper = matchPaper(widthMm, heightMm);
  const landscapeValue = String(pagePr.getAttribute('landscape') || '').toUpperCase();
  const orientation = ['1', 'TRUE', 'WIDELY', 'LANDSCAPE'].includes(landscapeValue) ? 'landscape' : 'portrait';
  const margin = Array.from(pagePr.children || []).find((node) => localName(node) === 'margin');
  const profile = { orientation };
  if (paper) profile.paper = paper;
  if (margin) {
    const top = positiveOrZero(margin.getAttribute('top'));
    const right = positiveOrZero(margin.getAttribute('right'));
    const bottom = positiveOrZero(margin.getAttribute('bottom'));
    const left = positiveOrZero(margin.getAttribute('left'));
    if (top != null) profile.marginTopMm = hwpUnitToMm(top);
    if (right != null) profile.marginRightMm = hwpUnitToMm(right);
    if (bottom != null) profile.marginBottomMm = hwpUnitToMm(bottom);
    if (left != null) profile.marginLeftMm = hwpUnitToMm(left);
  }
  return profile;
}

function parseStyleCatalog(files) {
  const headerName = Array.from(files.keys()).find((name) => /(^|\/)header\.xml$/i.test(name));
  if (!headerName) return { chars: new Map(), paras: new Map() };
  const xml = parseXml(files.get(headerName));
  const all = Array.from(xml.documentElement.getElementsByTagName('*'));
  const chars = new Map();
  const paras = new Map();

  for (const node of all) {
    if (localName(node) === 'charPr') {
      const id = String(node.getAttribute('id') || '');
      const height = positiveNumber(node.getAttribute('height'));
      chars.set(id, {
        fontSizePt: height ? clamp(height / 100, 5, 72) : null,
        bold: Array.from(node.children || []).some((child) => localName(child) === 'bold'),
        italic: Array.from(node.children || []).some((child) => localName(child) === 'italic'),
        color: normalizeColor(node.getAttribute('textColor'))
      });
    }
    if (localName(node) === 'paraPr') {
      const id = String(node.getAttribute('id') || '');
      const descendants = Array.from(node.getElementsByTagName('*'));
      const align = descendants.find((child) => localName(child) === 'align');
      const lineSpacing = descendants.find((child) => localName(child) === 'lineSpacing');
      const lineType = String(lineSpacing?.getAttribute('type') || '').toUpperCase();
      const lineValue = positiveNumber(lineSpacing?.getAttribute('value'));
      paras.set(id, {
        textAlign: normalizeTextAlign(align?.getAttribute('horizontal') || node.getAttribute('align')),
        lineHeight: lineType === 'PERCENT' && lineValue ? clamp(lineValue / 100, 0.8, 3) : null
      });
    }
  }
  return { chars, paras };
}

function paragraphStyle(paragraphNode, styles) {
  const para = styles.paras.get(String(paragraphNode.getAttribute('paraPrIDRef') || '')) || {};
  const runs = directChildrenByName(paragraphNode, 'run');
  const weighted = [];
  for (const run of runs) {
    const style = styles.chars.get(String(run.getAttribute('charPrIDRef') || ''));
    if (!style) continue;
    const textLength = Array.from(run.getElementsByTagName('*'))
      .filter((node) => localName(node) === 't')
      .reduce((sum, node) => sum + (node.textContent || '').length, 0);
    weighted.push({ style, weight: Math.max(1, textLength) });
  }
  const char = combineCharStyles(weighted);
  return compactObject({ ...para, ...char });
}

function combineCharStyles(weighted) {
  if (!weighted.length) return {};
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  const sizeItems = weighted.filter((item) => item.style.fontSizePt).sort((a, b) => a.style.fontSizePt - b.style.fontSizePt);
  let fontSizePt = null;
  let running = 0;
  for (const item of sizeItems) {
    running += item.weight;
    if (running >= total / 2) { fontSizePt = item.style.fontSizePt; break; }
  }
  const boldWeight = weighted.reduce((sum, item) => sum + (item.style.bold ? item.weight : 0), 0);
  const italicWeight = weighted.reduce((sum, item) => sum + (item.style.italic ? item.weight : 0), 0);
  const colorWeights = new Map();
  for (const item of weighted) if (item.style.color) colorWeights.set(item.style.color, (colorWeights.get(item.style.color) || 0) + item.weight);
  const color = Array.from(colorWeights.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return compactObject({
    fontSizePt,
    fontWeight: boldWeight >= total / 2 ? 700 : null,
    fontStyle: italicWeight >= total / 2 ? 'italic' : null,
    color
  });
}

function parseCellMargins(node) {
  if (!node) return null;
  const keys = ['left', 'right', 'top', 'bottom'];
  const result = {};
  for (const key of keys) {
    const value = positiveOrZero(node.getAttribute(key));
    if (value != null) result[key] = hwpUnitToMm(value);
  }
  return Object.keys(result).length ? result : null;
}

function parseImageBlock(pic, manifest, files, assets) {
  const descendants = Array.from(pic.getElementsByTagName('*'));
  const imageNode = descendants.find((node) =>
    ['img', 'pic'].includes(localName(node)) && node.getAttribute('binaryItemIDRef')
  );
  const binaryId = pic.getAttribute('binaryItemIDRef') || imageNode?.getAttribute('binaryItemIDRef');
  if (!binaryId) return null;

  const href = manifest.get(binaryId) || Array.from(files.keys()).find((name) =>
    name.startsWith('BinData/') && name.toLowerCase().includes(binaryId.toLowerCase())
  );
  if (!href || !files.has(href)) return null;

  const ext = href.split('.').pop().toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) return null;
  const sizeNode = descendants.find((node) => localName(node) === 'sz');
  const widthHwp = positiveNumber(sizeNode?.getAttribute('width'));
  const heightHwp = positiveNumber(sizeNode?.getAttribute('height'));
  const assetId = `hwpx:${binaryId}`;
  assets.set(assetId, { id: assetId, mime, bytes: files.get(href), sourcePath: href });
  return image(assetId, compactObject({
    alt: binaryId,
    sourcePath: href,
    widthMm: widthHwp ? hwpUnitToMm(widthHwp) : null,
    heightMm: heightHwp ? hwpUnitToMm(heightHwp) : null
  }));
}

function matchPaper(widthMm, heightMm) {
  if (!widthMm || !heightMm) return null;
  const input = [Math.min(widthMm, heightMm), Math.max(widthMm, heightMm)];
  let best = null;
  let bestError = Infinity;
  for (const [id, width, height] of PAPER_PRESETS) {
    const expected = [Math.min(width, height), Math.max(width, height)];
    const error = Math.abs(input[0] - expected[0]) + Math.abs(input[1] - expected[1]);
    if (error < bestError) { best = id; bestError = error; }
  }
  return bestError <= 4 ? best : null;
}

function hwpUnitToMm(value) {
  return Number(value) * 25.4 / 7200;
}

function median(values) {
  if (!values?.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveOrZero(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeSpan(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 100 ? Math.floor(number) : 1;
}

function normalizeVerticalAlign(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'CENTER' || normalized === 'MIDDLE') return 'middle';
  if (normalized === 'BOTTOM') return 'bottom';
  return 'top';
}

function normalizeTextAlign(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'CENTER') return 'center';
  if (normalized === 'RIGHT') return 'right';
  if (normalized === 'JUSTIFY' || normalized === 'DISTRIBUTE') return 'justify';
  if (normalized === 'LEFT') return 'left';
  return null;
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9A-F]{6}$/i.test(color) ? color : null;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

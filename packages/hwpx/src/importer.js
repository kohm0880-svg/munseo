import { createDocument, image, paragraph, table, unsupported } from '../../core/src/document-model.js';
import { unzip } from './zip-reader.js';
import { closestAncestorByName, directChildrenByName, localName, parseXml, textOfParagraph } from './xml.js';
import { parseManifest } from './manifest.js';

const IMAGE_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
};
const UNSUPPORTED_NAMES = new Set(['equation', 'shapeObject', 'connectLine', 'ole']);

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
  const assets = new Map();
  const blocks = [];
  const warnings = [];
  const stats = { paragraphCount: 0, tableCount: 0, imageCount: 0, unsupportedCount: 0 };

  for (const sectionName of sectionNames) {
    const xml = parseXml(files.get(sectionName));
    const root = xml.documentElement;
    const all = Array.from(root.getElementsByTagName('*'));

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
        blocks.push(paragraph(text || '\u200B', { sourceHwpxId: el.getAttribute('id') || null }));
        stats.paragraphCount += 1;
      }

      for (const child of ownedBlocks) {
        if (localName(child) === 'tbl') {
          blocks.push(parseTableBlock(child));
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

  return { document, assets, warnings, stats, sourceEntries: files };
}

function parseTableBlock(tbl) {
  const rows = directChildrenByName(tbl, 'tr').map((row) =>
    directChildrenByName(row, 'tc').map((cell) => {
      const cellSpan = Array.from(cell.children).find((node) => localName(node) === 'cellSpan');
      const colSpan = Number(cell.getAttribute('colSpan') || cellSpan?.getAttribute('colSpan') || 1);
      const rowSpan = Number(cell.getAttribute('rowSpan') || cellSpan?.getAttribute('rowSpan') || 1);
      const paragraphs = Array.from(cell.getElementsByTagName('*')).filter((node) => localName(node) === 'p');
      return {
        text: paragraphs.map(textOfParagraph).join('\n'),
        colSpan: Number.isFinite(colSpan) ? colSpan : 1,
        rowSpan: Number.isFinite(rowSpan) ? rowSpan : 1
      };
    })
  );
  return table(rows, { sourceHwpxId: tbl.getAttribute('id') || null });
}

function parseImageBlock(pic, manifest, files, assets) {
  const imageNode = Array.from(pic.getElementsByTagName('*')).find((node) =>
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
  const assetId = `hwpx:${binaryId}`;
  assets.set(assetId, { id: assetId, mime, bytes: files.get(href), sourcePath: href });
  return image(assetId, { alt: binaryId, sourcePath: href });
}

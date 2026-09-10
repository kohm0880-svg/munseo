import { CfbReader, toUint8Array } from './cfb-reader.js';
import { assertSupportedHwpScope, parseHwpFileHeader } from './file-header.js';
import { buildRecordTree, inflateHwpStream, readRecords } from './record-reader.js';
import { parseHwpSection } from './body-parser.js';
import { HWP_TAG } from './tags.js';

/**
 * Native HWP 5.x parse entry point.
 *
 * No HWPX conversion is allowed in this path. This function produces a
 * format-specific source IR first; normalization into Munseo's editable model
 * is a separate concern.
 */
export async function parseHwpNative(input) {
  const bytes = toUint8Array(input);
  const cfb = new CfbReader(bytes);

  const fileHeaderBytes = requireStream(cfb, 'FileHeader');
  const header = parseHwpFileHeader(fileHeaderBytes);
  assertSupportedHwpScope(header);

  const docInfoBytes = await readMaybeCompressed(requireStream(cfb, 'DocInfo'), header.flags.compressed);
  const docInfoRecords = readRecords(docInfoBytes);

  const sectionPaths = cfb.listPaths(/^BodyText\/Section\d+$/i)
    .sort((a, b) => sectionNumber(a) - sectionNumber(b));
  const sections = [];
  for (const [index, path] of sectionPaths.entries()) {
    const stream = requireStream(cfb, path);
    const sectionBytes = await readMaybeCompressed(stream, header.flags.compressed);
    const records = readRecords(sectionBytes);
    sections.push({ ...parseHwpSection(records, index), streamPath: path });
  }

  const binaryAssets = [];
  for (const path of cfb.listPaths(/^BinData\//i).sort()) {
    const data = cfb.readStream(path);
    if (!data) continue;
    binaryAssets.push({ path, data, byteLength: data.byteLength });
  }

  const previewTextBytes = cfb.readStream('PrvText');
  const previewText = previewTextBytes ? new TextDecoder('utf-16le').decode(previewTextBytes).replace(/\u0000+$/g, '') : null;

  const scope = inspectOutOfScopeFeatures({ cfb, header, sections });

  return {
    kind: 'hwp5-source',
    header,
    docInfo: {
      records: docInfoRecords,
      recordTree: buildRecordTree(docInfoRecords)
    },
    sections,
    binaryAssets,
    preview: {
      text: previewText,
      hasImage: cfb.hasStream('PrvImage')
    },
    scope,
    streamPaths: cfb.listPaths().sort()
  };
}

export async function parseHwpFile(file) {
  return parseHwpNative(new Uint8Array(await file.arrayBuffer()));
}

function inspectOutOfScopeFeatures({ cfb, header, sections }) {
  const reasons = [];
  if (header.flags.scriptStored || cfb.listPaths(/^Scripts\//i).length) reasons.push('scripts-or-macros');

  const bodyRecords = sections.flatMap((section) => section.records);
  if (bodyRecords.some((record) => record.tagId === HWP_TAG.CHART_DATA)) reasons.push('chart');
  if (bodyRecords.some((record) => record.tagId === HWP_TAG.SHAPE_COMPONENT_OLE)) reasons.push('ole-object');

  return {
    target: 'ordinary-editable-hwp5',
    outOfScopeFeaturesPresent: Array.from(new Set(reasons))
  };
}

async function readMaybeCompressed(bytes, compressed) {
  return compressed ? inflateHwpStream(bytes) : bytes;
}

function requireStream(cfb, path) {
  const stream = cfb.readStream(path);
  if (!stream) throw new Error(`HWP 필수 스트림을 찾지 못했습니다: ${path}`);
  return stream;
}

function sectionNumber(path) {
  return Number(path.match(/Section(\d+)/i)?.[1] || 0);
}

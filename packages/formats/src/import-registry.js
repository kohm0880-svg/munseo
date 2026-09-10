import { importHwpx } from '../../hwpx/src/index.js';

const IMPORTERS = [
  {
    id: 'hwpx',
    extensions: ['.hwpx'],
    requiresModeSelection: true,
    importFile: importHwpx
  }
];

export function findImporter(fileName) {
  const lower = String(fileName || '').toLowerCase();
  return IMPORTERS.find((entry) => entry.extensions.some((ext) => lower.endsWith(ext))) || null;
}

export function canImport(fileName) {
  return Boolean(findImporter(fileName));
}

export function requiresModeSelection(fileName) {
  return Boolean(findImporter(fileName)?.requiresModeSelection);
}

export async function importDocumentFile(file, options = {}) {
  const importer = findImporter(file.name);
  if (!importer) throw new Error(`지원하지 않는 파일 형식입니다: ${file.name}`);
  return importer.importFile(file, options);
}

export function listImportFormats() {
  return IMPORTERS.map(({ id, extensions, requiresModeSelection }) => ({ id, extensions: [...extensions], requiresModeSelection }));
}

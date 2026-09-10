export const DOCUMENT_SCHEMA_VERSION = 1;

let sequence = 0;
export function createId(prefix = 'node') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}


export function createDocument({ title = '새 문서', mode = 'general', source = null, blocks = [] } = {}) {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: createId('doc'),
    title,
    mode,
    source,
    blocks,
    printProfile: {
      paper: 'A4',
      orientation: 'portrait',
      marginTopMm: 18,
      marginRightMm: 20,
      marginBottomMm: 18,
      marginLeftMm: 20,
      density: 55
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

export function paragraph(text = '', attrs = {}) {
  return { id: createId('p'), type: 'paragraph', text, attrs: { spacingAfterPx: null, ...attrs } };
}

export function heading(text = '', level = 1, attrs = {}) {
  return { id: createId('h'), type: 'heading', level, text, attrs };
}

export function table(rows = [], attrs = {}) {
  return {
    id: createId('tbl'),
    type: 'table',
    rows: rows.map((row) => row.map((cell) => ({
      id: createId('cell'),
      text: typeof cell === 'string' ? cell : (cell.text ?? ''),
      colSpan: typeof cell === 'string' ? 1 : (cell.colSpan ?? 1),
      rowSpan: typeof cell === 'string' ? 1 : (cell.rowSpan ?? 1)
    }))),
    attrs
  };
}

export function image(assetId, attrs = {}) {
  return { id: createId('img'), type: 'image', assetId, attrs: { alt: '', ...attrs } };
}

export function unsupported(label, attrs = {}) {
  return { id: createId('unsupported'), type: 'unsupported', label, attrs };
}

export function touchDocument(doc) {
  doc.meta.updatedAt = new Date().toISOString();
  return doc;
}

export function cloneDocument(doc) {
  return structuredClone(doc);
}

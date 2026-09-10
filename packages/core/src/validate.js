import { DOCUMENT_SCHEMA_VERSION } from './document-model.js';

const VALID_MODES = new Set(['general', 'form']);
const VALID_BLOCKS = new Set(['paragraph', 'heading', 'table', 'image', 'unsupported']);

export function validateDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['문서 객체가 아닙니다.'] };
  if (doc.schemaVersion !== DOCUMENT_SCHEMA_VERSION) errors.push(`지원하지 않는 스키마 버전: ${doc.schemaVersion}`);
  if (!VALID_MODES.has(doc.mode)) errors.push(`잘못된 문서 모드: ${doc.mode}`);
  if (!Array.isArray(doc.blocks)) errors.push('blocks가 배열이 아닙니다.');
  else {
    doc.blocks.forEach((block, index) => {
      if (!block?.id) errors.push(`blocks[${index}]에 id가 없습니다.`);
      if (!VALID_BLOCKS.has(block?.type)) errors.push(`blocks[${index}]의 type이 잘못되었습니다: ${block?.type}`);
    });
  }
  return { ok: errors.length === 0, errors };
}

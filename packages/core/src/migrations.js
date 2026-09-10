import { DOCUMENT_SCHEMA_VERSION } from './document-model.js';

/**
 * 자체 문서 포맷을 장기간 유지하기 위한 단일 진입점입니다.
 * schemaVersion이 올라갈 때 case를 추가하고, 저장소/앱에서는 이 함수만 호출합니다.
 */
export function migrateDocument(input) {
  const doc = structuredClone(input);
  if (!doc?.schemaVersion) doc.schemaVersion = 1;

  switch (doc.schemaVersion) {
    case DOCUMENT_SCHEMA_VERSION:
      return doc;
    default:
      throw new Error(`지원하지 않는 문서 스키마 버전입니다: ${doc.schemaVersion}`);
  }
}

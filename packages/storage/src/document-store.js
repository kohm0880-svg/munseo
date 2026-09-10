/**
 * @typedef {Object} DocumentStore
 * @property {(document: object) => Promise<void>} save
 * @property {(id: string) => Promise<object|null>} load
 * @property {(id: string) => Promise<void>} remove
 * @property {() => Promise<Array<{id:string,title:string,updatedAt:string}>>} list
 *
 * 브라우저 저장소, REST API, IndexedDB, 데스크톱 파일시스템 등은 이 계약만 구현합니다.
 */
export const DOCUMENT_STORE_PORT = Symbol('DocumentStore');

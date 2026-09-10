import { migrateDocument } from '../../core/src/migrations.js';

const INDEX_KEY = 'liberator:documents:index:v1';
const keyFor = (id) => `liberator:document:${id}`;

export function createLocalStorageStore(storage = globalThis.localStorage) {
  return {
    async save(document) {
      storage.setItem(keyFor(document.id), JSON.stringify(document));
      const index = readIndex(storage).filter((x) => x.id !== document.id);
      index.unshift({ id: document.id, title: document.title, updatedAt: document.meta.updatedAt });
      storage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, 100)));
    },
    async load(id) {
      const raw = storage.getItem(keyFor(id));
      return raw ? migrateDocument(JSON.parse(raw)) : null;
    },
    async remove(id) {
      storage.removeItem(keyFor(id));
      storage.setItem(INDEX_KEY, JSON.stringify(readIndex(storage).filter((x) => x.id !== id)));
    },
    async list() {
      return readIndex(storage);
    }
  };
}

function readIndex(storage) {
  try { return JSON.parse(storage.getItem(INDEX_KEY) || '[]'); }
  catch { return []; }
}

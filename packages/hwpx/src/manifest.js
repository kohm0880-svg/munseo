import { localName, parseXml } from './xml.js';

export function parseManifest(files) {
  const map = new Map();
  const bytes = files.get('Contents/content.hpf');
  if (!bytes) return map;
  try {
    const xml = parseXml(bytes);
    Array.from(xml.getElementsByTagName('*')).forEach((el) => {
      if (localName(el) === 'item' && el.getAttribute('id') && el.getAttribute('href')) {
        map.set(el.getAttribute('id'), el.getAttribute('href'));
      }
    });
  } catch (error) {
    console.warn('HWPX manifest parse failed', error);
  }
  return map;
}

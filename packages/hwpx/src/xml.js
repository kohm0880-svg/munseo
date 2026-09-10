export function localName(node) {
  return (node?.localName || node?.nodeName || '').split(':').pop();
}

export function parseXml(bytes) {
  if (!globalThis.DOMParser) throw new Error('XML 파싱에는 브라우저 DOMParser가 필요합니다.');
  const text = new TextDecoder('utf-8').decode(bytes);
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('HWPX 내부 XML을 해석하지 못했습니다.');
  return xml;
}

export function directChildrenByName(el, name) {
  return Array.from(el?.children || []).filter((child) => localName(child) === name);
}

export function closestAncestorByName(el, name, stopAt) {
  let current = el?.parentElement;
  while (current && current !== stopAt) {
    if (localName(current) === name) return current;
    current = current.parentElement;
  }
  return null;
}

export function textOfParagraph(paragraph) {
  let out = '';
  const blocked = new Set(['tbl', 'pic', 'equation', 'shapeObject', 'ole']);

  function visit(node) {
    if (node !== paragraph && blocked.has(localName(node))) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const name = localName(node);
      if (name === 't') { out += node.textContent || ''; return; }
      if (name === 'tab') { out += '\t'; return; }
      if (name === 'lineBreak') { out += '\n'; return; }
    }
    Array.from(node.childNodes || []).forEach(visit);
  }

  visit(paragraph);
  return out;
}

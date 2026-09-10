import { createId, touchDocument } from '../../../packages/core/src/index.js';

export function renderDocument(editor, document, assets) {
  revokeAssetUrls(editor);
  editor.innerHTML = '';
  const fragment = documentFragment();
  for (const block of document.blocks) fragment.appendChild(renderBlock(block, assets, document.mode));
  editor.appendChild(fragment);
}

export function syncDocumentFromDom(editor, document) {
  const blocksById = new Map(document.blocks.map((block) => [block.id, block]));
  const nextBlocks = [];

  for (const child of Array.from(editor.children)) {
    const id = child.dataset.blockId || createId('dom');
    let block = blocksById.get(id);
    const tag = child.tagName.toLowerCase();

    if (tag === 'table') {
      block = block?.type === 'table' ? block : { id, type: 'table', rows: [], attrs: {} };
      block.rows = Array.from(child.rows).map((row) => Array.from(row.cells).map((cell) => ({
        id: cell.dataset.cellId || createId('cell'),
        text: cell.innerText,
        colSpan: cell.colSpan || 1,
        rowSpan: cell.rowSpan || 1
      })));
    } else if (/^h[1-6]$/.test(tag)) {
      block = block?.type === 'heading' ? block : { id, type: 'heading', attrs: {} };
      block.level = Number(tag[1]);
      block.text = child.innerText;
    } else if (child.classList.contains('unsupported-block')) {
      block = block?.type === 'unsupported' ? block : { id, type: 'unsupported', attrs: {} };
      block.label = child.innerText;
    } else if (tag === 'figure' && child.dataset.assetId) {
      block = block?.type === 'image' ? block : { id, type: 'image', attrs: {} };
      block.assetId = child.dataset.assetId;
    } else {
      block = block?.type === 'paragraph' ? block : { id, type: 'paragraph', attrs: {} };
      block.text = child.innerText;
      block.attrs ||= {};
      const ownSpacing = child.style.marginBottom;
      block.attrs.spacingAfterPx = ownSpacing ? Number.parseFloat(ownSpacing) : null;
    }

    block.id = id;
    nextBlocks.push(block);
  }

  document.blocks = nextBlocks;
  touchDocument(document);
  return document;
}

function renderBlock(block, assets, mode) {
  let element;
  if (block.type === 'heading') {
    element = document.createElement(`h${Math.max(1, Math.min(6, block.level || 1))}`);
    element.textContent = block.text;
  } else if (block.type === 'table') {
    element = renderTable(block, mode);
  } else if (block.type === 'image') {
    element = renderImage(block, assets);
  } else if (block.type === 'unsupported') {
    element = document.createElement('div');
    element.className = 'unsupported-block';
    element.contentEditable = 'false';
    element.textContent = block.label;
  } else {
    element = document.createElement('p');
    element.textContent = block.text || '\u200B';
    if (block.attrs?.spacingAfterPx != null) element.style.marginBottom = `${block.attrs.spacingAfterPx}px`;
  }
  element.dataset.blockId = block.id;
  return element;
}

function renderTable(block, mode) {
  const table = document.createElement('table');
  const locked = mode === 'form';
  if (locked) {
    table.contentEditable = 'false';
    table.dataset.structureLocked = 'true';
    table.title = '양식 모드: 표 구조는 잠겨 있고 셀 내용만 편집합니다.';
  }
  const tbody = document.createElement('tbody');
  for (const row of block.rows || []) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.dataset.cellId = cell.id;
      td.colSpan = cell.colSpan || 1;
      td.rowSpan = cell.rowSpan || 1;
      td.innerText = cell.text || '';
      if (locked) td.contentEditable = 'true';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderImage(block, assets) {
  const figure = document.createElement('figure');
  figure.dataset.assetId = block.assetId;
  const asset = assets.get(block.assetId);
  if (!asset) {
    figure.textContent = '[이미지 데이터를 찾지 못했습니다.]';
    return figure;
  }
  const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime }));
  figure.dataset.objectUrl = url;
  const img = document.createElement('img');
  img.src = url;
  img.alt = block.attrs?.alt || '';
  figure.appendChild(img);
  return figure;
}

function revokeAssetUrls(editor) {
  editor.querySelectorAll('[data-object-url]').forEach((element) => {
    URL.revokeObjectURL(element.dataset.objectUrl);
  });
}

function documentFragment() {
  return document.createDocumentFragment();
}

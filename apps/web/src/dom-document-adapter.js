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
      const existingCells = new Map((block.rows || []).flat().map((cell) => [cell.id, cell]));
      block.rows = Array.from(child.rows).map((row) => Array.from(row.cells).map((cell) => {
        const cellId = cell.dataset.cellId || createId('cell');
        const previous = existingCells.get(cellId);
        return {
          id: cellId,
          text: cell.innerText,
          colSpan: cell.colSpan || 1,
          rowSpan: cell.rowSpan || 1,
          attrs: structuredClone(previous?.attrs ?? {})
        };
      }));
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
      block.attrs.spacingAfterPx = ownSpacing ? Number.parseFloat(ownSpacing) : block.attrs.spacingAfterPx ?? null;
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
    applyTextStyle(element, block.attrs);
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
    applyTextStyle(element, block.attrs);
  }
  element.dataset.blockId = block.id;
  return element;
}

function renderTable(block, mode) {
  const table = document.createElement('table');
  const locked = mode === 'form';
  const widths = Array.isArray(block.attrs?.columnWidths) ? block.attrs.columnWidths : null;
  if (widths?.length) {
    const colgroup = document.createElement('colgroup');
    const total = widths.reduce((sum, value) => sum + (Number(value) || 0), 0) || 1;
    for (const value of widths) {
      const col = document.createElement('col');
      col.style.width = `${((Number(value) || 0) / total * 100).toFixed(4)}%`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    table.dataset.sourceGeometry = 'true';
  }
  if (block.attrs?.keepTogether) table.dataset.keepTogether = 'true';
  if (block.attrs?.sourceWidthMm) table.dataset.sourceWidthMm = String(block.attrs.sourceWidthMm);
  if (locked) {
    table.contentEditable = 'false';
    table.dataset.structureLocked = 'true';
    table.title = '양식 모드: 표 구조는 잠겨 있고 셀 내용만 편집합니다.';
  }

  const tbody = document.createElement('tbody');
  const rowHeights = Array.isArray(block.attrs?.rowHeightsMm) ? block.attrs.rowHeightsMm : [];
  for (const [rowIndex, row] of (block.rows || []).entries()) {
    const tr = document.createElement('tr');
    if (rowHeights[rowIndex]) tr.style.height = `${rowHeights[rowIndex]}mm`;
    for (const cell of row) {
      const td = document.createElement('td');
      td.dataset.cellId = cell.id;
      td.colSpan = cell.colSpan || 1;
      td.rowSpan = cell.rowSpan || 1;
      td.innerText = cell.text || '';
      applyCellGeometry(td, cell.attrs);
      applyTextStyle(td, cell.attrs);
      if (locked) td.contentEditable = 'true';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function applyCellGeometry(td, attrs = {}) {
  if (attrs.verticalAlign) td.style.verticalAlign = attrs.verticalAlign;
  const padding = attrs.paddingMm;
  if (padding) {
    if (Number.isFinite(padding.top)) td.style.paddingTop = `${padding.top}mm`;
    if (Number.isFinite(padding.right)) td.style.paddingRight = `${padding.right}mm`;
    if (Number.isFinite(padding.bottom)) td.style.paddingBottom = `${padding.bottom}mm`;
    if (Number.isFinite(padding.left)) td.style.paddingLeft = `${padding.left}mm`;
  }
  if (attrs.sourceHeightMm) td.style.minHeight = `${attrs.sourceHeightMm}mm`;
}

function applyTextStyle(element, attrs = {}) {
  if (!attrs) return;
  if (Number.isFinite(attrs.fontSizePt)) element.style.fontSize = `${attrs.fontSizePt}pt`;
  if (attrs.fontWeight) element.style.fontWeight = String(attrs.fontWeight);
  if (attrs.fontStyle) element.style.fontStyle = attrs.fontStyle;
  if (attrs.color) element.style.color = attrs.color;
  if (attrs.textAlign) element.style.textAlign = attrs.textAlign;
  if (Number.isFinite(attrs.lineHeight)) element.style.lineHeight = String(attrs.lineHeight);
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
  if (block.attrs?.widthMm) img.style.width = `${block.attrs.widthMm}mm`;
  if (block.attrs?.heightMm) img.style.height = `${block.attrs.heightMm}mm`;
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

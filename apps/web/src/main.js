import { paragraph, table, touchDocument } from '../../../packages/core/src/index.js';
import { canImport, importDocumentFile } from '../../../packages/formats/src/index.js';
import { PAPER_PRESETS, fitProfileToPageTarget } from '../../../packages/layout/src/index.js';
import { createLocalStorageStore } from '../../../packages/storage/src/index.js';
import { renderDocument, syncDocumentFromDom } from './dom-document-adapter.js';
import { runInlineCommand } from './formatting.js';
import { applyPrintProfile, injectPrintRule, updatePageGuides } from './paper-view.js';
import { createAppState, createDemoDocument, setMode, setPrintProfile } from './state.js';

const state = createAppState();
const store = createLocalStorageStore();
const $ = (id) => document.getElementById(id);
const editor = $('editor');
const landing = $('landing');
const workspace = $('workspace');
const modePicker = $('modePicker');
const paperShell = $('paperShell');
const pageGuides = $('pageGuides');

bootstrap();

function bootstrap() {
  populatePaperPresets();
  bindEvents();
  applyPrintProfile(state.document.printProfile);
  setView('free');
  setModeUi(state.document.mode);
}

function populatePaperPresets() {
  $('paperSize').innerHTML = Object.values(PAPER_PRESETS).map((preset) =>
    `<option value="${preset.id}">${preset.label} · ${preset.widthMm} × ${preset.heightMm} mm</option>`
  ).join('');
}

function bindEvents() {
  $('fileInput').addEventListener('change', (event) => chooseFile(event.target.files?.[0]));
  $('openBtn').addEventListener('click', () => $('fileInput').click());
  $('demoBtn').addEventListener('click', () => openDemo());
  $('saveLocalBtn').addEventListener('click', saveLocalDraft);

  document.querySelectorAll('.mode-card').forEach((card) => card.addEventListener('click', () => {
    if (state.pendingFile) openFile(state.pendingFile, card.dataset.mode);
  }));
  document.querySelectorAll('[data-doc-mode]').forEach((button) => button.addEventListener('click', () => {
    syncBeforeMutation();
    setMode(state, button.dataset.docMode);
    setModeUi(state.document.mode);
  }));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

  $('paperSize').addEventListener('change', (event) => updateProfile({ paper: event.target.value }));
  $('portraitBtn').addEventListener('click', () => updateProfile({ orientation: 'portrait' }));
  $('landscapeBtn').addEventListener('click', () => updateProfile({ orientation: 'landscape' }));
  $('densitySlider').addEventListener('input', (event) => updateProfile({ density: Number(event.target.value) }));
  $('fitPagesBtn').addEventListener('click', fitToTargetPages);

  $('addParagraphBtn').addEventListener('click', () => {
    syncBeforeMutation();
    state.document.blocks.push(paragraph(''));
    touchDocument(state.document);
    renderCurrentDocument();
    focusLastEditable();
  });
  $('addTableBtn').addEventListener('click', () => {
    if (state.document.mode === 'form') return toast('양식 모드에서는 표 구조 추가를 제한합니다.');
    syncBeforeMutation();
    state.document.blocks.push(table([['', ''], ['', '']]));
    touchDocument(state.document);
    renderCurrentDocument();
  });

  document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => {
    runInlineCommand(button.dataset.command);
    editor.focus();
  }));

  $('titleInput').addEventListener('input', (event) => {
    state.document.title = event.target.value;
    touchDocument(state.document);
    markDirty();
  });
  editor.addEventListener('input', () => {
    syncDocumentFromDom(editor, state.document);
    markDirty();
    refreshPagination();
  });
  editor.addEventListener('dblclick', openSpacingControl);
  window.addEventListener('resize', refreshPagination);
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#spacingPopover') && !event.target.closest('#editor')) $('spacingPopover').classList.add('hidden');
  });

  const dropzone = $('dropzone');
  ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault(); dropzone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault(); dropzone.classList.remove('dragover');
  }));
  dropzone.addEventListener('drop', (event) => chooseFile(event.dataTransfer.files?.[0]));

  $('printBtn').addEventListener('click', () => {
    if (workspace.classList.contains('hidden')) return toast('먼저 문서를 여세요.');
    syncBeforeMutation();
    if (state.view !== 'paper') setView('paper');
    injectPrintRule(state.document.printProfile);
    setTimeout(() => window.print(), 100);
  });
}

function chooseFile(file) {
  if (!file) return;
  if (/\.hwp$/i.test(file.name)) return toast('HWP는 native parser 재구성 중이라 현재 편집기 연결을 잠시 꺼뒀습니다.');
  if (!canImport(file.name)) return toast('현재 편집 화면은 HWPX만 연결되어 있습니다.');
  state.pendingFile = file;
  modePicker.classList.remove('hidden');
}

async function openFile(file, mode) {
  state.pendingFile = null;
  modePicker.classList.add('hidden');
  showWorkspace();
  editor.innerHTML = '<p>문서를 읽는 중...</p>';

  try {
    const result = await importDocumentFile(file, { mode });
    state.document = result.document;
    state.assets = result.assets;
    state.sourceEntries = result.sourceEntries;
    state.originalFile = result.originalFile;
    renderCurrentDocument();
    setView(mode === 'form' ? 'paper' : 'free');
    toast(`문단 ${result.stats.paragraphCount} · 표 ${result.stats.tableCount} · 이미지 ${result.stats.imageCount} 불러옴`);
  } catch (error) {
    console.error(error);
    editor.innerHTML = `<div class="unsupported-block">열지 못했습니다: ${escapeHtml(error.message)}</div>`;
    toast('문서 열기에 실패했습니다.');
  }
}

function openDemo() {
  state.document = createDemoDocument();
  state.assets = new Map();
  state.sourceEntries = null;
  state.originalFile = null;
  showWorkspace();
  renderCurrentDocument();
  setView('free');
}

function showWorkspace() {
  landing.classList.add('hidden');
  workspace.classList.remove('hidden');
}

function renderCurrentDocument() {
  renderDocument(editor, state.document, state.assets);
  $('titleInput').value = state.document.title;
  $('sourceBadge').textContent = state.document.source?.name ? `원본: ${state.document.source.name}` : '새 문서';
  $('paperSize').value = state.document.printProfile.paper;
  $('densitySlider').value = state.document.printProfile.density;
  applyPrintProfile(state.document.printProfile);
  setModeUi(state.document.mode);
  setOrientationUi(state.document.printProfile.orientation);
  $('saveStatus').textContent = '로컬 편집';
  refreshPagination();
}

function syncBeforeMutation() {
  if (!workspace.classList.contains('hidden')) syncDocumentFromDom(editor, state.document);
}

function setModeUi(mode) {
  document.body.classList.toggle('form-mode', mode === 'form');
  $('generalModeBtn').classList.toggle('active', mode === 'general');
  $('formModeBtn').classList.toggle('active', mode === 'form');
  $('modeStatus').textContent = mode === 'general' ? '일반 문서' : '양식 문서';
  $('modeHelp').textContent = mode === 'general'
    ? '구조를 자유롭게 편집합니다. 페이지보다 내용 흐름을 우선합니다.'
    : '표·항목 구조를 보수적으로 유지합니다. 내용 입력을 우선합니다.';
  $('addTableBtn').disabled = mode === 'form';
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('paperControls').classList.toggle('hidden', view !== 'paper');
  paperShell.classList.toggle('free-view', view === 'free');
  paperShell.classList.toggle('paper-view', view === 'paper');
  applyPrintProfile(state.document.printProfile);
  refreshPagination();
}

function updateProfile(patch) {
  syncBeforeMutation();
  setPrintProfile(state, patch);
  applyPrintProfile(state.document.printProfile);
  $('paperSize').value = state.document.printProfile.paper;
  $('densitySlider').value = state.document.printProfile.density;
  setOrientationUi(state.document.printProfile.orientation);
  markDirty();
  refreshPagination();
}

async function fitToTargetPages() {
  if (state.view !== 'paper') setView('paper');
  syncBeforeMutation();
  const target = Math.max(1, Math.floor(Number($('targetPages').value) || 1));
  $('fitPagesBtn').disabled = true;
  const originalProfile = structuredClone(state.document.printProfile);

  try {
    const result = await fitProfileToPageTarget(originalProfile, target, measurePagesForProfile);
    if (!result.ok) {
      applyPrintProfile(originalProfile);
      return toast(`간격과 여백만으로는 ${target}쪽에 맞추기 어렵습니다.`);
    }
    if (!result.changed) return toast(`이미 ${target}쪽 이내입니다.`);

    setPrintProfile(state, result.profile);
    $('densitySlider').value = result.profile.density;
    applyPrintProfile(result.profile);
    markDirty();
    refreshPagination();
    const marginChanged = result.changes.some((change) => change.field.startsWith('margin'));
    toast(`${result.pages}쪽에 맞췄습니다 · 글자 크기 변경 없음${marginChanged ? ' · 상하여백 일부 조정' : ''}`);
  } finally {
    $('fitPagesBtn').disabled = false;
  }
}

async function measurePagesForProfile(profile) {
  applyPrintProfile(profile);
  await nextFrame();
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:${getComputedStyle(document.documentElement).getPropertyValue('--paper-width')};height:1mm;`;
  document.body.appendChild(probe);
  const mmPx = probe.getBoundingClientRect().height;
  probe.remove();
  const paper = PAPER_PRESETS[profile.paper] || PAPER_PRESETS.A4;
  const heightMm = profile.orientation === 'landscape' ? paper.widthMm : paper.heightMm;
  const pageHeightPx = heightMm * mmPx;
  return Math.max(1, Math.ceil(Math.max(editor.scrollHeight, pageHeightPx) / pageHeightPx));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function setOrientationUi(orientation) {
  $('portraitBtn').classList.toggle('active', orientation === 'portrait');
  $('landscapeBtn').classList.toggle('active', orientation === 'landscape');
}

function refreshPagination() {
  updatePageGuides({
    editor,
    pageGuides,
    paperShell,
    pageEstimate: $('pageEstimate'),
    profile: state.document.printProfile,
    view: state.view
  });
}

async function saveLocalDraft() {
  if (workspace.classList.contains('hidden')) return toast('먼저 문서를 여세요.');
  syncBeforeMutation();
  try {
    await store.save(state.document);
    $('saveStatus').textContent = '이 브라우저에 저장됨';
    toast('현재 문서를 브라우저에 임시 저장했습니다.');
  } catch (error) {
    console.error(error);
    toast('임시 저장에 실패했습니다.');
  }
}

function markDirty() {
  $('saveStatus').textContent = '저장되지 않은 변경';
}

function openSpacingControl(event) {
  const p = event.target.closest('p');
  if (!p) return;
  const popover = $('spacingPopover');
  const range = $('spacingRange');
  const current = parseFloat(getComputedStyle(p).marginBottom) || 0;
  range.value = Math.min(48, current);
  $('spacingValue').textContent = `${Math.round(current)}px`;
  popover.style.left = `${Math.min(window.innerWidth - 250, event.clientX + 10)}px`;
  popover.style.top = `${Math.min(window.innerHeight - 100, event.clientY + 10)}px`;
  popover.classList.remove('hidden');
  range.oninput = () => {
    p.style.marginBottom = `${range.value}px`;
    $('spacingValue').textContent = `${range.value}px`;
    syncDocumentFromDom(editor, state.document);
    markDirty();
    refreshPagination();
  };
}

function focusLastEditable() {
  const target = editor.lastElementChild;
  if (!target) return;
  target.focus?.();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add('hidden'), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

import { createDocument, paragraph, heading, table, touchDocument } from '../../../packages/core/src/index.js';

export function createAppState() {
  return {
    pendingFile: null,
    document: createDemoDocument(),
    assets: new Map(),
    sourceEntries: null,
    originalFile: null,
    view: 'free'
  };
}

export function createDemoDocument() {
  return createDocument({
    title: '행사 계획서',
    mode: 'general',
    blocks: [
      heading('2026 행사 계획서', 1),
      paragraph('이 문서는 실제 기능을 확인하기 위한 프로토타입입니다. 문단을 더블클릭하면 해당 문단 아래 간격을 직접 조절할 수 있습니다.'),
      heading('1. 행사 목적', 2),
      paragraph('페이지보다 내용의 흐름을 먼저 작성하고, 필요할 때 A4·B4 등 출력 용지를 선택합니다.'),
      heading('2. 운영 계획', 2),
      table([['항목', '내용'], ['일시', '2026년 10월'], ['장소', '미정']]),
      paragraph('표와 문단의 여백을 설정 이름을 외워 조절하는 대신 결과를 직접 보면서 조절하는 것이 목표입니다.')
    ]
  });
}

export function setMode(state, mode) {
  state.document.mode = mode;
  touchDocument(state.document);
}

export function setPrintProfile(state, patch) {
  Object.assign(state.document.printProfile, patch);
  touchDocument(state.document);
}

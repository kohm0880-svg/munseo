# Architecture

이 저장소의 목적은 **UI나 배포 환경이 바뀌어도 핵심 문서 로직을 재사용하는 것**입니다.

```text
apps/web
   │
   ├──────────────┐
   ▼              ▼
packages/formats  packages/storage
   │
   ▼
packages/hwpx
   │              │
   └──────┬───────┘
          ▼
     packages/core
          ▲
          │
     packages/layout
```

## 경계

### `packages/core`
자체 문서 포맷의 유일한 정의입니다. 브라우저, React, Render, HWPX를 모릅니다.

### `packages/hwpx`
HWPX를 `core` 문서로 **import**합니다. HWPX가 장기적인 원본 데이터 모델이 되지 않도록 합니다.

### `packages/layout`
A4/B4 등 출력 프로필과 pagination 계약을 담당합니다. 정확한 레이아웃 엔진으로 교체되어도 UI API는 유지합니다.

### `packages/storage`
저장소의 경계입니다. 지금은 `localStorage`, 나중에는 IndexedDB/API/Tauri 파일시스템 어댑터를 추가합니다.

### `apps/web`
DOM, 사용자 이벤트, 브라우저 인쇄를 담당합니다. 나중에 React/Tiptap으로 바꿔도 이 폴더 중심으로 교체합니다.

## 미래 확장

```text
apps/
├─ web/             현재
├─ desktop/         Tauri/Electron shell
└─ mobile/          필요할 때

packages/
├─ core/            그대로 재사용
├─ hwpx/            그대로 재사용
├─ layout/          WASM/고급 엔진으로 교체 가능
├─ storage/         REST/IndexedDB 어댑터 추가
├─ collaboration/   CRDT/실시간 협업 (후일)
└─ hwp/             binary HWP importer (후일)
```

## 하지 않는 것

- 비즈니스 로직을 DOM 이벤트 핸들러에 박아 넣지 않기
- HWPX XML 노드를 자체 문서 데이터로 그대로 저장하지 않기
- Render 전용 코드를 앱 내부에 넣지 않기
- UI 프레임워크 타입을 core 패키지에 넣지 않기

## 파일 형식 추가

UI에서 확장자를 직접 분기하지 않습니다. `packages/formats/src/import-registry.js`에 importer를 등록합니다. DOCX/HWP 등을 추가해도 웹 UI의 파일 열기 흐름을 다시 만들지 않는 것이 목표입니다.

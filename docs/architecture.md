# Architecture

이 저장소의 목적은 **UI나 배포 환경이 바뀌어도 핵심 문서 로직을 재사용하고, 외부 파일 형식 사이의 변환 손실이 Munseo 내부까지 퍼지지 않게 하는 것**입니다.

```text
                +-> packages/hwp  ----+
external files -|                      |-> normalizer -> packages/core
                +-> packages/hwpx ----+

apps/web -> packages/formats -> connected importers
apps/web -> packages/storage
apps/web -> packages/layout
```

## 핵심 원칙

### 외부 포맷은 서로를 거치지 않는다

금지:

```text
HWP -> HWPX -> Munseo
```

허용:

```text
HWP  -> HWP-specific semantic IR  -> normalizer -> Munseo
HWPX -> HWPX-specific parse tree  -> normalizer -> Munseo
```

한 포맷을 다른 포맷의 중간 표현으로 쓰면 첫 변환에서 잃은 정보를 뒤 단계에서 복구할 수 없기 때문입니다.

### parser와 normalizer를 분리한다

`일반 문서 / 양식 문서`는 parser 옵션이 아닙니다. parser는 원본 의미를 최대한 정확히 읽고, 그 결과를 Munseo 문서로 옮기는 **normalization policy**가 일반/양식 차이를 결정합니다.

### `packages/core`

Munseo 자체 문서 포맷의 정의입니다. HWP, HWPX, DOM, React, Render를 모릅니다.

### `packages/hwp`

HWP 5.x 전용 native engine입니다.

```text
CFB reader
  -> FileHeader
  -> DocInfo record grammar
  -> BodyText record grammar
  -> format-specific semantic HWP IR
  -> serializer (후속)
```

웹 렌더링이나 HWPX 변환 로직을 포함하지 않습니다. 지원 범위는 `packages/hwp/README.md`를 따릅니다.

### `packages/hwpx`

HWPX ZIP/XML을 해석합니다. 장기적으로 HWP와 같은 원칙으로 원본 구조를 먼저 읽고 normalizer를 통해 core로 보냅니다.

### `packages/formats`

현재 **편집기에 실제 연결해도 되는 수준**의 importer만 등록합니다. parser 코드는 존재하지만 semantic coverage가 불충분한 포맷은 registry에 넣지 않습니다.

### `packages/layout`

Munseo 자체 문서의 A4/B4 등 출력 프로필과 pagination 계약을 담당합니다. 외부 파일 포맷 파서가 CSS 문제를 해결하려고 이 패키지를 조작해서는 안 됩니다.

### `packages/storage`

지금은 `localStorage`, 이후 IndexedDB/API/Tauri 파일시스템 어댑터를 추가합니다.

### `apps/web`

DOM, 사용자 이벤트, 브라우저 인쇄를 담당합니다. 파일 형식의 바이너리 문법을 알면 안 됩니다.

## HWP 개발 순서

```text
container correctness
-> record grammar correctness
-> semantic HWP IR completeness
-> serializer round-trip
-> Munseo normalizer
-> renderer fidelity
```

화면이 비슷해 보이는 것을 parser 완성의 증거로 사용하지 않습니다.

## 하지 않는 것

- 비즈니스 로직을 DOM 이벤트 핸들러에 넣기
- HWP를 HWPX로 바꿔서 읽기
- 렌더러 CSS로 parser 정보 손실을 보정하기
- Render 전용 코드를 앱 내부에 넣기
- UI 프레임워크 타입을 core에 넣기
- 지원한다고 표시한 포맷을 실제 semantic coverage보다 먼저 registry에 노출하기

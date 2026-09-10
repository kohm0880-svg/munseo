# Munseo

Munseo는 HWP/HWPX를 입구로 사용하되, 장기적으로는 특정 파일 형식에 종속되지 않는 자체 문서 모델에서 편집·공유·출력하는 로컬 우선 문서 편집기 프로토타입입니다.

## 현재 제품 가설

```text
HWP / HWPX 드롭
  → 일반 문서 / 양식 문서 선택
  → 자체 문서 모델로 변환
  → 자유 편집
  → 필요할 때 A4/B4/A3/Letter 출력
```

## 왜 이렇게 나눴나

이 프로젝트는 장기적으로 웹 → 클라우드 → 데스크톱 앱 → 협업으로 확장할 가능성이 큽니다. 그래서 처음부터 UI·배포환경과 핵심 문서 로직을 분리했습니다.

- `packages/core`: 자체 문서 스키마 + 마이그레이션
- `packages/hwpx`: HWPX ZIP/XML importer
- `packages/hwp`: binary HWP 5.x → HWPX 정규화 adapter
- `packages/formats`: 파일 형식 registry
- `packages/layout`: 용지/레이아웃 계약
- `packages/storage`: 저장소 포트 + 현재 브라우저 저장 구현
- `index.html` + `apps/web`: 브라우저 UI만 담당
- `docs/adr`: 앞으로 구조를 바꿀 때 이유를 잊지 않기 위한 결정 기록

HWP와 HWPX가 최종적으로 같은 importer 경로를 사용하도록 해, 외부 포맷 차이가 자체 문서 모델까지 퍼지지 않게 합니다.

## 실행

```bash
npm run dev
```

브라우저에서:

```text
http://localhost:8000
```

테스트와 정적 배포 빌드:

```bash
npm run check
```

`dist/`가 만들어집니다.

## HWP 지원 방식

HWP 5.x는 브라우저에서 `@ssabrojs/hwpxjs` 0.4.0의 브라우저 ESM 번들을 사용해 HWPX 구조로 정규화한 뒤 기존 Munseo HWPX importer를 통과합니다.

```text
HWP 5.x
  → client-side HWP parser
  → in-memory HWPX
  → packages/hwpx
  → Munseo Document Model
```

현재 변환 모듈은 버전이 고정된 jsDelivr URL에서 필요할 때만 로드합니다. **사용자가 연 HWP 문서의 바이트를 변환 서비스나 Munseo 서버로 업로드하지 않습니다.** 향후 해당 번들을 저장소/배포 산출물에 vendoring하여 런타임 CDN 의존성도 제거할 수 있도록 `packages/hwp` 경계 안에 격리했습니다.

현재 HWP 5.x를 우선 지원하며 암호화 문서와 구형 HWP 3.x 등은 명시적으로 실패 처리합니다. 변환 라이브러리 자체의 지원 범위를 넘는 특수 개체는 완전 복원을 보장하지 않습니다.

## Render

루트의 `render.yaml`을 사용하면 Static Site로 배포할 수 있습니다.

```text
GitHub main push
  → Render build: npm ci && npm run check
  → publish: ./dist
```

PR Preview는 초기에는 꺼 둡니다. 불필요한 빌드 사용량을 줄이고, 필요할 때만 켤 수 있습니다.

## 현재 구현

- 서버 업로드 없이 HWPX ZIP/XML 파싱
- HWP 5.x 브라우저 import
- 문단 / 표 / 일부 이미지 import
- 일반 문서 / 양식 문서 수동 선택
- 양식 모드 표 구조 잠금 + 셀 내용 편집
- 자체 JSON 문서 모델 v1
- 자유 문서 / 종이 보기
- A4 / A3 / B4 ISO / B4 JIS / Letter
- 세로 / 가로
- 문서 밀도 조절
- 문단 더블클릭으로 개별 아래 간격 조절
- 지정 페이지 수에 맞추는 간격/여백 최적화
- 브라우저 인쇄/PDF
- 브라우저 임시 저장 어댑터
- 모르는 특수 개체 경고 및 원본 데이터 보존용 경계

## 의도적으로 아직 안 한 것

- 픽셀 단위 한/글 복제
- 정확한 `charPr` / `paraPr` 스타일 복원
- 정확한 pagination
- HWPX round-trip export
- HWP export
- 로그인/서버/공동편집/채팅
- 특정 UI 프레임워크 도입

## 변경 원칙

1. 외부 포맷 파서는 `packages/*`에 둡니다.
2. DOM/React/Tauri 코드는 `packages/core`로 들어오면 안 됩니다.
3. 문서 스키마를 바꿀 때 `schemaVersion`과 migration을 같이 추가합니다.
4. Render나 다른 호스팅 사업자에 종속되는 앱 코드는 만들지 않습니다.
5. 새 저장 방식을 붙일 때 기존 저장소 코드를 뜯지 말고 adapter를 추가합니다.
6. 외부 문서에서 지원하지 않는 개체를 발견했다고 조용히 버리지 않습니다.
7. HWP/HWPX의 원본 파일 형식과 Munseo의 내부 문서 모델을 분리합니다.

## 다음 구현 우선순위

1. 실제 HWP/HWPX 여러 종류를 로컬에서 검증
2. `header.xml` 스타일 복원
3. 병합 표/이미지 호환성 강화
4. 정확한 pagination 엔진
5. 자체 문서 JSON 내보내기/가져오기
6. HWPX patch export
7. API 저장소 + 링크 공유

### 호스팅 이동성

브라우저 자산은 도메인 루트(`/`)에 의존하지 않는 상대경로를 사용합니다. `npm run build` 결과인 `dist/`를 정적 호스팅에 그대로 올리는 것이 기본 배포 계약입니다.

## 자동화 비용 원칙

GitHub Actions는 기본적으로 자동 실행하지 않습니다. `.github/workflows/ci.yml`은 수동 실행(`workflow_dispatch`)만 지원하며, 평소 검증은 로컬 `npm run check`와 Render 배포 빌드에서 수행합니다.

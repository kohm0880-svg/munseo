# Munseo

Munseo는 HWP/HWPX 같은 기존 문서를 가져올 수 있으면서, 장기적으로는 특정 파일 형식에 종속되지 않는 자체 문서 모델에서 편집·공유·출력하는 로컬 우선 문서 편집기 프로토타입입니다.

## 현재 제품 가설

```text
외부 문서
  -> format-specific parser
  -> 정확한 source representation
  -> 일반 문서 / 양식 문서 정규화
  -> Munseo document
  -> 자유 편집
  -> 필요할 때 A4/B4/A3/Letter 출력
```

## 구조 원칙

- `packages/core`: Munseo 자체 문서 스키마 + 마이그레이션
- `packages/hwpx`: HWPX ZIP/XML importer
- `packages/hwp`: **native binary HWP 5.x engine**
- `packages/formats`: 편집기에 실제 연결된 파일 형식 registry
- `packages/layout`: 용지/레이아웃 계약
- `packages/storage`: 저장소 포트 + 현재 브라우저 저장 구현
- `apps/web`: 브라우저 UI
- `docs/adr`: 설계 결정 기록

**HWP -> HWPX -> Munseo 변환은 사용하지 않습니다.** HWP는 자체 CFB/record grammar부터 직접 해석하고, semantic coverage가 충분해진 뒤 Munseo normalizer에 연결합니다.

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:8000`을 엽니다.

검증과 정적 배포 빌드:

```bash
npm run check
```

`dist/`가 만들어집니다.

## 현재 HWP 상태

HWP 5.x native parser를 재구성하는 동안 **웹 편집기의 HWP 연결은 의도적으로 꺼져 있습니다.** 깨진 변환 결과를 유지하는 것보다 parser의 의미 보존을 먼저 완성합니다.

현재 `packages/hwp`에는 다음 기반이 있습니다.

- CFB reader
- FileHeader / 지원 범위 검사
- HWP record header + Level tree
- BodyText Section/Paragraph 구조
- source character position을 유지하는 PARA_TEXT tokenizer
- char-shape change point
- line-segment / range-tag 기초 파싱
- PAGE_DEF
- 표/셀 기본 구조와 nested paragraph story

지원 범위와 비목표는 [`packages/hwp/README.md`](packages/hwp/README.md)에 고정해 둡니다.

## 현재 웹 편집기 구현

- 서버 업로드 없이 HWPX ZIP/XML 파싱
- 문단 / 표 / 일부 이미지 import
- 일반 문서 / 양식 문서 수동 선택
- 양식 모드 표 구조 잠금 + 셀 내용 편집
- 자체 JSON 문서 모델 v1
- 자유 문서 / 종이 보기
- A4 / A3 / B4 ISO / B4 JIS / Letter
- 세로 / 가로
- 문서 밀도 조절
- 문단 간격 직접 조절
- 지정 페이지 수에 맞추는 간격/여백 최적화
- 브라우저 인쇄/PDF
- 브라우저 임시 저장 어댑터

## 다음 구현 우선순위

1. HWP DocInfo semantic parser
2. HWP paragraph run/style 좌표계 완성
3. 표/셀/도형/글상자/nested story 완성
4. Section별 page/control 구조 완성
5. HWP serializer + semantic round-trip tests
6. HWP -> Munseo normalizer
7. HWP 웹 편집기 재연결
8. HWPX parser도 같은 수준의 구조 보존으로 강화
9. 정확한 pagination 엔진
10. 자체 문서 JSON import/export와 클라우드/공유

## Render

루트의 `render.yaml`을 사용합니다.

```text
GitHub main push
  -> Render build: npm ci && npm run check
  -> publish: ./dist
```

GitHub Actions는 자동 실행하지 않고 수동 `workflow_dispatch`만 사용합니다.

# ADR 0003 — HWP는 HWPX를 거치지 않고 직접 해석한다

- Status: accepted
- Date: 2026-09-11

## Context

초기 프로토타입은 binary HWP 5.x를 외부 브라우저 모듈로 HWPX로 변환한 뒤 기존 HWPX importer에 넣었다. 실제 양식 HWP에서 페이지 방향, 표 셀 폭/높이, nested text object 등 일부 정보가 중간 변환에서 사라졌고, 렌더러에서 CSS 예외처리로 증상을 보정하는 흐름이 생겼다.

## Decision

HWP -> HWPX bridge를 완전히 제거한다.

HWP는 다음 독립 경로만 사용한다.

```text
HWP bytes
  -> native CFB reader
  -> native HWP record parser
  -> HWP-specific semantic IR
  -> normalizer
  -> Munseo document
```

HWP parser가 충분히 완성되기 전에는 웹 편집기에 HWP 지원을 노출하지 않는다.

## Scope

대상은 일반적인 편집 가능한 HWP 5.x의 표준 문서 구조다. 암호화/배포용/DRM/차트/OLE/스크립트/매크로/HWP 2.x·3.x/비표준 확장/손상 복구/외부 프로그램 Tag/embedded 객체 내부 포맷은 비목표다.

## Consequences

- 중간 포맷 손실을 renderer에서 보정하지 않는다.
- HWP/HWPX parser는 서로 독립적인 형제 모듈이 된다.
- format registry에는 실제 normalizer까지 검증된 importer만 등록한다.
- HWP serializer와 semantic round-trip test를 독립적으로 만들 수 있다.
- 초기에는 HWP 웹 편집 기능이 일시적으로 비활성화된다.

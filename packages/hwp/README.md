# Munseo native HWP 5.x engine

`packages/hwp`의 목표는 **일반적인 편집 가능한 HWP 5.x 문서를 HWPX나 다른 중간 포맷 없이 직접 해석하고, 이후 다시 HWP로 직렬화할 수 있는 format-specific engine**입니다.

```text
HWP bytes
  -> CFB reader
  -> FileHeader / DocInfo / BodyText record grammar
  -> semantic HWP IR
  -> normalizer
  -> Munseo document

semantic HWP IR
  -> HWP serializer (후속)
  -> HWP bytes
```

## 절대 규칙

1. HWP -> HWPX -> Munseo 우회 경로를 만들지 않습니다.
2. 렌더러/CSS에서 파서의 정보 손실을 보정하지 않습니다.
3. 외부 HWP parser를 런타임 bridge로 사용하지 않습니다.
4. `packages/hwp`는 DOM, React, Render를 모릅니다.
5. 일반/양식 모드는 파싱 단계가 아니라 **정확히 파싱된 HWP IR을 Munseo 문서로 정규화하는 정책**입니다.
6. 사용자가 편집한 뒤 invalidate되는 HWP cache(`PARA_LINE_SEG` 등)는 원본 fidelity hint와 편집 후 layout state를 구분합니다.

## 목표 범위

다음은 HWP의 일반 편집 문서를 구성하는 내용이므로 해석/역변환 대상입니다.

- CFB storage/stream 구조와 FileHeader
- DocInfo의 글꼴, 글자 모양, 문단 모양, 스타일, 테두리/채우기, 탭, 번호/글머리표
- BodyText Section과 Section별 PAGE_DEF
- 문단, UTF-16 text/control stream, char-shape change points, range tags, line-segment cache
- 표, 셀 주소, 병합, 폭/높이, 안쪽 여백, border/fill, 셀 내부 story
- BinData 이미지와 그림 개체
- 표준 도형, 그룹, 위치/크기/anchor/z-order, 글상자 내부 story
- 머리말/꼬리말/각주/미주 등 표준 text-bearing control
- 페이지/단/구역 관련 일반 편집 속성
- 위 요소를 다시 HWP 5.x로 직렬화하는 데 필요한 의미 정보

## 명시적 비목표

아래는 Munseo HWP 엔진의 목표가 아닙니다. 이를 지원하기 위해 파서/serializer를 복잡하게 만들지 않습니다.

1. 암호화 문서
2. 배포용 문서
3. DRM
4. 차트
5. OLE 삽입 객체
6. 스크립트/매크로
7. HWP 2.x/3.x
8. 특정 한컴 버전에만 존재하는 비표준 확장 레코드
9. 손상된 파일 복구
10. 알려지지 않은 외부 프로그램 Tag
11. embedded 객체 내부의 별도 파일 형식 해석

비목표 기능이 문서에 같이 들어 있어도 일반 본문을 안전하게 읽을 수 있는 경우에는 존재 여부만 보고할 수 있습니다. 하지만 해당 기능 자체의 의미 보존이나 round-trip은 계약하지 않습니다.

## 현재 단계

현재는 **native parser foundation** 단계입니다.

- CFB reader
- HWP FileHeader parser / 범위 검사
- 공통 Record header parser + Level tree
- BodyText 문단 구조
- source-word 위치를 보존하는 PARA_TEXT tokenizer
- char-shape change point
- line segment / range tag 기초 구조
- PAGE_DEF
- 표/셀의 기본 구조와 nested paragraph story

아직 이 HWP IR을 웹 편집기에 연결하지 않습니다. semantic coverage가 충분해진 뒤 별도 normalizer를 만들어 연결합니다.

## 완료 기준

HWP import 완료를 "화면에서 얼추 보임"으로 정의하지 않습니다.

1. 표준 대상 레코드의 의미 필드가 HWP IR에 존재한다.
2. nested story(표 셀/글상자/머리말 등)가 평탄화되지 않는다.
3. character position과 style reference가 원본 좌표계를 유지한다.
4. Section별 page definition이 유지된다.
5. parser -> serializer -> parser round-trip에서 대상 의미 정보가 동일하다.
6. 그 이후에만 renderer fidelity를 별도로 검증한다.

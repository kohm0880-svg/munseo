# Roadmap

## P0 — native HWP 5.x semantic engine

- CFB/FileHeader/Record grammar 안정화
- DocInfo semantic parser
  - font faces
  - char shapes
  - para shapes
  - border/fill
  - tabs
  - numbering/bullets
  - styles
- BodyText semantic parser
  - paragraph text/control stream
  - char-shape positions
  - line segments / range tags
  - standard controls
- Section별 PAGE_DEF / 단 / header / footer
- 표/셀 nested story, 폭/높이/병합/여백/border-fill
- 이미지/BinData
- 표준 도형/그룹/글상자와 text story
- HWP semantic IR validation

## P1 — HWP invert / round-trip

- semantic HWP IR -> record serializer
- DocInfo/BodyText stream serializer
- CFB writer
- parser -> serializer -> parser equivalence tests
- 편집한 문단/표/도형의 참조 ID 재구성
- scope 밖 기능은 round-trip 계약에서 제외

## P2 — Munseo normalization

- HWP -> 일반 문서 normalization policy
- HWP -> 양식 문서 normalization policy
- HWP 웹 편집기 재연결
- HWPX importer도 같은 parser/normalizer 원칙으로 재정리
- 자체 문서 schema v2 필요성 검토 및 migration

## P3 — layout

- 정확한 줄 단위 pagination
- 표 행 단위 분할
- A4/B4/A3/Letter/사용자 지정
- 직접 여백 조절
- `정확히 N쪽` 최적화

## P4 — 파일/클라우드

- 자체 JSON 파일 import/export
- HWP/HWPX export 정책
- PDF export 안정화
- 인증
- API 저장소 어댑터
- 링크 공유
- 버전 기록
- 폴더/작업공간

## P5 — 협업/앱

- 공동편집
- 댓글/멘션
- 데스크톱 앱 및 파일 연결
- 모바일 검토/간단 편집
- 작업공간 대화

# ADR 0002 — HWPX is an import/export format, not the internal model

**Status:** Accepted

HWPX XML 트리를 그대로 편집 상태로 사용하지 않는다. HWPX는 자체 문서 모델로 정규화한다.

단, 알 수 없는 원본 정보와 원본 파일은 향후 round-trip 호환을 위해 별도로 보존할 수 있다.

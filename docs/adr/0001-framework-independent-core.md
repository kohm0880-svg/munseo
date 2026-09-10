# ADR 0001 — Core is framework-independent

**Status:** Accepted

핵심 문서 모델, HWPX import, 출력 프로필은 React/Tiptap/Render 같은 특정 UI·배포 기술에 의존하지 않는다.

이유: 웹 UI를 갈아엎거나 데스크톱 앱을 추가해도 가장 비싼 문서 호환 로직을 재사용하기 위해서다.

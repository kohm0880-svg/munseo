# ADR 0004 — Storage stays behind a port

**Status:** Accepted

웹 로컬 저장, 클라우드 API, 데스크톱 파일시스템을 동일한 저장소 계약 뒤에 둔다.

현재 `localStorage` 구현은 임시 어댑터일 뿐이며 제품 데이터 계층으로 취급하지 않는다.

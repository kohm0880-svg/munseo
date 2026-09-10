# Development workflow

## 평소 수정

```bash
git checkout -b feature/짧은-기능명
npm run dev
# 수정
npm run check
git add .
git commit -m "feat: ..."
git push
```

초기에는 Render PR Preview를 꺼 둡니다. 필요할 때만 활성화해 불필요한 빌드 사용량을 줄입니다.

## 구조를 바꿀 때

다음 중 하나에 해당하면 `docs/adr/`에 결정을 하나 남깁니다.

- 문서 내부 스키마 변경
- 저장 방식 변경
- 편집 엔진 교체
- pagination 엔진 교체
- 클라우드 백엔드 도입
- 외부 파일 포맷의 round-trip 정책 변경

## 자체 문서 스키마 변경

1. `DOCUMENT_SCHEMA_VERSION` 증가
2. 새 문서 생성 로직 수정
3. `migrations.js`에 이전 버전 → 새 버전 변환 추가
4. 구버전 fixture 테스트 추가

이 순서를 지키면 예전 문서를 깨뜨리지 않고 업데이트할 수 있습니다.

## 새 파일 형식 추가

예: DOCX

1. `packages/docx/` importer 작성
2. `packages/formats/src/import-registry.js`에 등록
3. fixture + 테스트 추가

웹 UI의 파일 열기 로직은 고치지 않는 것을 원칙으로 합니다.

## 새 저장소 추가

예: 서버 API

`packages/storage`의 계약을 구현하는 `api-document-store.js`를 추가합니다. UI는 `store.save/load/list/remove`만 호출하도록 유지합니다.

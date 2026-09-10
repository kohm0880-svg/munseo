# Munseo Document Format v1

자체 문서 포맷은 JSON이며 `schemaVersion`으로 버전을 관리합니다.

```json
{
  "schemaVersion": 1,
  "id": "doc_...",
  "title": "행사 계획서",
  "mode": "general",
  "source": { "format": "hwpx", "name": "원본.hwpx" },
  "blocks": [
    { "id": "h_...", "type": "heading", "level": 1, "text": "제목", "attrs": {} },
    { "id": "p_...", "type": "paragraph", "text": "본문", "attrs": {} }
  ],
  "printProfile": {
    "paper": "A4",
    "orientation": "portrait",
    "marginTopMm": 18,
    "marginRightMm": 20,
    "marginBottomMm": 18,
    "marginLeftMm": 20,
    "density": 55
  },
  "meta": { "createdAt": "...", "updatedAt": "..." }
}
```

## 규칙

1. 저장된 모든 문서는 `schemaVersion`을 가진다.
2. 스키마 변경은 `packages/core/src/migrations.js`에서만 승격한다.
3. 외부 포맷(HWPX/DOCX 등)의 식별자는 `attrs` 또는 `source` 메타데이터로만 보존한다.
4. 페이지 크기는 본문 블록과 분리한다.
5. 알 수 없는 외부 개체는 조용히 버리지 않는다.

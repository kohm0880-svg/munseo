/**
 * 정확한 pagination 엔진이 생겨도 UI가 이 API를 그대로 쓰게 하기 위한 경계입니다.
 * 현재 구현은 DOM 측정값을 받아 단순 계산합니다.
 */
export function estimatePageCount({ contentHeightPx, pageHeightPx }) {
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, contentHeightPx - 2) / pageHeightPx));
}

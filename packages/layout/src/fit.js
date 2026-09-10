/**
 * 출력 페이지 수를 목표값 이하로 맞추되, 사용자가 직접 고른 설정을 가능한 한
 * 적게 건드립니다. DOM/브라우저를 모르며 실제 측정은 callback으로 위임합니다.
 */
export async function fitProfileToPageTarget(
  inputProfile,
  targetPages,
  measurePages,
  { minVerticalMarginMm = 8 } = {}
) {
  const target = Math.max(1, Math.floor(Number(targetPages) || 1));
  const original = structuredClone(inputProfile);
  const originalPages = await measurePages(original);
  if (originalPages <= target) {
    return { ok: true, profile: original, pages: originalPages, changed: false, changes: [] };
  }

  const verticalSteps = buildMarginSteps(original, minVerticalMarginMm);
  for (const margins of verticalSteps) {
    const base = { ...original, ...margins };
    const compact = { ...base, density: 0 };
    const compactPages = await measurePages(compact);
    if (compactPages > target) continue;

    // 원래 density 이하에서 가장 여유로운(가장 큰) 값을 찾습니다.
    let low = 0;
    let high = Math.max(0, Math.min(100, Number(original.density) || 0));
    let best = compact;
    let bestPages = compactPages;
    for (let i = 0; i < 8 && low <= high; i += 1) {
      const mid = Math.floor((low + high) / 2);
      const candidate = { ...base, density: mid };
      const pages = await measurePages(candidate);
      if (pages <= target) {
        best = candidate;
        bestPages = pages;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return {
      ok: true,
      profile: best,
      pages: bestPages,
      changed: true,
      changes: describeChanges(original, best)
    };
  }

  return {
    ok: false,
    profile: original,
    pages: originalPages,
    changed: false,
    changes: [],
    reason: 'spacing-and-margin-limit'
  };
}

function buildMarginSteps(profile, minimum) {
  const top = Number(profile.marginTopMm) || 0;
  const bottom = Number(profile.marginBottomMm) || 0;
  const maxReduction = Math.max(0, Math.floor(Math.min(top - minimum, bottom - minimum)));
  const steps = [];
  // 문단/행간만으로 해결할 기회를 먼저 줍니다.
  for (let reduction = 0; reduction <= maxReduction; reduction += 1) {
    steps.push({ marginTopMm: top - reduction, marginBottomMm: bottom - reduction });
  }
  return steps;
}

function describeChanges(before, after) {
  const changes = [];
  if (before.density !== after.density) changes.push({ field: 'density', from: before.density, to: after.density });
  if (before.marginTopMm !== after.marginTopMm) changes.push({ field: 'marginTopMm', from: before.marginTopMm, to: after.marginTopMm });
  if (before.marginBottomMm !== after.marginBottomMm) changes.push({ field: 'marginBottomMm', from: before.marginBottomMm, to: after.marginBottomMm });
  return changes;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { densityToTypography, estimatePageCount, fitProfileToPageTarget, getPaperMetrics } from '../packages/layout/src/index.js';

test('paper orientation swaps dimensions without mutating preset', () => {
  assert.deepEqual(getPaperMetrics({ paper: 'A4', orientation: 'portrait' }), { widthMm: 210, heightMm: 297 });
  assert.deepEqual(getPaperMetrics({ paper: 'A4', orientation: 'landscape' }), { widthMm: 297, heightMm: 210 });
});

test('density stays inside expected bounds', () => {
  assert.deepEqual(densityToTypography(-50), densityToTypography(0));
  assert.deepEqual(densityToTypography(500), densityToTypography(100));
});

test('page estimator has a replaceable stable API', () => {
  assert.equal(estimatePageCount({ contentHeightPx: 1000, pageHeightPx: 400 }), 3);
  assert.equal(estimatePageCount({ contentHeightPx: 0, pageHeightPx: 400 }), 1);
});


test('page fitter preserves font-independent profile and uses the least compaction it can find', async () => {
  const profile = {
    paper: 'A4', orientation: 'portrait', density: 60,
    marginTopMm: 18, marginRightMm: 20, marginBottomMm: 18, marginLeftMm: 20
  };
  const measurePages = async (candidate) => candidate.density > 35 ? 6 : 5;
  const result = await fitProfileToPageTarget(profile, 5, measurePages);
  assert.equal(result.ok, true);
  assert.equal(result.pages, 5);
  assert.ok(result.profile.density <= 35);
  assert.equal(result.profile.marginTopMm, 18);
  assert.equal(result.profile.marginBottomMm, 18);
});

test('page fitter only reduces vertical margins after density alone is insufficient', async () => {
  const profile = {
    paper: 'A4', orientation: 'portrait', density: 50,
    marginTopMm: 18, marginRightMm: 20, marginBottomMm: 18, marginLeftMm: 20
  };
  const measurePages = async (candidate) => candidate.marginTopMm <= 15 && candidate.density <= 20 ? 4 : 5;
  const result = await fitProfileToPageTarget(profile, 4, measurePages);
  assert.equal(result.ok, true);
  assert.ok(result.profile.marginTopMm <= 15);
  assert.ok(result.profile.marginBottomMm <= 15);
  assert.equal(result.profile.marginLeftMm, 20);
});

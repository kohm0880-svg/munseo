import test from 'node:test';
import assert from 'node:assert/strict';
import { densityToTypography, estimatePageCount, getPaperMetrics } from '../packages/layout/src/index.js';

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

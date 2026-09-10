export const PAPER_PRESETS = Object.freeze({
  A4: { id: 'A4', label: 'A4', widthMm: 210, heightMm: 297 },
  A3: { id: 'A3', label: 'A3', widthMm: 297, heightMm: 420 },
  B4_ISO: { id: 'B4_ISO', label: 'B4 ISO', widthMm: 250, heightMm: 353 },
  B4_JIS: { id: 'B4_JIS', label: 'B4 JIS', widthMm: 257, heightMm: 364 },
  LETTER: { id: 'LETTER', label: 'Letter', widthMm: 215.9, heightMm: 279.4 }
});

export function getPaperMetrics(profile) {
  const preset = PAPER_PRESETS[profile.paper] ?? PAPER_PRESETS.A4;
  const portrait = profile.orientation !== 'landscape';
  return {
    widthMm: portrait ? preset.widthMm : preset.heightMm,
    heightMm: portrait ? preset.heightMm : preset.widthMm
  };
}

export function densityToTypography(density = 55) {
  const t = Math.max(0, Math.min(100, Number(density))) / 100;
  return {
    paragraphGapPx: 3 + t * 21,
    lineHeight: 1.35 + t * 0.55
  };
}

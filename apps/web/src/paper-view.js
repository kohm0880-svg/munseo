import { densityToTypography, estimatePageCount, getPaperMetrics } from '../../../packages/layout/src/index.js';

export function applyPrintProfile(profile) {
  const { widthMm, heightMm } = getPaperMetrics(profile);
  const typography = densityToTypography(profile.density);
  const root = document.documentElement;
  root.style.setProperty('--paper-width', `${widthMm}mm`);
  root.style.setProperty('--paper-height', `${heightMm}mm`);
  root.style.setProperty('--page-margin-top', `${profile.marginTopMm}mm`);
  root.style.setProperty('--page-margin-right', `${profile.marginRightMm}mm`);
  root.style.setProperty('--page-margin-bottom', `${profile.marginBottomMm}mm`);
  root.style.setProperty('--page-margin-left', `${profile.marginLeftMm}mm`);
  root.style.setProperty('--para-gap', `${typography.paragraphGapPx.toFixed(1)}px`);
  root.style.setProperty('--line-height', typography.lineHeight.toFixed(2));
}

export function updatePageGuides({ editor, pageGuides, paperShell, pageEstimate, profile, view }) {
  if (view !== 'paper') return;
  requestAnimationFrame(() => {
    pageGuides.innerHTML = '';
    const { heightMm } = getPaperMetrics(profile);
    const pagePx = mmToPx(heightMm);
    const pages = estimatePageCount({ contentHeightPx: Math.max(editor.scrollHeight, pagePx), pageHeightPx: pagePx });
    pageEstimate.textContent = `${pages}쪽`;
    for (let page = 1; page < pages; page += 1) {
      const guide = document.createElement('div');
      guide.className = 'page-guide';
      guide.style.top = `${page * pagePx}px`;
      guide.dataset.page = `${page + 1}쪽`;
      pageGuides.appendChild(guide);
    }
    paperShell.style.minHeight = `${pages * pagePx}px`;
  });
}

export function injectPrintRule(profile) {
  const { widthMm, heightMm } = getPaperMetrics(profile);
  let style = document.getElementById('dynamicPageRule');
  if (!style) {
    style = document.createElement('style');
    style.id = 'dynamicPageRule';
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: ${profile.marginTopMm}mm ${profile.marginRightMm}mm ${profile.marginBottomMm}mm ${profile.marginLeftMm}mm; }`;
}

function mmToPx(mm) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:${mm}mm;height:1px;`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px;
}

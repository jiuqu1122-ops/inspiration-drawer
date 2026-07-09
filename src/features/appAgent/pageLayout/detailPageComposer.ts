import type { DetailPageSpec } from './detailPageLayoutTypes';

export type DetailPageOverlayElement =
  | { kind: 'pageNo'; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'title'; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'subtitle'; text: string; x: number; y: number; width: number; height: number }
  | { kind: 'tag'; text: string; icon: string; x: number; y: number; width: number; height: number }
  | { kind: 'note'; text: string; x: number; y: number; width: number; height: number };

export interface DetailPageOverlayPlan {
  renderMode: DetailPageSpec['renderMode'];
  aspectRatio: string;
  elements: DetailPageOverlayElement[];
}

export const buildDetailPageOverlayPlan = (spec: DetailPageSpec): DetailPageOverlayPlan => {
  if (spec.renderMode === 'visual_background_only') {
    return { renderMode: spec.renderMode, aspectRatio: spec.layout.aspectRatio, elements: [] };
  }
  const tagWidth = 180;
  const tagGap = 18;
  const tagStartX = 0.5 - ((tagWidth * 3 + tagGap * 2) / 2) / 1000;
  const elements: DetailPageOverlayElement[] = [
    { kind: 'pageNo', text: spec.copy.pageNo, x: 0.42, y: 0.055, width: 0.16, height: 0.034 },
    { kind: 'title', text: spec.copy.title, x: 0.18, y: 0.11, width: 0.64, height: 0.07 },
    { kind: 'subtitle', text: spec.copy.subtitle, x: 0.2, y: 0.19, width: 0.6, height: 0.045 },
    ...spec.copy.tags.slice(0, 3).map((tag, index): DetailPageOverlayElement => ({
      kind: 'tag',
      text: tag.text,
      icon: tag.icon,
      x: tagStartX + index * ((tagWidth + tagGap) / 1000),
      y: 0.265,
      width: tagWidth / 1000,
      height: 0.052,
    })),
    ...(spec.copy.localNotes || []).slice(0, 3).map((text, index): DetailPageOverlayElement => ({
      kind: 'note',
      text,
      x: spec.layout.closeupPosition === 'left' ? 0.08 : 0.68,
      y: 0.56 + index * 0.06,
      width: 0.24,
      height: 0.04,
    })),
  ];
  return { renderMode: spec.renderMode, aspectRatio: spec.layout.aspectRatio, elements };
};

export const composeDetailPageSvgOverlay = (spec: DetailPageSpec) => {
  const plan = buildDetailPageOverlayPlan(spec);
  const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nodes = plan.elements.map(element => {
    const x = Math.round(element.x * 1000);
    const y = Math.round(element.y * 1500);
    if (element.kind === 'tag') {
      return `<g><rect x="${x}" y="${y}" width="${Math.round(element.width * 1000)}" height="${Math.round(element.height * 1500)}" rx="18" fill="none" stroke="#111827" stroke-width="2"/><text x="${x + 22}" y="${y + 34}" font-size="24" font-weight="700">${esc(element.icon)} ${esc(element.text)}</text></g>`;
    }
    const fontSize = element.kind === 'title' ? 54 : element.kind === 'subtitle' ? 28 : 20;
    const weight = element.kind === 'title' ? 800 : 600;
    return `<text x="${x}" y="${y}" font-size="${fontSize}" font-weight="${weight}" fill="#111827">${esc(element.text)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1500">${nodes}</svg>`;
};

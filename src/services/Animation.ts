import type { ASTNode, GSAPTween } from '../types/Common';

/** DrawSVG only targets paths that actually have a stroke attribute. */
export const DRAW_SELECTOR = 'path[stroke]:not([stroke="none"])';

export function scanSvg(content = '') {
  const doc = new DOMParser().parseFromString(content, 'image/svg+xml');
  const paths = [...doc.querySelectorAll('path')];
  const has = (attr: string) => paths.some(p => { const v = p.getAttribute(attr); return !!v && v !== 'none'; });
  return { hasStroke: has('stroke'), hasFill: has('fill') }; // hasFill: reserved for MorphSVG
}

export interface Caps { filters: boolean; drawSVG: boolean; splitText: boolean }

/** What each node may safely animate. The inspector hides the rest, and tweenVars() enforces it at runtime. */
export const capsFor = (n: ASTNode): Caps => ({
  filters: n.type === 'RASTER',
  drawSVG: n.type === 'INLINE_SVG' && scanSvg(n.content).hasStroke,
  splitText: n.type === 'TEXT',
});

export interface SplitConfig { type: 'chars' | 'words' | 'lines'; stagger: number }

/** Zero-crash: drop plugin keys the node can't run, and separate them from plain GSAP vars. */
export function tweenVars(node: ASTNode, t: GSAPTween) {
  const caps = capsFor(node);
  const { drawSVG, splitText, filter, ...plain } = t.properties as Record<string, unknown>;
  const draw = caps.drawSVG && !!drawSVG;
  const split = caps.splitText ? (splitText as SplitConfig | undefined) : undefined;
  const vars: Record<string, unknown> = { ...plain, duration: t.duration, delay: t.delay, ease: t.ease };
  if (caps.filters && filter) vars.filter = filter;
  if (split) vars.stagger = split.stagger;
  return { vars, draw, split, from: !!t.from };
}
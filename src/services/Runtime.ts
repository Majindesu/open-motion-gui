import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin, SplitText);

export interface RuntimeTween {
  id: string;
  trigger: 'ON_LOAD' | 'ON_CLICK' | 'ON_HOVER' | 'ON_SCROLL';
  duration: number;
  delay: number;
  ease: string;
  from?: boolean;
  properties: Record<string, unknown>;
  scrollProps?: { start: string; end: string; scrub: boolean };
}
export interface RuntimeNode {
  id: string;
  type: 'CONTAINER' | 'RASTER' | 'INLINE_SVG' | 'TEXT';
  content?: string; // only needed for INLINE_SVG (capability scan)
  animations: RuntimeTween[];
}

/** Animations run at this width and up (exported pages included). */
export const BREAKPOINT = '(min-width: 768px)';

/** DrawSVG only targets paths that actually have a stroke attribute. */
export const DRAW_SELECTOR = 'path[stroke]:not([stroke="none"])';

export function scanSvg(content = '') {
  const doc = new DOMParser().parseFromString(content, 'image/svg+xml');
  const paths = [...doc.querySelectorAll('path')];
  const has = (attr: string) => paths.some(p => { const v = p.getAttribute(attr); return !!v && v !== 'none'; });
  return { hasStroke: has('stroke'), hasFill: has('fill') };
}

export interface Caps { filters: boolean; drawSVG: boolean; splitText: boolean }

/** What each node may safely animate. */
export const capsFor = (n: RuntimeNode): Caps => ({
  filters: n.type === 'RASTER',
  drawSVG: n.type === 'INLINE_SVG' && scanSvg(n.content).hasStroke,
  splitText: n.type === 'TEXT',
});

export interface SplitConfig { type: 'chars' | 'words' | 'lines'; stagger: number }

/** Zero-crash: drop plugin keys the node can't run, and separate them from plain GSAP vars. */
export function tweenVars(node: RuntimeNode, t: RuntimeTween) {
  const caps = capsFor(node);
  const { drawSVG, splitText, filter, ...plain } = t.properties as Record<string, unknown>;
  const draw = caps.drawSVG && !!drawSVG;
  const split = caps.splitText ? (splitText as SplitConfig | undefined) : undefined;
  const vars: Record<string, unknown> = { ...plain, duration: t.duration, delay: t.delay, ease: t.ease };
  if (caps.filters && filter) vars.filter = filter;
  if (split) vars.stagger = split.stagger;
  return { vars, draw, split, from: !!t.from };
}

export interface Built {
  /** Preview only: paused master timeline holding every non-scroll tween, for scrubbing. */
  readonly timeline: gsap.core.Timeline | null;
  revert(): void;
}

/**
 * Wires every animation onto the DOM under `root`; elements are found by data-node-id.
 * Export (default): tweens run live on their triggers.
 * Preview: non-scroll tweens go on a paused timeline at their delay so the editor can scrub them.
 * ScrollTrigger tweens are live in both.
 */
export function buildAnimations(
  root: HTMLElement,
  nodes: RuntimeNode[],
  opts: { preview?: boolean; onTimeline?: (tl: gsap.core.Timeline) => void } = {},
): Built {
  const mm = gsap.matchMedia(root);
  let timeline: gsap.core.Timeline | null = null;

  mm.add(BREAKPOINT, () => {
    const cleanups: Array<() => void> = [];
    const tl = opts.preview ? gsap.timeline({ paused: true }) : null;
    timeline = tl;

    for (const node of nodes) {
      const el = root.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);
      if (!el) continue;

      for (const t of node.animations) {
        const { vars, draw, split, from } = tweenVars(node, t);
        let targets: gsap.TweenTarget = el;
        if (draw) targets = el.querySelectorAll(DRAW_SELECTOR);
        else if (split) {
          const sp = SplitText.create(el, { type: split.type });
          cleanups.push(() => sp.revert());
          targets = sp[split.type];
        }

        const play = (v: gsap.TweenVars) =>
          draw ? gsap.fromTo(targets, { drawSVG: '0%' }, { ...v, drawSVG: '100%' })
          : from ? gsap.from(targets, v)
          : gsap.to(targets, v);

        if (t.trigger === 'ON_SCROLL') {
          play({ ...vars, scrollTrigger: { id: t.id, trigger: el, ...t.scrollProps } });
        } else if (tl) {
          const v = { ...vars, delay: 0 }; // position on the timeline carries the delay
          if (draw) tl.fromTo(targets, { drawSVG: '0%' }, { ...v, drawSVG: '100%' }, t.delay);
          else if (from) tl.from(targets, v, t.delay);
          else tl.to(targets, v, t.delay);
        } else if (t.trigger === 'ON_LOAD') {
          play(vars);
        } else {
          const evt = t.trigger === 'ON_CLICK' ? 'click' : 'mouseenter';
          const h = () => play(vars);
          el.addEventListener(evt, h);
          cleanups.push(() => el.removeEventListener(evt, h));
        }
      }
    }

    if (tl) opts.onTimeline?.(tl);
    return () => { timeline = null; cleanups.forEach(fn => fn()); };
  });

  return { get timeline() { return timeline; }, revert: () => mm.revert() };
}
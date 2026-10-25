import { useEffect, useRef, useState, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import DOMPurify from 'dompurify';
import type { ASTNode, IframeEvent, PostMessageEvent } from '../types/Common';
import { DRAW_SELECTOR, tweenVars } from '../services/Animation';
 
gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin, SplitText);
 
// The host's slider drags happen in the *parent* window, so the iframe never sees
// mouseup. Instead: re-render styles on every SYNC_AST, rebuild GSAP only once
// messages stop arriving for SETTLE_MS.
const SETTLE_MS = 250;
 
const sendToHost = (m: IframeEvent) => window.parent.postMessage(m, location.origin);
 
function NodeView({ node, ast, selected }: { node: ASTNode; ast: ASTNode[]; selected: string | null }) {
  const s = node.style;
  const style: CSSProperties = {
    display: s.layout, justifyContent: s.justifyContent, alignItems: s.alignItems,
    padding: s.padding, width: s.width, height: s.height,
    background: s.background, color: s.color, fontSize: s.fontSize,
    position: 'relative', zIndex: s.zIndex, isolation: 'isolate',
    outline: selected === node.id ? '2px solid #3b82f6' : undefined, outlineOffset: -2,
  };
  const common = {
    'data-node-id': node.id, style,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); sendToHost({ type: 'NODE_CLICKED', payload: node.id }); },
  };
  const kids = ast.filter(n => n.parentId === node.id).sort((a, b) => a.style.zIndex - b.style.zIndex);
 
  switch (node.type) {
    case 'RASTER':
      return <img {...common} src={node.src} alt={node.name} />;
    case 'INLINE_SVG':
      return <div {...common} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(node.content ?? '', { USE_PROFILES: { svg: true } }) }} />;
    case 'TEXT':
      return <p {...common}>{node.content}</p>;
    default:
      return <div {...common}>{kids.map(k => <NodeView key={k.id} node={k} ast={ast} selected={selected} />)}</div>;
  }
}
 
export default function Renderer() {
  const [ast, setAst] = useState<ASTNode[]>([]);           // drives DOM/styles (every message)
  const [settled, setSettled] = useState<ASTNode[]>([]);   // drives GSAP (debounced)
  const [selected, setSelected] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);
  const tlRef = useRef<gsap.core.Timeline | null>(null); // paused master timeline (TIME mode scrubbing)
  const timeRef = useRef(0);
 
  useEffect(() => {
    const onMessage = (e: MessageEvent<PostMessageEvent>) => {
      if (e.source !== window.parent || e.origin !== location.origin) return;
      const msg = e.data;
      if (msg.type === 'SYNC_AST') {
        setAst(msg.payload);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setSettled(msg.payload), SETTLE_MS);
      } else if (msg.type === 'SET_SELECTION') {
        setSelected(msg.payload);
      } else if (msg.type === 'SCRUB_PLAYHEAD') {
        const { time, mode } = msg.payload;
        if (mode === 'TIME') { timeRef.current = time; tlRef.current?.time(time); }
        else window.scrollTo(0, (time / 100) * ScrollTrigger.maxScroll(window));
      }
    };
    window.addEventListener('message', onMessage);
    sendToHost({ type: 'READY' });
    return () => { window.removeEventListener('message', onMessage); window.clearTimeout(timer.current); };
  }, []);
 
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 0px)', () => {
      const cleanups: Array<() => void> = [];
      const tl = gsap.timeline({ paused: true });
      for (const node of settled) {
        const el = root.current?.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);
        if (!el) continue;
        for (const t of node.animations) {
          const { vars, draw, split, from } = tweenVars(node, t); // strips anything this node type can't run
          let targets: gsap.TweenTarget = el;
          if (draw) targets = el.querySelectorAll(DRAW_SELECTOR);
          else if (split) {
            const sp = SplitText.create(el, { type: split.type });
            cleanups.push(() => sp.revert());
            targets = sp[split.type];
          }
          if (t.trigger === 'ON_SCROLL') {
            // live: ScrollTrigger drives it. id lets us report its measured range to the timeline.
            const v = { ...vars, scrollTrigger: { id: t.id, trigger: el, ...t.scrollProps } };
            if (draw) gsap.fromTo(targets, { drawSVG: '0%' }, { ...v, drawSVG: '100%' });
            else if (from) gsap.from(targets, v);
            else gsap.to(targets, v);
          } else {
            // everything else is placed on the master timeline at its delay, so it can be scrubbed
            const v = { ...vars, delay: 0 };
            if (draw) tl.fromTo(targets, { drawSVG: '0%' }, { ...v, drawSVG: '100%' }, t.delay);
            else if (from) tl.from(targets, v, t.delay);
            else tl.to(targets, v, t.delay);
          }
        }
      }
      tl.time(timeRef.current); // survive rebuilds without jumping back to 0
      tlRef.current = tl;
      return () => { tlRef.current = null; cleanups.forEach(fn => fn()); };
    });
    const raf = requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      const max = ScrollTrigger.maxScroll(window) || 1;
      const pct = gsap.utils.clamp(0, 100);
      sendToHost({
        type: 'SCROLL_MARKERS',
        payload: ScrollTrigger.getAll().filter(st => st.vars.id)
          .map(st => ({ tweenId: String(st.vars.id), start: pct((st.start / max) * 100), end: pct((st.end / max) * 100) })),
      });
    });
    return () => { cancelAnimationFrame(raf); mm.revert(); };
  }, { scope: root, dependencies: [settled], revertOnUpdate: true });
 
  return (
    <div ref={root} style={{ minHeight: '100vh' }} onClick={() => sendToHost({ type: 'NODE_CLICKED', payload: null })}>
      {ast.filter(n => n.parentId === null).sort((a, b) => a.style.zIndex - b.style.zIndex)
        .map(n => <NodeView key={n.id} node={n} ast={ast} selected={selected} />)}
    </div>
  );
}
 
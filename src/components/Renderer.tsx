import { useEffect, useRef, useState, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import DOMPurify from 'dompurify';
import type { ASTNode, IframeEvent, PostMessageEvent } from '../types/Common';
import { DRAW_SELECTOR, tweenVars } from '../services/Animation';
import { nodeStyle, ROOT_CLASS } from '../services/Layout';
import { buildAnimations, type Built } from '../services/Runtime';
 
gsap.registerPlugin(useGSAP);
 
// Styles re-render on every SYNC_AST; GSAP rebuilds only once messages stop for SETTLE_MS
// (the host's slider drags happen in the parent window, so this iframe never sees mouseup).
const SETTLE_MS = 250;
 
const sendToHost = (m: IframeEvent) => window.parent.postMessage(m, location.origin);
 
function NodeView({ node, ast, selected }: { node: ASTNode; ast: ASTNode[]; selected: string | null }) {
  const style: CSSProperties = {
    ...nodeStyle(node), // same function the exporter uses
    ...(selected === node.id ? { outline: '2px solid #3b82f6', outlineOffset: -2 } : {}), // editor-only overlay
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
  const [ast, setAst] = useState<ASTNode[]>([]);
  const [settled, setSettled] = useState<ASTNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const built = useRef<Built | null>(null);
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
        if (mode === 'TIME') { timeRef.current = time; built.current?.timeline?.time(time); }
        else window.scrollTo(0, (time / 100) * ScrollTrigger.maxScroll(window));
      }
    };
    window.addEventListener('message', onMessage);
    sendToHost({ type: 'READY' });
    return () => { window.removeEventListener('message', onMessage); window.clearTimeout(timer.current); };
  }, []);
 
  useGSAP(() => {
    if (!root.current) return;
    // The exact runtime the exported project ships, in preview mode.
    const b = buildAnimations(root.current, settled, { preview: true, onTimeline: tl => tl.time(timeRef.current) });
    built.current = b;
 
    // Report measured scroll ranges (re-sent whenever ScrollTrigger refreshes, e.g. on device change).
    const report = () => {
      const max = ScrollTrigger.maxScroll(window) || 1;
      const pct = gsap.utils.clamp(0, 100);
      sendToHost({
        type: 'SCROLL_MARKERS',
        payload: ScrollTrigger.getAll().filter(st => st.vars.id)
          .map(st => ({ tweenId: String(st.vars.id), start: pct((st.start / max) * 100), end: pct((st.end / max) * 100) })),
      });
    };
    ScrollTrigger.addEventListener('refresh', report);
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh());
 
    return () => {
      cancelAnimationFrame(raf);
      ScrollTrigger.removeEventListener('refresh', report);
      built.current = null;
      b.revert();
    };
  }, { scope: root, dependencies: [settled], revertOnUpdate: true });
 
  return (
    <div ref={root} className={ROOT_CLASS} onClick={() => sendToHost({ type: 'NODE_CLICKED', payload: null })}>
      {ast.filter(n => n.parentId === null).sort((a, b) => a.style.zIndex - b.style.zIndex)
        .map(n => <NodeView key={n.id} node={n} ast={ast} selected={selected} />)}
    </div>
  );
}
 
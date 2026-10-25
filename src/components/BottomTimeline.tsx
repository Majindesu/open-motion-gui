import { useEffect, useRef, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { useEditor } from '../services/Store';
import type { ASTNode, GSAPTween } from '../types/Common';

const PX = 100;       // pixels per second (TIME mode)
const LABEL_W = 150;
const ROW_H = 24;
const snap = (v: number) => Math.round(v * 20) / 20; // 0.05s grid

const rowsFor = (ast: ASTNode[], scroll: boolean) =>
  ast.flatMap(node => node.animations.filter(t => (t.trigger === 'ON_SCROLL') === scroll).map(t => ({ node, t })));

interface LineProps extends React.HTMLAttributes<HTMLDivElement> {
  label: ReactNode; scroll: boolean; trackW: number; head: ReactNode;
  trackRef?: React.Ref<HTMLDivElement>;
}
// Module-level on purpose: defining this inside BottomTimeline would remount rows (and drop pointer capture) every render.
function Line({ label, scroll, trackW, head, trackRef, children, ...rest }: LineProps) {
  return (
    <div className="flex border-b border-neutral-800" style={{ height: ROW_H }}>
      <div className="sticky left-0 z-20 flex-none flex items-center px-2 text-xs truncate bg-[#1E1E1E] border-r border-neutral-700"
        style={{ width: LABEL_W }}>{label}</div>
      <div ref={trackRef} className={`relative ${scroll ? 'flex-1' : 'flex-none'}`}
        style={scroll ? undefined : { width: trackW }} {...rest}>
        {children}{head}
      </div>
    </div>
  );
}

export default function BottomTimeline() {
  const { ast, mode, time, scrollPct, playing, markers, selectedId,
    setTime, setScrollPct, setPlaying, updateNode, commit, select } = useEditor();
  const scroll = mode === 'SCROLL';
  const rows = rowsFor(ast, scroll);
  const end = Math.max(1, ...rowsFor(ast, false).map(r => r.t.delay + r.t.duration));
  const trackW = Math.ceil(end + 2) * PX;
  const ruler = useRef<HTMLDivElement>(null);

  // Playback (TIME mode only): advance the store playhead; Workspace forwards it to the iframe.
  useEffect(() => {
    if (!playing || scroll) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const next = useEditor.getState().time + (now - last) / 1000;
      last = now;
      if (next >= end) { setTime(end); setPlaying(false); return; }
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scroll, end, setTime, setPlaying]);

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (time >= end) setTime(0);
    setPlaying(true);
  };

  const scrub = (e: RPointerEvent) => {
    const r = ruler.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (scroll) setScrollPct(Math.max(0, Math.min(100, (x / r.width) * 100)));
    else setTime(Math.max(0, Math.min(trackW / PX, x / PX)));
  };

  /** Drag a block to change its delay, or its right edge to change its duration. One undo step per drag. */
  const drag = (e: RPointerEvent, nodeId: string, tweenId: string, kind: 'move' | 'resize') => {
    e.stopPropagation(); e.preventDefault();
    select(nodeId);
    const x0 = e.clientX;
    const t0 = useEditor.getState().ast.find(n => n.id === nodeId)!.animations.find(a => a.id === tweenId)!;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / PX;
      const patch: Partial<GSAPTween> = kind === 'move'
        ? { delay: Math.max(0, snap(t0.delay + dt)) }
        : { duration: Math.max(0.05, snap(t0.duration + dt)) };
      const n = useEditor.getState().ast.find(x => x.id === nodeId)!;
      updateNode(nodeId, { animations: n.animations.map(a => (a.id === tweenId ? { ...a, ...patch } : a)) }, true);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); commit(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const head = <div className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-10"
    style={{ left: scroll ? `${scrollPct}%` : time * PX }} />;

  const ticks = scroll ? Array.from({ length: 11 }, (_, i) => i * 10) : Array.from({ length: Math.ceil(end + 2) + 1 }, (_, i) => i);

  return (
    <footer id="timeline-panel" className="h-48 flex flex-col border-t border-neutral-700 min-h-0">
      <div className="flex items-center gap-3 px-3 h-8 border-b border-neutral-700 text-xs">
        {!scroll && <button className="px-2 py-0.5 rounded bg-[#2A2A2A]" onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>}
        <span className="tabular-nums">{scroll ? `${scrollPct.toFixed(0)}% scroll` : `${time.toFixed(2)}s`}</span>
        <span className="text-neutral-500">
          {scroll ? 'Drag the ruler to scroll the canvas. Edit ranges in the Animate tab.' : 'Drag blocks to retime; drag a block’s right edge to change duration.'}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <div style={scroll ? undefined : { width: LABEL_W + trackW }}>
          <Line label="" scroll={scroll} trackW={trackW} head={head} trackRef={ruler} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPlaying(false); scrub(e); }}
            onPointerMove={e => e.buttons === 1 && scrub(e)}>
            {ticks.map(k => (
              <span key={k} className="absolute top-1 text-[10px] text-neutral-500 select-none"
                style={{ left: scroll ? `${k}%` : k * PX + 2 }}>{scroll ? `${k}%` : `${k}s`}</span>
            ))}
          </Line>
          {rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-500">
              {scroll ? 'No scroll animations. Add one with trigger ON_SCROLL.' : 'No timed animations yet. Select a layer and add one in the Animate tab.'}
            </div>
          )}
          {rows.map(({ node, t }) => {
            const m = markers.find(x => x.tweenId === t.id);
            const sel = node.id === selectedId;
            const color = sel ? 'bg-[#3b82f6]' : 'bg-[#4B5563]';
            return (
              <Line key={t.id} label={node.name} scroll={scroll} trackW={trackW} head={head}>
                {scroll ? (m && (
                  <div className={`absolute top-1 bottom-1 rounded px-1 text-[10px] truncate cursor-pointer ${color}`}
                    style={{ left: `${m.start}%`, width: `${Math.max(m.end - m.start, 1)}%` }}
                    onPointerDown={() => select(node.id)}>{t.scrollProps?.scrub ? 'scrub' : 'scroll'}</div>
                )) : (
                  <div className={`absolute top-1 bottom-1 rounded px-1 text-[10px] truncate cursor-grab ${color}`}
                    style={{ left: t.delay * PX, width: Math.max(t.duration * PX, 12) }}
                    onPointerDown={e => drag(e, node.id, t.id, 'move')}>
                    {t.trigger.replace('ON_', '').toLowerCase()}
                    <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30"
                      onPointerDown={e => drag(e, node.id, t.id, 'resize')} />
                  </div>
                )}
              </Line>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
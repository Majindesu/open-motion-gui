import { useCallback, useEffect, useRef } from 'react';
import { useEditor } from '../services/Store';
import type { IframeEvent, PostMessageEvent } from '../types/Common';
import { DEVICES, type DeviceId } from '../utils/Devices';

/** Host side of the iframe bridge. The iframe is a fixed device-size viewport, scaled from outside. */
export default function Workspace() {
  const ast = useEditor(s => s.ast);
  const selectedId = useEditor(s => s.selectedId);
  const select = useEditor(s => s.select);
  const time = useEditor(s => s.time);
  const scrollPct = useEditor(s => s.scrollPct);
  const mode = useEditor(s => s.mode);
  const device = useEditor(s => s.device);
  const zoom = useEditor(s => s.zoom);
  const setDevice = useEditor(s => s.setDevice);
  const setZoom = useEditor(s => s.setZoom);

  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = area.current!;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = DEVICES[device];
  const scale = zoom === 'fit' ? Math.max(0.1, Math.min(1, (avail.w - 32) / d.w, (avail.h - 32) / d.h)) : zoom;

  const post = useCallback((m: PostMessageEvent) => {
    frame.current?.contentWindow?.postMessage(m, location.origin);
  }, []);

  // AST / selection / playhead -> iframe
  useEffect(() => { if (ready.current) post({ type: 'SYNC_AST', payload: ast }); }, [ast, post]);
  useEffect(() => { if (ready.current) post({ type: 'SET_SELECTION', payload: selectedId }); }, [selectedId, post]);
  useEffect(() => {
    if (ready.current) post({ type: 'SCRUB_PLAYHEAD', payload: { time: mode === 'TIME' ? time : scrollPct, mode } });
  }, [time, scrollPct, mode, post]);

  // iframe -> host
  useEffect(() => {
    const onMessage = (e: MessageEvent<IframeEvent>) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== location.origin) return;
      if (e.data.type === 'READY') {
        ready.current = true;
        const st = useEditor.getState();
        post({ type: 'SYNC_AST', payload: st.ast });
        post({ type: 'SET_SELECTION', payload: st.selectedId });
        post({ type: 'SCRUB_PLAYHEAD', payload: { time: st.mode === 'TIME' ? st.time : st.scrollPct, mode: st.mode } });
      } else if (e.data.type === 'NODE_CLICKED') {
        select(e.data.payload);
      } else if (e.data.type === 'SCROLL_MARKERS') {
        useEditor.getState().setMarkers(e.data.payload);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, select]);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-neutral-700 text-xs">
        {(Object.keys(DEVICES) as DeviceId[]).map(id => (
          <button key={id} onClick={() => setDevice(id)}
            className={`px-2 py-1 rounded ${device === id ? 'bg-[#3b82f6] text-white' : 'bg-[#2A2A2A] text-neutral-300'}`}>
            {DEVICES[id].label}
          </button>
        ))}
        <span className="text-neutral-500 tabular-nums">{d.w}×{d.h} · {Math.round(scale * 100)}%</span>
        <select aria-label="Zoom" className="ml-auto bg-[#2A2A2A] rounded px-1 py-1"
          value={zoom === 'fit' ? 'fit' : String(zoom)}
          onChange={e => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
          <option value="fit">Fit</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
        </select>
      </div>
      <div ref={area} className="flex-1 min-h-0 overflow-auto bg-[#141414] p-4">
        <div style={{ width: d.w * scale, height: d.h * scale, margin: '0 auto' }}>
          <iframe
            id="canvas-iframe" ref={frame} src="/renderer" title="Canvas"
            style={{ width: d.w, height: d.h, border: 0, background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
        </div>
      </div>
    </div>
  );
}
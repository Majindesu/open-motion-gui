import { useCallback, useEffect, useRef } from 'react';
import { useEditor } from '../services/Store';
import type { IframeEvent, PostMessageEvent } from '../types/Common';

/** Host side of the iframe bridge. `zoom` scales the iframe from outside, which is
 *  safe because the renderer measures layout in its own document. */
export default function Workspace({ zoom = 1 }: { zoom?: number }) {
  const ast = useEditor(s => s.ast);
  const selectedId = useEditor(s => s.selectedId);
  const select = useEditor(s => s.select);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);

  const post = useCallback((m: PostMessageEvent) => {
    frame.current?.contentWindow?.postMessage(m, location.origin);
  }, []);

  // AST -> iframe
  useEffect(() => { if (ready.current) post({ type: 'SYNC_AST', payload: ast }); }, [ast, post]);
  useEffect(() => { if (ready.current) post({ type: 'SET_SELECTION', payload: selectedId }); }, [selectedId, post]);

  // iframe -> host
  useEffect(() => {
    const onMessage = (e: MessageEvent<IframeEvent>) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== location.origin) return;
      if (e.data.type === 'READY') {
        ready.current = true;
        const { ast, selectedId } = useEditor.getState();
        post({ type: 'SYNC_AST', payload: ast });
        post({ type: 'SET_SELECTION', payload: selectedId });
      } else if (e.data.type === 'NODE_CLICKED') {
        select(e.data.payload);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, select]);

  return (
    <div className="flex-1 overflow-auto bg-[#141414]">
      <iframe
        id="canvas-iframe"
        ref={frame}
        src="/renderer"
        title="Canvas"
        style={{
          width: `${100 / zoom}%`, height: `${100 / zoom}%`, border: 0, background: '#fff',
          transform: `scale(${zoom})`, transformOrigin: 'top left',
        }}
      />
    </div>
  );
}
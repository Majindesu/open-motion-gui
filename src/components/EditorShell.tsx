import { useEffect, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent,
} from '@dnd-kit/core';
import { useEditor } from '../services/Store';
import { exportProject } from '../services/Exporter';
import LibraryPanel from './LibraryPanel';
import LayersPanel, { computeDrop, useDropHint } from './LayersPanel';
import { createNode } from '../utils/NodeFactory';
import Workspace from '../layout/Workspace';

function TopNavigationBar() {
  const { mode, setMode, undo, redo, ast } = useEditor();
  const tab = (m: 'TIME' | 'SCROLL') =>
    `px-3 py-1 rounded text-sm ${mode === m ? 'bg-[#3b82f6] text-white' : 'bg-[#2A2A2A] text-neutral-300'}`;
  return (
    <header className="flex items-center gap-3 px-3 h-11 border-b border-neutral-700 text-sm">
      <strong className="mr-2">GSAP Builder</strong>
      <button onClick={undo}>Undo</button>
      <button onClick={redo}>Redo</button>
      <div className="flex gap-1 mx-auto">
        <button className={tab('TIME')} onClick={() => setMode('TIME')}>TIME</button>
        <button className={tab('SCROLL')} onClick={() => setMode('SCROLL')}>SCROLL</button>
      </div>
      <button className="px-3 py-1 rounded bg-[#2A2A2A]" onClick={() => exportProject(ast)}>Export Code</button>
    </header>
  );
}

const LeftSidebar = () => (
  <aside id="left-sidebar" className="w-64 flex flex-col border-r border-neutral-700 min-h-0">
    <LibraryPanel />
    <LayersPanel />
  </aside>
);

const RightSidebar = () => (
  <aside id="inspector-panel" className="w-72 border-l border-neutral-700 p-3 text-sm text-neutral-500">
    Inspector (Design / Animate tabs) — phase 3
  </aside>
);

const BottomTimeline = () => {
  const mode = useEditor(s => s.mode);
  return (
    <footer id="timeline-panel" className="h-44 border-t border-neutral-700 p-3 text-sm text-neutral-500">
      Timeline ({mode === 'TIME' ? 'seconds' : 'scroll %'}) — phase 4
    </footer>
  );
};

export default function EditorShell() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const setHint = useDropHint(s => s.setHint);
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const hintFor = (e: Pick<DragEndEvent, 'active' | 'over'>) => {
    if (!e.over) return null;
    const h = computeDrop(String(e.over.id), useEditor.getState().ast, e.over.rect, e.active.rect.current.translated);
    return h && h.targetId === String(e.active.id) ? null : h; // can't drop onto itself
  };

  const onDragEnd = (e: DragEndEvent) => {
    const hint = hintFor(e);
    setHint(null); setDragLabel(null);
    if (!hint) return;
    const s = useEditor.getState();
    const id = String(e.active.id);
    if (id.startsWith('lib:')) {
      const node = createNode(e.active.data.current!.assetType);
      s.insertNode(node, hint);
      s.select(node.id);
    } else s.moveNode(id, hint);
  };

  // Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const { undo, redo } = useEditor.getState();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DndContext sensors={sensors}
      onDragStart={e => setDragLabel(String(e.active.id).startsWith('lib:') ? String(e.active.id).slice(4) : useEditor.getState().ast.find(n => n.id === e.active.id)?.name ?? '')}
      onDragMove={(e: DragMoveEvent) => setHint(hintFor(e))}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setHint(null); setDragLabel(null); }}>
      <div className="flex flex-col h-screen bg-[#1E1E1E] text-neutral-200">
        <TopNavigationBar />
        <div className="flex flex-1 min-h-0">
          <LeftSidebar />
          <Workspace />
          <RightSidebar />
        </div>
        <BottomTimeline />
      </div>
      <DragOverlay>
        {dragLabel && <div className="px-3 py-1 rounded bg-[#3b82f6] text-white text-sm shadow">{dragLabel}</div>}
      </DragOverlay>
    </DndContext>
  );
}
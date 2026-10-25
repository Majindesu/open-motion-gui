import { useDroppable, type ClientRect } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { create } from 'zustand';
import type { ASTNode } from '../types/Common';
import { useEditor, type Drop } from '../services/Store';

export const ROOT_ID = '__root__';

/** Live drop indicator, written by the shell during drags, read by rows. */
export const useDropHint = create<{ hint: Drop | null; setHint: (h: Drop | null) => void }>(set => ({
  hint: null,
  setHint: hint => set({ hint }),
}));
 
/** Pointer in the middle of a container row = nest; top/bottom half = sibling above/below. */
export function computeDrop(overId: string, ast: ASTNode[], over: ClientRect, active: ClientRect | null): Drop | null {
  if (overId === ROOT_ID) return { targetId: null, pos: 'after' };
  const t = ast.find(n => n.id === overId);
  if (!t) return null;
  const cy = active ? active.top + active.height / 2 : over.top + over.height / 2;
  const r = (cy - over.top) / over.height;
  if (t.type === 'CONTAINER' && r > 0.25 && r < 0.75) return { targetId: t.id, pos: 'inside' };
  return { targetId: t.id, pos: r < 0.5 ? 'before' : 'after' };
}
 
const flatten = (ast: ASTNode[], pid: string | null = null, depth = 0): { node: ASTNode; depth: number }[] =>
  ast.filter(n => n.parentId === pid).sort((a, b) => b.style.zIndex - a.style.zIndex) // front-most first
    .flatMap(n => [{ node: n, depth }, ...flatten(ast, n.id, depth + 1)]);
 
const noShift = () => null; // rows don't slide aside; the drop indicator shows the result instead
const ICON = { CONTAINER: '▭', TEXT: 'T', RASTER: '🖼', INLINE_SVG: '✦' } as const;
 
function Row({ node, depth }: { node: ASTNode; depth: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: node.id });
  const selected = useEditor(s => s.selectedId === node.id);
  const select = useEditor(s => s.select);
  const hint = useDropHint(s => (s.hint?.targetId === node.id ? s.hint.pos : null));
  const shadow = hint === 'before' ? 'inset 0 2px 0 #3b82f6' : hint === 'after' ? 'inset 0 -2px 0 #3b82f6'
    : hint === 'inside' ? 'inset 0 0 0 2px #3b82f6' : undefined;
 
  const remove = () => {
    useEditor.getState().removeNode(node.id);
    const s = useEditor.getState();
    if (!s.ast.some(n => n.id === s.selectedId)) s.select(null);
  };
 
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => select(node.id)}
      className={`flex items-center gap-2 py-1 pr-2 text-sm cursor-grab ${selected ? 'bg-[#2F4B7C]' : 'hover:bg-[#2A2A2A]'}`}
      style={{ paddingLeft: 8 + depth * 14, opacity: isDragging ? 0.4 : 1, boxShadow: shadow }}>
      <span className="w-4 text-center text-neutral-400">{ICON[node.type]}</span>
      <span className="flex-1 truncate">{node.name}</span>
      <span className="text-[10px] text-neutral-500">z{node.style.zIndex}</span>
      <button aria-label="Delete layer" className="text-neutral-500 hover:text-red-400"
        onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); remove(); }}>✕</button>
    </div>
  );
}
 
function RootZone() {
  const { setNodeRef } = useDroppable({ id: ROOT_ID });
  const active = useDropHint(s => s.hint?.targetId === null && s.hint.pos === 'after');
  const select = useEditor(s => s.select);
  return <div ref={setNodeRef} className="flex-1 min-h-[48px]" onClick={() => select(null)}
    style={{ boxShadow: active ? 'inset 0 2px 0 #3b82f6' : undefined }} />;
}
 
export default function LayersPanel() {
  const ast = useEditor(s => s.ast);
  const rows = flatten(ast);
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto">
      <div className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-neutral-500">Layers</div>
      <SortableContext items={rows.map(r => r.node.id)} strategy={noShift}>
        {rows.map(r => <Row key={r.node.id} node={r.node} depth={r.depth} />)}
      </SortableContext>
      <RootZone />
    </div>
  );
}
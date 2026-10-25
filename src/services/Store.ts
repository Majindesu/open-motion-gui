import { create } from 'zustand';
import type { ASTNode } from '../types/Common';

const MAX_HISTORY = 100;

export type DropPos = 'before' | 'after' | 'inside';
/** targetId null = project root. The layers list shows front-most (highest z) first,
 *  so 'before' means visually above = in front of the target. */
export interface Drop { targetId: string | null; pos: DropPos }

const byZ = (a: ASTNode[], pid: string | null) =>
  a.filter(n => n.parentId === pid).sort((x, y) => x.style.zIndex - y.style.zIndex);

/** Renumber one parent's children to zIndex 0..n-1, keeping their current order. */
const normalize = (a: ASTNode[], pid: string | null) => {
  const z = new Map(byZ(a, pid).map((n, i) => [n.id, i]));
  return a.map(n => (z.has(n.id) ? { ...n, style: { ...n.style, zIndex: z.get(n.id)! } } : n));
};

const isInside = (a: ASTNode[], id: string, ancestorId: string) => {
  for (let n = a.find(x => x.id === id); n?.parentId; n = a.find(x => x.id === n!.parentId))
    if (n.parentId === ancestorId) return true;
  return false;
};

/** Insert a new node or move an existing one, then renumber sibling z-indexes. */
const place = (a: ASTNode[], node: ASTNode, drop: Drop): ASTNode[] => {
  const rest = a.filter(n => n.id !== node.id);
  const t = rest.find(n => n.id === drop.targetId);
  const parentId = !t ? null : drop.pos === 'inside' ? t.id : t.parentId;
  const zIndex = drop.pos === 'inside' && t ? 1e9
    : !t ? (drop.pos === 'inside' ? 1e9 : -1)
    : t.style.zIndex + (drop.pos === 'before' ? 0.5 : -0.5);
  let out = normalize([...rest, { ...node, parentId, style: { ...node.style, zIndex } }], parentId);
  const old = a.find(n => n.id === node.id)?.parentId;
  if (old !== undefined && old !== parentId) out = normalize(out, old);
  return out;
};

type Patch = Partial<Omit<ASTNode, 'id' | 'style'>> & { style?: Partial<ASTNode['style']> };

interface EditorState {
  ast: ASTNode[];
  selectedId: string | null;
  past: ASTNode[][];
  future: ASTNode[][];
  pending: ASTNode[] | null; // snapshot taken before a live (slider) edit began

  select: (id: string | null) => void;
  mode: 'TIME' | 'SCROLL';
  setMode: (m: 'TIME' | 'SCROLL') => void;
  insertNode: (node: ASTNode, drop: Drop) => void;
  moveNode: (id: string, drop: Drop) => void;
  /** live=true: update the canvas without writing history (call commit() on mouse-up) */
  updateNode: (id: string, patch: Patch, live?: boolean) => void;
  removeNode: (id: string) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;
}

const demo: ASTNode[] = [
  {
    id: 'root', type: 'CONTAINER', parentId: null, name: 'Hero',
    style: { layout: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px', height: '100vh', zIndex: 0 },
    animations: [],
  },
  {
    id: 'title', type: 'TEXT', parentId: 'root', name: 'Title', content: 'Hello GSAP',
    style: { layout: 'block', padding: '16px', zIndex: 1 },
    animations: [{ id: 't1', trigger: 'ON_LOAD', duration: 1, delay: 0, ease: 'power2.out', properties: { x: 120 } }],
  },
];

export const useEditor = create<EditorState>()((set, get) => {
  /** Apply a change. Live changes skip history; committed changes push one undo step. */
  const mutate = (fn: (a: ASTNode[]) => ASTNode[], live = false) => {
    const { ast, pending, past } = get();
    const next = fn(ast);
    if (live) set({ ast: next, pending: pending ?? ast });
    else set({ ast: next, past: [...past, pending ?? ast].slice(-MAX_HISTORY), future: [], pending: null });
  };

  return {
    ast: demo, selectedId: null, past: [], future: [], pending: null,

    select: id => set({ selectedId: id }),
    mode: 'TIME',
    setMode: mode => set({ mode }),
    insertNode: (node, drop) => mutate(a => place(a, node, drop)),
    moveNode: (id, drop) => {
      const a = get().ast;
      const node = a.find(n => n.id === id);
      const t = a.find(n => n.id === drop.targetId);
      if (!node || (t && (t.id === id || isInside(a, t.id, id)))) return; // no-op / cycle
      mutate(list => place(list, node, drop));
    },
    updateNode: (id, patch, live = false) =>
      mutate(a => a.map(n => (n.id === id ? { ...n, ...patch, style: { ...n.style, ...patch.style } } : n)), live),
    removeNode: id =>
      mutate(a => {
        const doomed = new Set([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const n of a) if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) { doomed.add(n.id); grew = true; }
        }
        return a.filter(n => !doomed.has(n.id));
      }),

    commit: () => {
      const { pending, past } = get();
      if (pending) set({ past: [...past, pending].slice(-MAX_HISTORY), future: [], pending: null });
    },
    undo: () => {
      const { past, ast, future } = get();
      if (!past.length) return;
      set({ ast: past[past.length - 1], past: past.slice(0, -1), future: [ast, ...future], pending: null });
    },
    redo: () => {
      const { past, ast, future } = get();
      if (!future.length) return;
      set({ ast: future[0], past: [...past, ast], future: future.slice(1), pending: null });
    },
  };
});
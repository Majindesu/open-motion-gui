import DOMPurify from 'dompurify';
import type { AssetType, ASTNode } from '../types/Common';
import { useEditor } from '../services/Store';

const defaults: Record<AssetType, Pick<ASTNode, 'name' | 'style'> & Partial<ASTNode>> = {
  CONTAINER: { name: 'Container', style: { layout: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', zIndex: 0 } },
  TEXT: { name: 'Text', content: 'Edit me', style: { layout: 'block', zIndex: 0 } },
  RASTER: { name: 'Image', style: { layout: 'block', width: '200px', zIndex: 0 } },
  INLINE_SVG: { name: 'SVG', style: { layout: 'block', width: '120px', zIndex: 0 } },
};
 
export function createNode(type: AssetType, extra: Partial<ASTNode> = {}): ASTNode {
  return { id: crypto.randomUUID(), parentId: null, animations: [], type, ...defaults[type], ...extra };
}
 
/** SVG is sanitized once, at import, so the AST never holds unsafe markup. */
export const readSvg = async (file: File) =>
  DOMPurify.sanitize(await file.text(), { USE_PROFILES: { svg: true } });
 
/** Click-to-add: into the selected container, beside the selected leaf, or at root. */
export function addAtSelection(node: ASTNode) {
  const { ast, selectedId, insertNode, select } = useEditor.getState();
  const sel = ast.find(n => n.id === selectedId);
  const targetId = sel ? (sel.type === 'CONTAINER' ? sel.id : sel.parentId) : null;
  insertNode(node, { targetId, pos: 'inside' });
  select(node.id);
}
 
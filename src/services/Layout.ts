import type { CSSProperties } from 'react';
import type { ASTNode } from '../types/Common';

/** Single source of truth for layout: the editor canvas AND the exporter both call these,
 *  so a layer can't look different on the canvas than in the exported page. */
export const ROOT_CLASS = 'flex flex-col w-full min-h-screen';

export function nodeStyle(node: ASTNode): CSSProperties {
  const s = node.style;
  return {
    display: s.layout,
    justifyContent: s.justifyContent,
    alignItems: s.alignItems,
    padding: s.padding,
    width: s.width,
    height: s.height,
    background: s.background,
    color: s.color,
    fontSize: s.fontSize,
    position: 'relative',
    zIndex: s.zIndex,
    ...(node.animations.length ? { isolation: 'isolate' as const } : {}), // animated layers only, as exported
  };
}
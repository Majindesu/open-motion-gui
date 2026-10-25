export type AssetType = 'CONTAINER' | 'RASTER' | 'INLINE_SVG' | 'TEXT';

export interface GSAPTween {
  id: string;
  trigger: 'ON_LOAD' | 'ON_CLICK' | 'ON_HOVER' | 'ON_SCROLL';
  duration: number;
  delay: number;
  ease: string;
  from?: boolean; // gsap.from instead of gsap.to
  properties: Record<string, unknown>;
  scrollProps?: { start: string; end: string; scrub: boolean };
}

export interface ASTNode {
  id: string;
  type: AssetType;
  parentId: string | null;
  name: string;
  content?: string; // text, or DOMPurify-sanitized SVG
  src?: string;       // runtime URL; for uploaded images it is rebuilt from assetId on load
  assetId?: string;   // key into the IndexedDB asset store
  style: {
    layout: 'flex' | 'grid' | 'block';
    justifyContent?: string;
    alignItems?: string;
    padding?: string;
    width?: string;
    height?: string;
    zIndex: number;
    background?: string;
    color?: string;
    fontSize?: string;
  };
  animations: GSAPTween[];
}

export type PostMessageEvent =
  | { type: 'SYNC_AST'; payload: ASTNode[] }
  | { type: 'SET_SELECTION'; payload: string | null }
  | { type: 'SCRUB_PLAYHEAD'; payload: { time: number; mode: 'TIME' | 'SCROLL' } }
  | { type: 'UPDATE_SCROLL_MARKERS'; payload: unknown };

// Messages the iframe sends back to the host
export type IframeEvent =
  | { type: 'READY' }
  | { type: 'NODE_CLICKED'; payload: string | null }
  | { type: 'SCROLL_MARKERS'; payload: { tweenId: string; start: number; end: number }[] }; // % of max scroll
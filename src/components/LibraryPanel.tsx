import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { AssetType } from '../types/Common';
import { addAtSelection, createNode, readSvg } from '../utils/NodeFactory';
import { saveAsset } from '../utils/Assets';

const btn = 'w-full text-left px-3 py-2 rounded bg-[#2A2A2A] hover:bg-[#333] text-sm';

function Primitive({ type, label }: { type: AssetType; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lib:${type}`, data: { assetType: type } });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} className={btn} style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={() => addAtSelection(createNode(type))}>
      {label}
    </button>
  );
}

// Files can't be dragged from here (a file must be picked first), so these are click-to-upload.
function Upload({ type, label, accept }: { type: 'RASTER' | 'INLINE_SVG'; label: string; accept: string }) {
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (f?: File) => {
    if (!f) return;
    if (type === 'RASTER') {
      const { id, url } = await saveAsset(f, f.name); // persisted in IndexedDB
      addAtSelection(createNode(type, { name: f.name, src: url, assetId: id }));
    }
    else addAtSelection(createNode(type, { name: f.name, content: await readSvg(f) }));
  };
  return (
    <>
      <button className={btn} onClick={() => input.current?.click()}>{label}</button>
      <input ref={input} type="file" accept={accept} hidden
        onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}

export default function LibraryPanel() {
  return (
    <div className="p-3 space-y-2 border-b border-neutral-700">
      <div className="text-xs uppercase tracking-wide text-neutral-500">Library</div>
      <Primitive type="CONTAINER" label="▭  Container" />
      <Primitive type="TEXT" label="T  Text" />
      <Upload type="RASTER" label="🖼  Image…" accept="image/*" />
      <Upload type="INLINE_SVG" label="✦  SVG…" accept=".svg,image/svg+xml" />
    </div>
  );
}
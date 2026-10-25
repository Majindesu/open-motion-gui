import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import DOMPurify from 'dompurify';
import { useEditor } from './Store';
import { idbGet, idbPut } from '../utils/Db';
import { getAsset, MIME, putAssetRecord, resolveAssets } from '../utils/Assets';
import type { ASTNode } from '../types/Common';

const KEY = 'project';

/** Replace the whole project and clear history/playhead. */
const load = (ast: ASTNode[]) =>
  useEditor.setState({ ast, selectedId: null, past: [], future: [], pending: null, time: 0, scrollPct: 0, playing: false, markers: [] });

export async function hydrate() {
  try {
    const saved = await idbGet<{ ast: ASTNode[] }>('kv', KEY);
    if (saved && Array.isArray(saved.ast)) load(await resolveAssets(saved.ast));
  } catch (e) { console.warn('Could not restore the last project', e); }
}

/** Debounced autosave of the AST. Undo history is intentionally not persisted. */
export function startAutosave() {
  let timer: number | undefined;
  return useEditor.subscribe((s, prev) => {
    if (s.ast === prev.ast) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => idbPut('kv', KEY, { version: 1, ast: s.ast }).catch(console.warn), 400);
  });
}

export const newProject = () => load([]);

/** A project file is a zip: project.json + assets/<id>.<ext>. Plain zip so it's inspectable. */
export async function saveProjectFile() {
  const { ast } = useEditor.getState();
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify({ version: 1, ast }, null, 2));
  for (const id of new Set(ast.flatMap(n => (n.assetId ? [n.assetId] : [])))) {
    const rec = await getAsset(id);
    if (rec) zip.file(`assets/${id}.${rec.ext}`, rec.blob);
  }
  saveAs(await zip.generateAsync({ type: 'blob' }), 'project.gsapbuilder.zip');
}

const looksLikeNode = (n: any): n is ASTNode =>
  n && typeof n.id === 'string' && ['CONTAINER', 'RASTER', 'INLINE_SVG', 'TEXT'].includes(n.type)
  && n.style && typeof n.style.zIndex === 'number' && Array.isArray(n.animations);

export async function openProjectFile(file: File) {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file('project.json');
  if (!entry) throw new Error('Not a GSAP Builder project: project.json is missing.');
  const data = JSON.parse(await entry.async('string'));
  if (!Array.isArray(data.ast) || !data.ast.every(looksLikeNode)) throw new Error('Project file is corrupt or from an unsupported version.');

  for (const f of Object.values(zip.files)) {
    if (f.dir || !f.name.startsWith('assets/')) continue;
    const base = f.name.slice('assets/'.length);
    const dot = base.lastIndexOf('.');
    if (dot < 1) continue;
    const id = base.slice(0, dot), ext = base.slice(dot + 1).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    await putAssetRecord({ id, name: base, ext, type, blob: new Blob([await f.async('arraybuffer')], { type }) });
  }

  // A project file is untrusted input: sanitize SVG again before it can reach the canvas or an export.
  const ast = (data.ast as ASTNode[]).map(n =>
    n.type === 'INLINE_SVG' ? { ...n, content: DOMPurify.sanitize(n.content ?? '', { USE_PROFILES: { svg: true } }) } : n);
  load(await resolveAssets(ast));
}
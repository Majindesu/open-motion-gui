import { idbGet, idbPut } from './Db';
import type { ASTNode } from '../types/Common';

export interface AssetRecord { id: string; name: string; ext: string; type: string; blob: Blob }

const urls = new Map<string, string>(); // assetId -> blob: URL for this session

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()! : 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';

export const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
};

export const putAssetRecord = (rec: AssetRecord) => idbPut('assets', rec.id, rec);
export const getAsset = (id: string) => idbGet<AssetRecord>('assets', id);

/** Store an uploaded file in IndexedDB and return an id plus a URL usable right now. */
export async function saveAsset(file: Blob, name: string) {
  const id = crypto.randomUUID();
  await putAssetRecord({ id, name, ext: extOf(name), type: file.type, blob: file });
  const url = URL.createObjectURL(file);
  urls.set(id, url);
  return { id, url };
}

/** blob: URLs die with the page, so rebuild them from IndexedDB for every asset-backed node. */
export const resolveAssets = (ast: ASTNode[]) =>
  Promise.all(ast.map(async n => {
    if (!n.assetId) return n;
    let url = urls.get(n.assetId);
    if (!url) {
      const rec = await getAsset(n.assetId);
      if (!rec) return n; // asset missing: leave node as is
      url = URL.createObjectURL(rec.blob);
      urls.set(n.assetId, url);
    }
    return { ...n, src: url };
  }));
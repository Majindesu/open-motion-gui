let dbp: Promise<IDBDatabase> | null = null;

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('gsap-builder', 1);
  req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('assets'); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function run<T>(store: 'kv' | 'assets', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return (dbp ??= open()).then(db => new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const idbGet = <T,>(store: 'kv' | 'assets', key: string) => run<T | undefined>(store, 'readonly', s => s.get(key));
export const idbPut = (store: 'kv' | 'assets', key: string, value: unknown) => run(store, 'readwrite', s => s.put(value, key));
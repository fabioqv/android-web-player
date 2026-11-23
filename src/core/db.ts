const DB = 'player-db';
const KV = 'kv';
const MUSICAS = 'musicas';

export interface MusicaSalva {
  id: string;
  title: string;
  path: string;
  file: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(MUSICAS)) db.createObjectStore(MUSICAS, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveKV(key: string, value: unknown) {
  const db = await open();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadKV<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(KV).objectStore(KV).get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error);
  });
}

export async function putMusicas(rows: MusicaSalva[]) {
  const db = await open();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(MUSICAS, 'readwrite');
    const store = tx.objectStore(MUSICAS);
    rows.forEach((r) => store.put(r));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export async function allMusicas(): Promise<MusicaSalva[]> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(MUSICAS).objectStore(MUSICAS).getAll();
    r.onsuccess = () => res(r.result as MusicaSalva[]);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteMusica(id: string) {
  const db = await open();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(MUSICAS, 'readwrite');
    tx.objectStore(MUSICAS).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/**
 * Image assets live in IndexedDB, not in the recipe and not in localStorage.
 *
 * A recipe only carries `image "asset:abc123"` — a stable handle. The bytes stay
 * in this browser, which keeps the recipe small enough to paste, undo and sync
 * by hand, and keeps the studio working offline.
 */

export interface AssetRecord {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  createdAt: number;
  /** The prompt this image was made from, when the user kept one. */
  prompt?: string;
  /** Cached intrinsic size, so the media grid can reserve the right space. */
  naturalWidth?: number;
  naturalHeight?: number;
}

const DB_NAME = 'motiflow.assets.v1';
const STORE = 'files';

/** Private mode and some embedded webviews have no IndexedDB — degrade to memory. */
const memory = new Map<string, AssetRecord>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
          const req = run(store);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function putAsset(file: File): Promise<AssetRecord> {
  const record: AssetRecord = {
    id: newId(),
    name: file.name || 'image',
    type: file.type || 'image/png',
    blob: file,
    createdAt: Date.now(),
  };
  memory.set(record.id, record);
  await tx((store) => store.put(record));
  return record;
}

export async function deleteAsset(id: string): Promise<void> {
  memory.delete(id);
  await tx((store) => store.delete(id));
}

/**
 * Patches one record in place. Prompts and display names are editable after the
 * upload, and the blob is never rewritten on a rename.
 */
export async function updateAsset(id: string, patch: Partial<Omit<AssetRecord, 'id' | 'blob'>>): Promise<void> {
  const mem = memory.get(id);
  if (mem) memory.set(id, { ...mem, ...patch, id });

  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const read = store.get(id);
      read.onsuccess = () => {
        const current = read.result as AssetRecord | undefined;
        if (!current) {
          resolve();
          return;
        }
        const put = store.put({ ...current, ...patch, id });
        put.onsuccess = () => resolve();
        put.onerror = () => resolve();
      };
      read.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function listAssets(): Promise<AssetRecord[]> {
  const rows = (await tx<AssetRecord[]>((store) => store.getAll())) ?? [...memory.values()];
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Loads every asset and hands back a stable `id → object URL` map. */
export async function loadAssetUrls(): Promise<{ assets: AssetRecord[]; urls: Map<string, string> }> {
  const assets = await listAssets();
  const urls = new Map<string, string>();
  for (const asset of assets) {
    // Memory-only records hold the original File, so this works in both modes.
    urls.set(asset.id, URL.createObjectURL(asset.blob));
  }
  return { assets, urls };
}

/* ------------------------------ image decoding ---------------------------- */

const imageCache = new Map<string, HTMLImageElement>();

/**
 * Decodes once per URL and calls back when a new image becomes drawable, so the
 * studio can repaint the frame that was waiting on it.
 */
export function resolveImageUrl(url: string, onLoad?: () => void): HTMLImageElement {
  const cached = imageCache.get(url);
  if (cached) return cached;

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => onLoad?.();
  img.onerror = () => onLoad?.();
  img.src = url;
  imageCache.set(url, img);
  return img;
}

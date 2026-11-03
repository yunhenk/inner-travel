import type { CorridorData } from '@inner/scene-gen';

const DB_NAME = 'meridian-drift';
const STORE = 'corridor-cache';
const VERSION = 1;

interface CacheRecord {
  data: CorridorData;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB 不可用'));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
  });
  return dbPromise;
}

async function read(key: string): Promise<CorridorData | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const record = request.result as CacheRecord | undefined;
        resolve(record?.data ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function write(key: string, data: CorridorData): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const record: CacheRecord = { data, savedAt: Date.now() };
      transaction.objectStore(STORE).put(record, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // 缓存失败不影响场景
  }
}

export { read as readCorridorCache, write as writeCorridorCache };

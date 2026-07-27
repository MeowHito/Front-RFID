// Template lists (E-Slip 2, Check BIB 2, …) embed images as base64 data URLs
// and used to live in localStorage, whose ~5-10MB per-origin quota fills up
// fast once a few templates pile up. IndexedDB has no such practical cap, so
// everything lives here instead — same key-based API, just async.

const DB_NAME = 'rfid-templates';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                req.result.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbGet<T>(key: string): Promise<T | undefined> {
    return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
    }));
}

function idbSet(key: string, value: unknown): Promise<void> {
    return openDb().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

/**
 * Loads a template list from IndexedDB. On first read (nothing under `key`
 * yet), it one-time-migrates any legacy list from localStorage — where these
 * used to be saved — and clears the old key so it isn't read twice.
 */
export async function loadTemplateList<T>(key: string): Promise<T[]> {
    if (typeof window === 'undefined') return [];
    try {
        const existing = await idbGet<T[]>(key);
        if (existing !== undefined) return Array.isArray(existing) ? existing : [];
    } catch {
        return [];
    }
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const arr = JSON.parse(raw);
            const list: T[] = Array.isArray(arr) ? arr : [];
            await idbSet(key, list);
            localStorage.removeItem(key);
            return list;
        }
    } catch { /* corrupt legacy data — start fresh */ }
    return [];
}

/** Returns true if the list was actually written to IndexedDB. */
export async function persistTemplateList<T>(key: string, list: T[]): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        await idbSet(key, list);
        return true;
    } catch {
        return false;
    }
}

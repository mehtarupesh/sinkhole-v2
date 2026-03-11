/**
 * Transient IDB store for a single incoming Share Target payload.
 * Written by the service worker, read+cleared by the app on next load.
 * Uses a separate DB so it never interferes with the units store.
 */

const DB_NAME = 'sinkhole-pending';
const STORE = 'share';
const KEY = 'current';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function writePendingShare(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = store.put(data, KEY);
    req.onsuccess = () => resolve();
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function readPendingShare() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const req = store.get(KEY);
    req.onsuccess = ({ target: { result } }) => resolve(result ?? null);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function clearPendingShare() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = store.delete(KEY);
    req.onsuccess = () => resolve();
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

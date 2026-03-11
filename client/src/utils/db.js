const DB_NAME = 'sinkhole-db';
const DB_VERSION = 1;
const STORE_UNITS = 'units';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(STORE_UNITS)) {
        db.createObjectStore(STORE_UNITS, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function addUnit(unit) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_UNITS, 'readwrite').objectStore(STORE_UNITS);
    const req = store.add({ ...unit, createdAt: Date.now() });
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function getAllUnits() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_UNITS, 'readonly').objectStore(STORE_UNITS);
    const req = store.getAll();
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function updateUnit(id, changes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_UNITS, 'readwrite').objectStore(STORE_UNITS);
    const getReq = store.get(id);
    getReq.onsuccess = ({ target: { result: existing } }) => {
      if (!existing) { reject(new Error('Unit not found')); return; }
      const updated = { ...existing, ...changes, updatedAt: Date.now() };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = ({ target: { error } }) => reject(error);
    };
    getReq.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function deleteUnit(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_UNITS, 'readwrite').objectStore(STORE_UNITS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

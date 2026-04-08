const DB_NAME = 'sinkhole-db';
const DB_VERSION = 3;
const STORE_UNITS = 'units';
const STORE_SETTINGS = 'settings';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(STORE_UNITS)) {
        db.createObjectStore(STORE_UNITS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

function generateUid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function addUnit(unit) {
  const db = await openDB();
  const uid = generateUid();
  const record = { uid, ...unit, createdAt: Date.now() };
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_UNITS, 'readwrite').objectStore(STORE_UNITS);
    const req = store.add(record);
    req.onsuccess = ({ target: { result: id } }) => resolve({ id, uid });
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

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_SETTINGS, 'readonly').objectStore(STORE_SETTINGS);
    const req = store.get(key);
    req.onsuccess = ({ target: { result } }) => resolve(result?.value ?? null);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_SETTINGS, 'readwrite').objectStore(STORE_SETTINGS);
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

// ── Access order (device-local LRU list) ──────────────────────────────────────

export async function touchUnit(uid) {
  const order = (await getSetting('accessOrder')) ?? [];
  await setSetting('accessOrder', [{ uid, t: Date.now() }, ...order.filter((u) => u.uid !== uid)]);
}

export async function getAccessOrder() {
  return (await getSetting('accessOrder')) ?? [];
}

/**
 * Merges an incoming accessOrder from a peer.
 * Per-uid, keeps the highest timestamp (most recent access wins), then re-sorts.
 */
export async function mergeAccessOrder(incoming) {
  if (!incoming?.length) return;
  const local = (await getSetting('accessOrder')) ?? [];
  const best = new Map();
  for (const { uid, t } of [...local, ...incoming]) {
    if (!uid) continue;
    if (!best.has(uid) || t > best.get(uid)) best.set(uid, t);
  }
  const sorted = Array.from(best.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([uid, t]) => ({ uid, t }));
  await setSetting('accessOrder', sorted);
}

export async function deleteSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_SETTINGS, 'readwrite').objectStore(STORE_SETTINGS);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

export async function getAllSettings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_SETTINGS, 'readonly').objectStore(STORE_SETTINGS);
    const req = store.getAll();
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

// ── Categorization ────────────────────────────────────────────────────────────

/** Returns stored groups [{ id, title }] or null if none saved. */
export async function getCategorization() {
  return getSetting('categorization');
}

/** Overwrites the stored groups (single slot — always latest). */
export async function setCategorization(groups) {
  return setSetting('categorization', groups);
}

/**
 * Merges categorization metadata [{ id, title }] from a peer or import file.
 * - Same title → remap peer's id to local id (title is cross-device identity).
 * - Unknown title → add as new category.
 *
 * Returns idRemap { peerId: localId } so callers can remap unit.categoryId before inserting.
 */
export async function mergeCategorization(importedGroups) {
  if (!importedGroups?.length) return {};
  const existing = (await getCategorization()) ?? [];

  // id is the stable cross-device identity; title can change (rename).
  const localById   = new Map(existing.map((g, i) => [g.id, i]));   // id → index
  const titleToId   = {};
  for (const g of existing) titleToId[g.title.toLowerCase()] = g.id;

  const idRemap = {};
  let changed = false;

  for (const { id, title, updatedAt } of importedGroups) {
    if (!id || !title) continue;

    if (localById.has(id)) {
      // Same category — apply rename only if peer's version is newer (LWW).
      const idx      = localById.get(id);
      const localTs  = existing[idx].updatedAt ?? 0;
      const peerTs   = updatedAt ?? 0;
      if (existing[idx].title !== title && peerTs > localTs) {
        delete titleToId[existing[idx].title.toLowerCase()];
        existing[idx] = { ...existing[idx], title, updatedAt: peerTs };
        titleToId[title.toLowerCase()] = id;
        changed = true;
      }
    } else {
      const localId = titleToId[title.toLowerCase()];
      if (localId) {
        // Same title, different id → cross-device dedup; remap peer id → local id.
        if (id !== localId) idRemap[id] = localId;
      } else {
        // Brand-new category.
        const entry = { id, title, updatedAt: updatedAt ?? 0 };
        existing.push(entry);
        localById.set(id, existing.length - 1);
        titleToId[title.toLowerCase()] = id;
        changed = true;
      }
    }
  }

  if (changed) await setCategorization(existing);
  return idRemap;
}


/** Ensures the Trash category exists in storedGroups. Returns the (possibly updated) groups array. */
export async function ensureTrashCategory() {
  const groups = (await getCategorization()) ?? [];
  if (groups.some((g) => g.id === 'trash')) return groups;
  const updated = [...groups, { id: 'trash', title: 'Trash', updatedAt: Date.now() }];
  await setCategorization(updated);
  return updated;
}

/** Hard-deletes all units in Trash. Returns the count of deleted units. */
export async function emptyTrash() {
  const all = await getAllUnits();
  const trashUnits = all.filter((u) => u.categoryId === 'trash');
  for (const u of trashUnits) await deleteUnit(u.id);
  return trashUnits.length;
}

export async function dumpDB() {
  const [units, settings] = await Promise.all([getAllUnits(), getAllSettings()]);
  return { version: DB_VERSION, exportedAt: Date.now(), units, settings };
}

/**
 * Merges units from a peer or import file into the local store.
 * - New units (unknown uid) are inserted.
 * - Existing units are updated if incoming is newer (last-write-wins on updatedAt ?? createdAt).
 * - idRemap remaps peer categoryIds to local ids where titles matched.
 *
 * @returns {{ added: number, updated: number }}
 */
export async function mergeUnits(incoming, idRemap = {}) {
  const existing = await getAllUnits();
  const localByUid = new Map(existing.filter((u) => u.uid).map((u) => [u.uid, u]));

  const db = await openDB();
  let added = 0;
  let updated = 0;

  for (const unit of incoming) {
    if (!unit.uid) continue;
    const { id: _localId, ...rest } = unit;
    if (rest.categoryId && idRemap[rest.categoryId]) {
      rest.categoryId = idRemap[rest.categoryId];
    }

    const incomingTs = unit.updatedAt ?? unit.createdAt ?? 0;
    const local = localByUid.get(unit.uid);
    if (!local) {
      await new Promise((resolve, reject) => {
        const store = db.transaction(STORE_UNITS, 'readwrite').objectStore(STORE_UNITS);
        const req = store.add(rest);
        req.onsuccess = () => resolve();
        req.onerror = ({ target: { error } }) => reject(error);
      });
      localByUid.set(unit.uid, rest);
      added++;
    } else {
      const localTs = local.updatedAt ?? local.createdAt ?? 0;
      if (incomingTs > localTs) {
        await new Promise((resolve, reject) => {
          const store = db.transaction(STORE_UNITS, 'readwrite').objectStore(STORE_UNITS);
          const req = store.put({ ...rest, id: local.id });
          req.onsuccess = () => resolve();
          req.onerror = ({ target: { error } }) => reject(error);
        });
        updated++;
      }
    }
  }

  return { added, updated };
}

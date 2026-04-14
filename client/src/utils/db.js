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
 * Returns a new accessOrder containing only entries whose uid exists in units.
 * Pure — does not write to IDB. Callers should persist the result if it changed.
 */
export function pruneAccessOrder(accessOrder, units) {
  if (!units || units.length === 0) return [];
  const liveUids = new Set(units.map((u) => u.uid).filter(Boolean));
  return accessOrder.filter((e) => liveUids.has(e.uid));
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

// ── Known peers ───────────────────────────────────────────────────────────────

export async function getKnownPeers() {
  return (await getSetting('knownPeers')) ?? [];
}

export async function saveKnownPeer(hostId) {
  const peers = await getKnownPeers();
  const idx = peers.findIndex((p) => p.hostId === hostId);
  const entry = { hostId, lastSeen: Date.now() };
  if (idx >= 0) peers[idx] = entry; else peers.push(entry);
  await setSetting('knownPeers', peers.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 10));
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

// ── Synthesis cache ───────────────────────────────────────────────────────────

export async function getSynthesisCache() {
  return (await getSetting('synthesis_cache')) ?? {};
}

export async function setSynthesisCacheEntry(categoryId, { question, answer, computedAt, unitCount }) {
  const cache = await getSynthesisCache();
  cache[categoryId] = { question, answer, computedAt, unitCount };
  await setSetting('synthesis_cache', cache);
}

export async function deleteSynthesisCacheEntry(categoryId) {
  const cache = await getSynthesisCache();
  delete cache[categoryId];
  await setSetting('synthesis_cache', cache);
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

// ── Tombstones ────────────────────────────────────────────────────────────────
// Hard-deleted units are remembered as tombstones for this long so peers don't
// resurrect them on next sync. Set to at least 2× the max expected sync gap.
export const TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

async function addTombstones(uids) {
  const now = Date.now();
  const uidSet = new Set(uids.filter(Boolean));
  const [existing, accessOrder] = await Promise.all([getSetting('tombstones'), getSetting('accessOrder')]);
  const existingTombstones = existing ?? [];
  const existingUids = new Set(existingTombstones.map((t) => t.uid));
  const fresh = [...uidSet].filter((uid) => !existingUids.has(uid)).map((uid) => ({ uid, deletedAt: now }));
  const pruned = [...existingTombstones, ...fresh].filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS);
  const cleanedAccessOrder = (accessOrder ?? []).filter((e) => !uidSet.has(e.uid));
  await Promise.all([setSetting('tombstones', pruned), setSetting('accessOrder', cleanedAccessOrder)]);
}

export async function getTombstones() {
  return (await getSetting('tombstones')) ?? [];
}

/**
 * Returns an empty array when the vault is completely empty — tombstones serve
 * no purpose if there are no units to protect against resurrection.
 * Pure — does not write to IDB. Callers should persist the result if it changed.
 */
export function pruneTombstones(tombstones, units) {
  if (!units || units.length === 0) return [];
  return tombstones;
}

/**
 * Merges tombstones from a peer. For each tombstoned uid, deletes the local unit
 * if the tombstone is newer than the unit's last-modified timestamp (LWW).
 * GCs entries older than TOMBSTONE_TTL_MS.
 *
 * @returns {Set<string>} Active tombstone uids after merge (use to filter incoming units).
 */
export async function mergeTombstones(incoming) {
  if (!incoming?.length) return new Set((await getTombstones()).map((t) => t.uid));
  const now = Date.now();
  const local = (await getSetting('tombstones')) ?? [];

  // Merge: per uid, keep highest deletedAt
  const best = new Map();
  for (const { uid, deletedAt } of [...local, ...incoming]) {
    if (!uid) continue;
    if (!best.has(uid) || deletedAt > best.get(uid)) best.set(uid, deletedAt);
  }

  // Apply deletes: tombstone wins over unit unless unit was edited after deletion
  const [units, accessOrder] = await Promise.all([getAllUnits(), getSetting('accessOrder')]);
  const localByUid = new Map(units.filter((u) => u.uid).map((u) => [u.uid, u]));
  const deletedUids = new Set();
  for (const [uid, deletedAt] of best) {
    const unit = localByUid.get(uid);
    if (!unit) continue;
    const unitTs = unit.updatedAt ?? unit.createdAt ?? 0;
    if (deletedAt > unitTs) { await deleteUnit(unit.id); deletedUids.add(uid); }
  }

  // GC expired tombstones, strip deleted uids from accessOrder, persist both
  const pruned = Array.from(best.entries())
    .filter(([, deletedAt]) => now - deletedAt < TOMBSTONE_TTL_MS)
    .map(([uid, deletedAt]) => ({ uid, deletedAt }));
  if (deletedUids.size > 0) {
    const cleanedAccessOrder = (accessOrder ?? []).filter((e) => !deletedUids.has(e.uid));
    await Promise.all([setSetting('tombstones', pruned), setSetting('accessOrder', cleanedAccessOrder)]);
  } else {
    await setSetting('tombstones', pruned);
  }

  return new Set(pruned.map((t) => t.uid));
}

/** Hard-deletes a single unit from Trash, recording a tombstone for sync. */
export async function deleteTrashUnit(unit) {
  if (unit.uid) await addTombstones([unit.uid]);
  await deleteUnit(unit.id);
}

/** Hard-deletes all units in Trash, recording tombstones for sync. Returns the count deleted. */
export async function emptyTrash() {
  const all = await getAllUnits();
  const trashUnits = all.filter((u) => u.categoryId === 'trash');
  if (trashUnits.length === 0) return 0;
  await addTombstones(trashUnits.map((u) => u.uid).filter(Boolean));
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

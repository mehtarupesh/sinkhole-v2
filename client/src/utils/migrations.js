import { getSetting, setSetting, getAllUnits, getCategorization, setCategorization } from './db';

// ── Migration registry ────────────────────────────────────────────────────────
// Add new migration functions here in order. Never reorder or remove entries.

const migrations = [
  migration_0_categoriesToUnitField,
  migration_1_deduplicateCategoriesByTitle,
  migration_2_bootstrapAccessOrder,
  migration_3_accessOrderToObjects,
];

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runMigrations() {
  const version = await getSetting('data_migration_version') ?? -1;
  if (version >= migrations.length - 1) return;

  for (let i = version + 1; i < migrations.length; i++) {
    await migrations[i]();
    await setSetting('data_migration_version', i);
  }
}

// ── Migration 0 — stamp categoryId onto units ─────────────────────────────────
// Old schema: categories stored as [{ id, title, uids: string[] }] in settings.
// New schema: unit.categoryId = category id; categories stored as [{ id, title }].

async function migration_0_categoriesToUnitField() {
  const groups = await getCategorization();
  if (!groups?.length) return;

  // Check if already migrated (no uids arrays present)
  const needsMigration = groups.some((g) => g.uids?.length > 0);
  if (!needsMigration) return;

  // Build uid → categoryId map
  const uidToCategory = {};
  for (const g of groups) {
    for (const uid of (g.uids ?? [])) {
      uidToCategory[uid] = g.id;
    }
  }

  // Stamp categoryId onto each unit that appears in a group
  const db = await openDBForMigration();
  const units = await getAllUnitsForMigration(db);

  for (const unit of units) {
    const categoryId = unit.uid ? uidToCategory[unit.uid] : undefined;
    if (!categoryId || unit.categoryId) continue; // already set or not categorized
    await updateUnitCategoryId(db, unit.id, categoryId);
  }

  // Save stripped categories (no uids)
  const stripped = groups.map(({ id, title }) => ({ id, title }));
  await setCategorization(stripped);
}

// ── Migration 1 — deduplicate categories by title ─────────────────────────────
// After a P2P sync with the old schema, the same category could land with
// different IDs on each device (old mergeCategorization used generateUid()).
// This finds duplicate titles, picks the ID with the most units as the winner,
// and rewires all units pointing to deprecated IDs.

async function migration_1_deduplicateCategoriesByTitle() {
  const [groups, units] = await Promise.all([getCategorization(), getAllUnits()]);
  if (!groups?.length) return;

  // Count units per category id
  const countById = {};
  for (const u of units) {
    if (u.categoryId) countById[u.categoryId] = (countById[u.categoryId] ?? 0) + 1;
  }

  // Group categories by lowercase title
  const byTitle = {};
  for (const g of groups) {
    const key = g.title.toLowerCase();
    (byTitle[key] ??= []).push(g);
  }

  // Build idRemap: deprecated id → surviving id
  const idRemap = {};
  const survivorIds = new Set();

  for (const dupes of Object.values(byTitle)) {
    if (dupes.length === 1) { survivorIds.add(dupes[0].id); continue; }
    // Most units wins; tie-break by first occurrence (stable sort)
    dupes.sort((a, b) => (countById[b.id] ?? 0) - (countById[a.id] ?? 0));
    survivorIds.add(dupes[0].id);
    for (let i = 1; i < dupes.length; i++) {
      idRemap[dupes[i].id] = dupes[0].id;
    }
  }

  if (!Object.keys(idRemap).length) return; // no duplicates, nothing to do

  // Rewire units pointing to deprecated ids
  const db = await openDBForMigration();
  for (const unit of units) {
    if (unit.categoryId && idRemap[unit.categoryId]) {
      await updateUnitCategoryId(db, unit.id, idRemap[unit.categoryId]);
    }
  }

  // Drop deprecated categories
  await setCategorization(groups.filter((g) => survivorIds.has(g.id)));
}

// ── Migration 2 — bootstrap access order from createdAt ──────────────────────
// accessOrder didn't exist before. Seed it with all unit UIDs sorted by
// createdAt descending — best proxy for access order when no history exists.

async function migration_2_bootstrapAccessOrder() {
  if (await getSetting('accessOrder')) return;
  const units = await getAllUnits();
  const order = units
    .filter((u) => u.uid)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .map((u) => u.uid);
  await setSetting('accessOrder', order);
}

// ── Migration 3 — convert accessOrder from string[] to {uid,t}[] ─────────────
// Migration 2 was briefly shipped with bare uid strings. Convert any existing
// string entries to objects, using the unit's createdAt as the timestamp.

async function migration_3_accessOrderToObjects() {
  const order = await getSetting('accessOrder');
  if (!order?.length) return;
  if (typeof order[0] === 'object') return; // already in new shape

  const units = await getAllUnits();
  const createdAtByUid = new Map(units.filter((u) => u.uid).map((u) => [u.uid, u.createdAt ?? 0]));
  const converted = order.map((uid) => ({ uid, t: createdAtByUid.get(uid) ?? 0 }));
  await setSetting('accessOrder', converted);
}

// ── IDB helpers scoped to migration (avoid circular openDB calls) ─────────────

function openDBForMigration() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('sinkhole-db');
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

function getAllUnitsForMigration(db) {
  return new Promise((resolve, reject) => {
    const store = db.transaction('units', 'readonly').objectStore('units');
    const req = store.getAll();
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

function updateUnitCategoryId(db, id, categoryId) {
  return new Promise((resolve, reject) => {
    const store = db.transaction('units', 'readwrite').objectStore('units');
    const getReq = store.get(id);
    getReq.onsuccess = ({ target: { result: unit } }) => {
      if (!unit) { resolve(); return; }
      const putReq = store.put({ ...unit, categoryId });
      putReq.onsuccess = () => resolve();
      putReq.onerror = ({ target: { error } }) => reject(error);
    };
    getReq.onerror = ({ target: { error } }) => reject(error);
  });
}

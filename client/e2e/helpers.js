/**
 * Shared helpers for E2E tests.
 */

const HOST_ID_KEY = 'sinkhole-host-id';
const UNITS_DB = 'sinkhole-db';
const UNITS_STORE = 'units';
const PENDING_DB = 'sinkhole-pending';
const PENDING_STORE = 'share';

/**
 * Injects a deterministic peer ID into localStorage before page navigation.
 * Must be called before page.goto().
 */
async function setHostId(page, id) {
  await page.addInitScript(
    ({ key, id }) => localStorage.setItem(key, id),
    { key: HOST_ID_KEY, id },
  );
}

/**
 * Seeds a unit directly into IndexedDB. Call after page.goto() so the DB exists.
 */
async function seedUnit(page, unit) {
  await page.evaluate(({ dbName, storeName, unit }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 2);
      req.onupgradeneeded = ({ target: { result: db } }) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = ({ target: { result: db } }) => {
        const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
        const r = store.add(unit);
        r.onsuccess = () => resolve();
        r.onerror = ({ target: { error } }) => reject(error);
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
  }, { dbName: UNITS_DB, storeName: UNITS_STORE, unit });
}

/**
 * Seeds a pending share entry so Landing.jsx picks it up via ?pendingShare=1.
 */
async function seedPendingShare(page, share) {
  await page.evaluate(({ dbName, storeName, share }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = ({ target: { result: db } }) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      req.onsuccess = ({ target: { result: db } }) => {
        const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
        const r = store.put(share, 'current');
        r.onsuccess = () => resolve();
        r.onerror = ({ target: { error } }) => reject(error);
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
  }, { dbName: PENDING_DB, storeName: PENDING_STORE, share });
}

/** Opens the saved-units overlay from the landing page. */
async function openUnitsList(page) {
  await page.getByRole('button', { name: 'Saved' }).click();
  await page.waitForSelector('.units-panel');
}

module.exports = { setHostId, seedUnit, seedPendingShare, openUnitsList };

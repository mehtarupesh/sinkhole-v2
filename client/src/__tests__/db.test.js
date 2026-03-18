import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addUnit, getAllUnits, deleteUnit, updateUnit, mergeUnits, getAllSettings, dumpDB, setSetting } from '../utils/db';

// ── Minimal in-memory IndexedDB mock ─────────────────────────────────────────

function createMockDB() {
  const units = { data: new Map(), nextId: 1 };
  const settings = { data: new Map() };

  function mockObjectStore(name) {
    if (name === 'settings') {
      return {
        put(record) {
          settings.data.set(record.key, record);
          const req = {};
          Promise.resolve().then(() => req.onsuccess?.());
          return req;
        },
        get(key) {
          const req = {};
          Promise.resolve().then(() => req.onsuccess?.({ target: { result: settings.data.get(key) } }));
          return req;
        },
        getAll() {
          const req = {};
          Promise.resolve().then(() =>
            req.onsuccess?.({ target: { result: [...settings.data.values()] } })
          );
          return req;
        },
        delete(key) {
          settings.data.delete(key);
          const req = {};
          Promise.resolve().then(() => req.onsuccess?.());
          return req;
        },
      };
    }
    // units store
    return {
      add(record) {
        const id = units.nextId++;
        units.data.set(id, { ...record, id });
        const req = {};
        Promise.resolve().then(() => req.onsuccess?.({ target: { result: id } }));
        return req;
      },
      get(id) {
        const req = {};
        Promise.resolve().then(() => req.onsuccess?.({ target: { result: units.data.get(id) } }));
        return req;
      },
      put(record) {
        units.data.set(record.id, record);
        const req = {};
        Promise.resolve().then(() => req.onsuccess?.());
        return req;
      },
      getAll() {
        const req = {};
        Promise.resolve().then(() =>
          req.onsuccess?.({ target: { result: [...units.data.values()] } })
        );
        return req;
      },
      delete(id) {
        units.data.delete(id);
        const req = {};
        Promise.resolve().then(() => req.onsuccess?.());
        return req;
      },
    };
  }

  return {
    _store: units, // backward compat
    _settings: settings,
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(),
    transaction: (_name, _mode) => ({ objectStore: (storeName) => mockObjectStore(storeName) }),
  };
}

function setupMockIndexedDB() {
  const db = createMockDB();
  global.indexedDB = {
    open: () => {
      const req = {};
      Promise.resolve().then(() => {
        req.onupgradeneeded?.({ target: { result: db } });
        req.onsuccess?.({ target: { result: db } });
      });
      return req;
    },
  };
  return db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('db', () => {
  let mockDB;

  beforeEach(() => {
    mockDB = setupMockIndexedDB();
  });

  describe('addUnit', () => {
    it('stores a unit and returns its generated id', async () => {
      const id = await addUnit({ type: 'snippet', content: 'hello' });
      expect(typeof id).toBe('number');
    });

    it('generates a uid for each new unit', async () => {
      const id = await addUnit({ type: 'snippet', content: 'hello' });
      const item = mockDB._store.data.get(id);
      expect(typeof item.uid).toBe('string');
      expect(item.uid.length).toBeGreaterThan(0);
    });

    it('generates unique uids across units', async () => {
      const id1 = await addUnit({ type: 'snippet', content: 'a' });
      const id2 = await addUnit({ type: 'snippet', content: 'b' });
      expect(mockDB._store.data.get(id1).uid).not.toBe(mockDB._store.data.get(id2).uid);
    });

    it('persists the unit data', async () => {
      await addUnit({ type: 'snippet', content: 'world' });
      const items = [...mockDB._store.data.values()];
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('world');
      expect(items[0].type).toBe('snippet');
    });

    it('stamps createdAt automatically', async () => {
      const before = Date.now();
      await addUnit({ type: 'password', content: 'secret' });
      const after = Date.now();
      const item = [...mockDB._store.data.values()][0];
      expect(item.createdAt).toBeGreaterThanOrEqual(before);
      expect(item.createdAt).toBeLessThanOrEqual(after);
    });

    it('stores optional fields when provided', async () => {
      await addUnit({ type: 'image', content: 'data:...', fileName: 'pic.png', mimeType: 'image/png', quote: 'A photo' });
      const item = [...mockDB._store.data.values()][0];
      expect(item.fileName).toBe('pic.png');
      expect(item.mimeType).toBe('image/png');
      expect(item.quote).toBe('A photo');
    });
  });

  describe('getAllUnits', () => {
    it('returns an empty array when no units exist', async () => {
      const units = await getAllUnits();
      expect(units).toEqual([]);
    });

    it('returns all stored units', async () => {
      await addUnit({ type: 'snippet', content: 'one' });
      await addUnit({ type: 'password', content: 'two' });
      const units = await getAllUnits();
      expect(units).toHaveLength(2);
    });
  });

  describe('updateUnit', () => {
    it('merges changes into the existing unit', async () => {
      const id = await addUnit({ type: 'snippet', content: 'original' });
      const updated = await updateUnit(id, { content: 'changed' });
      expect(updated.content).toBe('changed');
      expect(updated.type).toBe('snippet');
    });

    it('preserves unchanged fields', async () => {
      const id = await addUnit({ type: 'snippet', content: 'text', quote: 'note' });
      await updateUnit(id, { content: 'new text' });
      const item = mockDB._store.data.get(id);
      expect(item.quote).toBe('note');
    });

    it('stamps updatedAt', async () => {
      const before = Date.now();
      const id = await addUnit({ type: 'snippet', content: 'text' });
      const updated = await updateUnit(id, { content: 'changed' });
      const after = Date.now();
      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt).toBeLessThanOrEqual(after);
    });

    it('rejects when the unit does not exist', async () => {
      await expect(updateUnit(999, { content: 'x' })).rejects.toThrow('Unit not found');
    });
  });

  describe('deleteUnit', () => {
    it('removes the unit from the store', async () => {
      const id = await addUnit({ type: 'snippet', content: 'to delete' });
      expect(mockDB._store.data.has(id)).toBe(true);
      await deleteUnit(id);
      expect(mockDB._store.data.has(id)).toBe(false);
    });
  });

  describe('mergeUnits', () => {
    it('inserts units not already present by uid', async () => {
      const added = await mergeUnits([
        { uid: 'abc-123', type: 'snippet', content: 'from peer', createdAt: Date.now() },
      ]);
      expect(added).toBe(1);
      const all = await getAllUnits();
      expect(all).toHaveLength(1);
      expect(all[0].content).toBe('from peer');
    });

    it('skips units whose uid already exists locally', async () => {
      const id = await addUnit({ type: 'snippet', content: 'local' });
      const { uid } = mockDB._store.data.get(id);

      const added = await mergeUnits([
        { uid, type: 'snippet', content: 'duplicate from peer', createdAt: Date.now() },
      ]);
      expect(added).toBe(0);
      const all = await getAllUnits();
      expect(all).toHaveLength(1);
      expect(all[0].content).toBe('local');
    });

    it('skips units without a uid', async () => {
      const added = await mergeUnits([
        { type: 'snippet', content: 'no uid', createdAt: Date.now() },
      ]);
      expect(added).toBe(0);
    });

    it("strips the peer's local id, assigns a new one", async () => {
      await mergeUnits([
        { uid: 'xyz-999', id: 999, type: 'snippet', content: 'peer item', createdAt: Date.now() },
      ]);
      const all = await getAllUnits();
      expect(all[0].id).not.toBe(999);
    });

    it('preserves original createdAt from the peer', async () => {
      const peerTs = 1_000_000;
      await mergeUnits([
        { uid: 'ts-test', type: 'snippet', content: 'old', createdAt: peerTs },
      ]);
      const all = await getAllUnits();
      expect(all[0].createdAt).toBe(peerTs);
    });

    it('deduplicates within the incoming batch itself', async () => {
      const added = await mergeUnits([
        { uid: 'dup-uid', type: 'snippet', content: 'first', createdAt: Date.now() },
        { uid: 'dup-uid', type: 'snippet', content: 'second', createdAt: Date.now() },
      ]);
      expect(added).toBe(1);
    });

    it('returns 0 for an empty array', async () => {
      const added = await mergeUnits([]);
      expect(added).toBe(0);
    });
  });

  describe('getAllSettings', () => {
    it('returns an empty array when no settings exist', async () => {
      const result = await getAllSettings();
      expect(result).toEqual([]);
    });

    it('returns all stored settings', async () => {
      await setSetting('gemini_key', 'abc123');
      await setSetting('other_key', 'xyz');
      const result = await getAllSettings();
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.key)).toContain('gemini_key');
    });
  });

  describe('dumpDB', () => {
    it('returns version, exportedAt, units, and settings', async () => {
      const dump = await dumpDB();
      expect(dump).toHaveProperty('version');
      expect(dump).toHaveProperty('exportedAt');
      expect(Array.isArray(dump.units)).toBe(true);
      expect(Array.isArray(dump.settings)).toBe(true);
    });

    it('includes all units in the dump', async () => {
      await addUnit({ type: 'snippet', content: 'hello' });
      await addUnit({ type: 'password', content: 'secret' });
      const dump = await dumpDB();
      expect(dump.units).toHaveLength(2);
    });

    it('includes all settings in the dump', async () => {
      await setSetting('gemini_key', 'mykey');
      const dump = await dumpDB();
      expect(dump.settings).toHaveLength(1);
      expect(dump.settings[0].key).toBe('gemini_key');
    });

    it('exportedAt is a recent timestamp', async () => {
      const before = Date.now();
      const dump = await dumpDB();
      const after = Date.now();
      expect(dump.exportedAt).toBeGreaterThanOrEqual(before);
      expect(dump.exportedAt).toBeLessThanOrEqual(after);
    });

    it('preserves image data URLs intact', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      await addUnit({ type: 'image', content: dataUrl, fileName: 'pic.png', mimeType: 'image/png' });
      const dump = await dumpDB();
      expect(dump.units[0].content).toBe(dataUrl);
      expect(dump.units[0].fileName).toBe('pic.png');
    });
  });
});

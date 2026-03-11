import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addUnit, getAllUnits, deleteUnit, updateUnit } from '../utils/db';

// ── Minimal in-memory IndexedDB mock ─────────────────────────────────────────

function createMockDB() {
  const store = { data: new Map(), nextId: 1 };

  const mockObjectStore = () => ({
    add(record) {
      const id = store.nextId++;
      store.data.set(id, { ...record, id });
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.({ target: { result: id } }));
      return req;
    },
    get(id) {
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.({ target: { result: store.data.get(id) } }));
      return req;
    },
    put(record) {
      store.data.set(record.id, record);
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
    getAll() {
      const req = {};
      Promise.resolve().then(() =>
        req.onsuccess?.({ target: { result: [...store.data.values()] } })
      );
      return req;
    },
    delete(id) {
      store.data.delete(id);
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
  });

  return {
    _store: store,
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(),
    transaction: () => ({ objectStore: mockObjectStore }),
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
});

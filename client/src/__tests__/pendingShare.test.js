import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writePendingShare, readPendingShare, clearPendingShare } from '../utils/pendingShare';

// ── In-memory IDB mock (key-value store, explicit key passed to put/get/delete) ──

function createMockDB() {
  const store = new Map();

  const mockObjectStore = () => ({
    put(data, key) {
      store.set(key, data);
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.());
      return req;
    },
    get(key) {
      const req = {};
      Promise.resolve().then(() => req.onsuccess?.({ target: { result: store.get(key) } }));
      return req;
    },
    delete(key) {
      store.delete(key);
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

describe('pendingShare', () => {
  let mockDB;

  beforeEach(() => {
    mockDB = setupMockIndexedDB();
  });

  describe('writePendingShare', () => {
    it('stores the share payload', async () => {
      const share = { type: 'snippet', content: 'hello' };
      await writePendingShare(share);
      expect(mockDB._store.get('current')).toEqual(share);
    });

    it('overwrites a previous pending share', async () => {
      await writePendingShare({ type: 'snippet', content: 'first' });
      await writePendingShare({ type: 'snippet', content: 'second' });
      expect(mockDB._store.get('current').content).toBe('second');
    });
  });

  describe('readPendingShare', () => {
    it('returns null when nothing is stored', async () => {
      const result = await readPendingShare();
      expect(result).toBeNull();
    });

    it('returns the stored share', async () => {
      const share = { type: 'image', content: 'data:image/png;base64,abc', fileName: 'photo.png', mimeType: 'image/png' };
      await writePendingShare(share);
      const result = await readPendingShare();
      expect(result).toEqual(share);
    });

    it('does not remove the share after reading', async () => {
      await writePendingShare({ type: 'snippet', content: 'persist' });
      await readPendingShare();
      expect(mockDB._store.has('current')).toBe(true);
    });
  });

  describe('clearPendingShare', () => {
    it('removes the stored share', async () => {
      await writePendingShare({ type: 'snippet', content: 'bye' });
      await clearPendingShare();
      expect(mockDB._store.has('current')).toBe(false);
    });

    it('is a no-op when nothing is stored', async () => {
      await expect(clearPendingShare()).resolves.toBeUndefined();
    });
  });

  describe('write → read → clear cycle', () => {
    it('returns null after a full write/read/clear cycle', async () => {
      await writePendingShare({ type: 'snippet', content: 'cycle' });
      await readPendingShare();
      await clearPendingShare();
      const result = await readPendingShare();
      expect(result).toBeNull();
    });
  });
});

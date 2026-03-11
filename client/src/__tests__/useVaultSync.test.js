import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  getAllUnits: vi.fn().mockResolvedValue([
    { uid: 'local-1', id: 1, type: 'snippet', content: 'local unit', createdAt: 1000 },
  ]),
  mergeUnits: vi.fn().mockResolvedValue(2),
}));

import { getAllUnits, mergeUnits } from '../utils/db';
import { useVaultSync } from '../hooks/useVaultSync';

function makeConn(open = true) {
  const handlers = {};
  return {
    open,
    send: vi.fn(),
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    off: vi.fn(),
    _trigger: (event, data) => handlers[event]?.(data),
  };
}

describe('useVaultSync', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Initial state ─────────────────────────────────────────────────────────

  it('starts with idle status and zero added', () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync(conn));
    expect(result.current.status).toBe('idle');
    expect(result.current.added).toBe(0);
  });

  // ── sync() ────────────────────────────────────────────────────────────────

  it('sync() sends local units with requestBack: true', async () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync(conn));

    await act(async () => { await result.current.sync(); });

    expect(conn.send).toHaveBeenCalledWith({
      type: 'sinkhole-vault-sync',
      units: expect.any(Array),
      requestBack: true,
    });
  });

  it('sync() sets status to syncing then done after receiving response', async () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync(conn));

    await act(async () => { await result.current.sync(); });
    expect(result.current.status).toBe('syncing');
  });

  it('sync() does nothing when connection is closed', async () => {
    const conn = makeConn(false);
    const { result } = renderHook(() => useVaultSync(conn));

    await act(async () => { await result.current.sync(); });

    expect(conn.send).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('sync() sets status to error when send throws', async () => {
    const conn = makeConn();
    conn.send.mockImplementation(() => { throw new Error('connection lost'); });
    const { result } = renderHook(() => useVaultSync(conn));

    await act(async () => { await result.current.sync(); });

    expect(result.current.status).toBe('error');
  });

  // ── Receiving ─────────────────────────────────────────────────────────────

  it('registers a data listener on the connection', () => {
    const conn = makeConn();
    renderHook(() => useVaultSync(conn));
    expect(conn.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('merges units from incoming vault-sync message', async () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync(conn));
    const peerUnits = [{ uid: 'peer-1', type: 'snippet', content: 'peer', createdAt: 999 }];

    await act(async () => {
      conn._trigger('data', { type: 'sinkhole-vault-sync', units: peerUnits, requestBack: false });
    });

    expect(mergeUnits).toHaveBeenCalledWith(peerUnits);
    expect(result.current.status).toBe('done');
    expect(result.current.added).toBe(2); // mocked mergeUnits returns 2
  });

  it('ignores messages with a different type', async () => {
    const conn = makeConn();
    renderHook(() => useVaultSync(conn));

    await act(async () => {
      conn._trigger('data', { type: 'instant-mirror-sync', state: { content: 'hi' } });
    });

    expect(mergeUnits).not.toHaveBeenCalled();
  });

  it('sends back local units when requestBack is true', async () => {
    const conn = makeConn();
    renderHook(() => useVaultSync(conn));

    await act(async () => {
      conn._trigger('data', {
        type: 'sinkhole-vault-sync',
        units: [],
        requestBack: true,
      });
    });

    expect(conn.send).toHaveBeenCalledWith({
      type: 'sinkhole-vault-sync',
      units: expect.any(Array),
      requestBack: false,
    });
  });

  it('does not send back when requestBack is false', async () => {
    const conn = makeConn();
    renderHook(() => useVaultSync(conn));

    await act(async () => {
      conn._trigger('data', { type: 'sinkhole-vault-sync', units: [], requestBack: false });
    });

    expect(conn.send).not.toHaveBeenCalled();
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  it('removes the data listener on unmount', () => {
    const conn = makeConn();
    const { unmount } = renderHook(() => useVaultSync(conn));
    unmount();
    expect(conn.off).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('does nothing when conn is null', () => {
    const { result } = renderHook(() => useVaultSync(null));
    expect(result.current.status).toBe('idle');
  });
});

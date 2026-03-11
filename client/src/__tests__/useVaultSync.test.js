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

function makeConn(open = true, peer = 'peer-id-1') {
  const handlers = {};
  return {
    open,
    peer,
    send: vi.fn(),
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    off: vi.fn(),
    _trigger: (event, data) => handlers[event]?.(data),
  };
}

describe('useVaultSync', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Initial state ─────────────────────────────────────────────────────────

  it('getState returns idle/zero for a new connection', () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync([conn]));
    expect(result.current.getState(conn)).toEqual({ status: 'idle', added: 0 });
  });

  it('getState returns idle/zero for null', () => {
    const { result } = renderHook(() => useVaultSync([]));
    expect(result.current.getState(null)).toEqual({ status: 'idle', added: 0 });
  });

  // ── Listener registration ─────────────────────────────────────────────────

  it('registers a data listener on each connection', () => {
    const conn1 = makeConn(true, 'peer-1');
    const conn2 = makeConn(true, 'peer-2');
    renderHook(() => useVaultSync([conn1, conn2]));
    expect(conn1.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(conn2.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('does not register a second listener when connections array updates with same conn', () => {
    const conn = makeConn();
    const { rerender } = renderHook(({ conns }) => useVaultSync(conns), {
      initialProps: { conns: [conn] },
    });
    rerender({ conns: [conn] });
    // on should have been called exactly once for the 'data' event
    const dataCalls = conn.on.mock.calls.filter(([e]) => e === 'data');
    expect(dataCalls).toHaveLength(1);
  });

  it('registers a listener when a new connection is added', () => {
    const conn1 = makeConn(true, 'peer-1');
    const conn2 = makeConn(true, 'peer-2');
    const { rerender } = renderHook(({ conns }) => useVaultSync(conns), {
      initialProps: { conns: [conn1] },
    });
    rerender({ conns: [conn1, conn2] });
    expect(conn2.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  // ── sync(conn) ────────────────────────────────────────────────────────────

  it('sync(conn) sends local units with requestBack: true', async () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync([conn]));

    await act(async () => { await result.current.sync(conn); });

    expect(conn.send).toHaveBeenCalledWith({
      type: 'sinkhole-vault-sync',
      units: expect.any(Array),
      requestBack: true,
    });
  });

  it('sync(conn) updates status to syncing', async () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync([conn]));

    await act(async () => { await result.current.sync(conn); });

    expect(result.current.getState(conn).status).toBe('syncing');
  });

  it('sync(conn) does nothing when connection is closed', async () => {
    const conn = makeConn(false);
    const { result } = renderHook(() => useVaultSync([conn]));

    await act(async () => { await result.current.sync(conn); });

    expect(conn.send).not.toHaveBeenCalled();
    expect(result.current.getState(conn).status).toBe('idle');
  });

  it('sync(conn) sets status to error when send throws', async () => {
    const conn = makeConn();
    conn.send.mockImplementation(() => { throw new Error('lost'); });
    const { result } = renderHook(() => useVaultSync([conn]));

    await act(async () => { await result.current.sync(conn); });

    expect(result.current.getState(conn).status).toBe('error');
  });

  // ── Receiving ─────────────────────────────────────────────────────────────

  it('merges units from an incoming vault-sync message', async () => {
    const conn = makeConn();
    const { result } = renderHook(() => useVaultSync([conn]));
    const peerUnits = [{ uid: 'peer-1', type: 'snippet', content: 'peer', createdAt: 999 }];

    await act(async () => {
      conn._trigger('data', { type: 'sinkhole-vault-sync', units: peerUnits, requestBack: false });
    });

    expect(mergeUnits).toHaveBeenCalledWith(peerUnits);
    expect(result.current.getState(conn)).toEqual({ status: 'done', added: 2 });
  });

  it('ignores messages with a different type', async () => {
    const conn = makeConn();
    renderHook(() => useVaultSync([conn]));

    await act(async () => {
      conn._trigger('data', { type: 'instant-mirror-sync', state: { content: 'hi' } });
    });

    expect(mergeUnits).not.toHaveBeenCalled();
  });

  it('sends back local units when requestBack is true', async () => {
    const conn = makeConn();
    renderHook(() => useVaultSync([conn]));

    await act(async () => {
      conn._trigger('data', { type: 'sinkhole-vault-sync', units: [], requestBack: true });
    });

    expect(conn.send).toHaveBeenCalledWith({
      type: 'sinkhole-vault-sync',
      units: expect.any(Array),
      requestBack: false,
    });
  });

  it('does not send back when requestBack is false', async () => {
    const conn = makeConn();
    renderHook(() => useVaultSync([conn]));

    await act(async () => {
      conn._trigger('data', { type: 'sinkhole-vault-sync', units: [], requestBack: false });
    });

    expect(conn.send).not.toHaveBeenCalled();
  });

  it('tracks state independently per connection', async () => {
    const conn1 = makeConn(true, 'peer-1');
    const conn2 = makeConn(true, 'peer-2');
    const { result } = renderHook(() => useVaultSync([conn1, conn2]));

    await act(async () => {
      conn1._trigger('data', { type: 'sinkhole-vault-sync', units: [], requestBack: false });
    });

    expect(result.current.getState(conn1).status).toBe('done');
    expect(result.current.getState(conn2).status).toBe('idle');
  });
});

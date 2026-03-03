import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSync } from '../hooks/useSync';

/**
 * Creates a minimal mock of a PeerJS DataConnection.
 * Captures `on` handlers so tests can simulate incoming messages.
 */
function makeMockConn(open = true) {
  const handlers = {};
  return {
    open,
    send: vi.fn(),
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    off: vi.fn(),
    emit: (event, data) => handlers[event]?.(data),
  };
}

describe('useSync — basic P2P sync', () => {
  let conn;

  beforeEach(() => {
    conn = makeMockConn();
  });

  it('returns the initial state', () => {
    const { result } = renderHook(() => useSync(conn, { content: 'hello' }));
    expect(result.current[0]).toEqual({ content: 'hello' });
  });

  it('defaults to an empty object when no initialState is provided', () => {
    const { result } = renderHook(() => useSync(conn));
    expect(result.current[0]).toEqual({});
  });

  it('push() updates local state', () => {
    const { result } = renderHook(() => useSync(conn));
    act(() => result.current[1]({ content: 'world' }));
    expect(result.current[0]).toEqual({ content: 'world' });
  });

  it('push() sends the correct message over the connection', () => {
    const { result } = renderHook(() => useSync(conn));
    act(() => result.current[1]({ content: 'hello' }));
    expect(conn.send).toHaveBeenCalledWith({
      type: 'instant-mirror-sync',
      state: { content: 'hello' },
    });
  });

  it('receiving a sync message updates local state', () => {
    const { result } = renderHook(() => useSync(conn));
    act(() => {
      conn.emit('data', { type: 'instant-mirror-sync', state: { content: 'from peer' } });
    });
    expect(result.current[0]).toEqual({ content: 'from peer' });
  });

  it('receiving a JSON string message also updates state', () => {
    const { result } = renderHook(() => useSync(conn));
    act(() => {
      conn.emit('data', JSON.stringify({ type: 'instant-mirror-sync', state: { content: 'via string' } }));
    });
    expect(result.current[0]).toEqual({ content: 'via string' });
  });

  it('ignores messages with an unknown type', () => {
    const { result } = renderHook(() => useSync(conn, { content: 'initial' }));
    act(() => {
      conn.emit('data', { type: 'something-else', state: { content: 'nope' } });
    });
    expect(result.current[0]).toEqual({ content: 'initial' });
  });

  it('does not send when the connection is closed', () => {
    const closedConn = makeMockConn(false);
    const { result } = renderHook(() => useSync(closedConn));
    act(() => result.current[1]({ content: 'test' }));
    expect(closedConn.send).not.toHaveBeenCalled();
  });

  it('does not send when conn is null', () => {
    const { result } = renderHook(() => useSync(null));
    expect(() => act(() => result.current[1]({ content: 'test' }))).not.toThrow();
  });
});

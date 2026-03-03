import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── PeerJS mock ──────────────────────────────────────────────────────────────
// Each test accesses instances via `mockPeerInstances` to trigger events.

let mockPeerInstances = [];

vi.mock('peerjs', () => {
  class MockPeer {
    constructor(id) {
      this.id = id;
      this.destroyed = false;
      this._handlers = {};
      this.on = vi.fn((event, handler) => { this._handlers[event] = handler; });
      this.connect = vi.fn();
      this.destroy = vi.fn(() => { this.destroyed = true; });
      // Helper to fire registered event handlers in tests
      this._trigger = (event, ...args) => this._handlers[event]?.(...args);
      mockPeerInstances.push(this);
    }
  }
  return { default: MockPeer };
});

vi.mock('../utils/stableHostId', () => ({
  getStableHostId: () => 'mock-stable-id',
  isValidPeerId: (id) => /^[a-z]+(-[a-z]+)+$/.test(id),
}));

import { usePeer } from '../hooks/usePeer';

describe('usePeer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPeerInstances = [];
  });

  it('starts with no peer and no connections', () => {
    const { result } = renderHook(() => usePeer());
    expect(result.current.peer).toBeNull();
    expect(result.current.connections).toEqual([]);
    expect(result.current.peerId).toBe('');
  });

  it('start() creates a Peer with the given ID', () => {
    const { result } = renderHook(() => usePeer());

    act(() => { result.current.start('my-host-id'); });

    expect(mockPeerInstances).toHaveLength(1);
    expect(mockPeerInstances[0].id).toBe('my-host-id');
  });

  it('start() registers open/connection/error handlers', () => {
    const { result } = renderHook(() => usePeer());
    act(() => { result.current.start('test-id'); });

    const registeredEvents = mockPeerInstances[0].on.mock.calls.map(([e]) => e);
    expect(registeredEvents).toContain('open');
    expect(registeredEvents).toContain('connection');
    expect(registeredEvents).toContain('error');
  });

  it('peer and peerId are set after the open event fires', () => {
    const { result } = renderHook(() => usePeer());
    act(() => { result.current.start('test-id'); });
    act(() => { mockPeerInstances[0]._trigger('open'); });

    expect(result.current.peer).not.toBeNull();
    expect(result.current.peerId).toBe('test-id');
  });

  it('stop() destroys the peer and resets state', () => {
    const { result } = renderHook(() => usePeer());
    act(() => { result.current.start('test-id'); });
    act(() => { mockPeerInstances[0]._trigger('open'); });
    act(() => { result.current.stop(); });

    expect(mockPeerInstances[0].destroy).toHaveBeenCalled();
    expect(result.current.peer).toBeNull();
    expect(result.current.peerId).toBe('');
    expect(result.current.connections).toEqual([]);
  });

  it('start() is idempotent — second call does not create a new Peer', () => {
    const { result } = renderHook(() => usePeer());

    act(() => { result.current.start('test-id'); });
    act(() => { result.current.start('test-id'); });

    expect(mockPeerInstances).toHaveLength(1);
  });

  it('error event sets the error state', () => {
    const { result } = renderHook(() => usePeer());
    act(() => { result.current.start('test-id'); });
    act(() => { mockPeerInstances[0]._trigger('error', { message: 'network error' }); });

    expect(result.current.error).toBe('network error');
  });

  it('incoming connection is added to connections list on open', () => {
    const { result } = renderHook(() => usePeer());
    act(() => { result.current.start('host-id'); });

    const dataConnHandlers = {};
    const mockDataConn = {
      open: true,
      on: vi.fn((event, handler) => { dataConnHandlers[event] = handler; }),
      _trigger: (event) => dataConnHandlers[event]?.(),
    };

    act(() => { mockPeerInstances[0]._trigger('connection', mockDataConn); });
    act(() => { mockDataConn._trigger('open'); });

    expect(result.current.connections).toHaveLength(1);
    expect(result.current.connections[0]).toBe(mockDataConn);
  });

  it('connection is removed from list when it closes', () => {
    const { result } = renderHook(() => usePeer());
    act(() => { result.current.start('host-id'); });

    const dataConnHandlers = {};
    const mockDataConn = {
      open: true,
      on: vi.fn((event, handler) => { dataConnHandlers[event] = handler; }),
      _trigger: (event) => dataConnHandlers[event]?.(),
    };

    act(() => { mockPeerInstances[0]._trigger('connection', mockDataConn); });
    act(() => { mockDataConn._trigger('open'); });
    expect(result.current.connections).toHaveLength(1);

    act(() => { mockDataConn._trigger('close'); });
    expect(result.current.connections).toHaveLength(0);
  });
});

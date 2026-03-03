import { useState, useEffect, useCallback } from 'react';

const SYNC_CHANNEL = 'instant-mirror-sync';

/**
 * Syncs state over a PeerJS DataConnection.
 *
 * `push(nextState)` — sends state to the peer and updates local state.
 * Incoming messages from the peer update local state without re-sending (no echo).
 *
 * `initialState` lets callers define their own data shape.
 *
 * @param {object|null} conn - A PeerJS DataConnection, or null when disconnected.
 * @param {object} initialState - Starting value for the synced state.
 * @returns {[state, push, close]}
 */
export function useSync(conn, initialState = {}) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!conn?.open) return;
    const handler = (data) => {
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        if (msg?.type === SYNC_CHANNEL && msg.state != null) {
          setState(msg.state);
        }
      } catch (_) {}
    };
    conn.on('data', handler);
    return () => conn.off('data', handler);
  }, [conn]);

  const push = useCallback(
    (nextState) => {
      setState(nextState);
      if (conn?.open) conn.send({ type: SYNC_CHANNEL, state: nextState });
    },
    [conn]
  );

  const close = useCallback(() => {
    if (conn?.open) conn.close();
  }, [conn]);

  return [state, push, close];
}

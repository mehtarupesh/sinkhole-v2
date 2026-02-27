import { useState, useEffect, useCallback } from 'react';

const SYNC_CHANNEL = 'instant-mirror-sync';

/**
 * Hook that holds mirrored state and sends/receives over the given PeerJS DataConnection.
 * Any local change is pushed; any remote message updates local state.
 */
export function useSync(conn) {
  const [state, setState] = useState({ content: '' });

  // Receive: when the other peer sends state, apply it (avoid echo by not re-sending)
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

  // Send: push current state to the other peer
  const push = useCallback(
    (nextState) => {
      setState(nextState);
      if (conn?.open) {
        conn.send({ type: SYNC_CHANNEL, state: nextState });
      }
    },
    [conn]
  );

  return [state, push];
}

/**
 * One-time sync: send your data, receive the other peer's data once.
 * Call close() when done so both sides can tear down the connection.
 */
export function oneTimeSync(conn) {
  const [received, setReceived] = useState(null);

  useEffect(() => {
    if (!conn?.open) return;
    const handler = (data) => {
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        if (msg?.type === SYNC_CHANNEL && msg.state != null) {
          setReceived(msg.state);
        }
      } catch (_) {}
    };
    conn.on('data', handler);
    return () => conn.off('data', handler);
  }, [conn]);

  const sendOnce = useCallback(
    (state) => {
      if (conn?.open) {
        conn.send({ type: SYNC_CHANNEL, state });
      }
    },
    [conn]
  );

  const close = useCallback(() => {
    if (conn?.open) conn.close();
  }, [conn]);

  return [received, sendOnce, close];
}

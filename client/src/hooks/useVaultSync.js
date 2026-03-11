import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllUnits, mergeUnits } from '../utils/db';

const VAULT_CHANNEL = 'sinkhole-vault-sync';

/**
 * Exchanges sinkhole-db units with connected peers over their DataConnections.
 *
 * Accepts the full `connections` array so listeners are registered once per
 * connection as soon as it exists — independently of any UI being open.
 * This means either peer can initiate or receive a vault sync at any time.
 *
 * Protocol (avoids infinite loops):
 *   Initiator sends:  { type, units, requestBack: true  }
 *   Responder sends:  { type, units, requestBack: false }
 *
 * @param {object[]} connections - All open PeerJS DataConnections.
 * @returns {{ sync(conn): void, getState(conn): { status, added } }}
 *   sync    — send local units to a specific peer (triggers bidirectional exchange)
 *   getState — current sync status for a specific connection
 */
export function useVaultSync(connections) {
  const [states, setStates] = useState({}); // { [conn.peer]: { status, added } }
  const listenedRef = useRef(new Set());     // tracks which conn objects have a listener

  useEffect(() => {
    connections.forEach((conn) => {
      if (listenedRef.current.has(conn)) return;
      listenedRef.current.add(conn);

      conn.on('data', async (data) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : data;
          if (msg?.type !== VAULT_CHANNEL) return;

          const n = await mergeUnits(msg.units ?? []);
          setStates((prev) => ({ ...prev, [conn.peer]: { status: 'done', added: n } }));

          if (msg.requestBack && conn.open) {
            const localUnits = await getAllUnits();
            conn.send({ type: VAULT_CHANNEL, units: localUnits, requestBack: false });
          }
        } catch (_) {
          setStates((prev) => ({ ...prev, [conn.peer]: { status: 'error', added: 0 } }));
        }
      });
    });
  }, [connections]);

  const sync = useCallback(async (conn) => {
    if (!conn?.open) return;
    setStates((prev) => ({ ...prev, [conn.peer]: { status: 'syncing', added: 0 } }));
    try {
      const units = await getAllUnits();
      conn.send({ type: VAULT_CHANNEL, units, requestBack: true });
    } catch (_) {
      setStates((prev) => ({ ...prev, [conn.peer]: { status: 'error', added: 0 } }));
    }
  }, []);

  const getState = useCallback(
    (conn) => states[conn?.peer] ?? { status: 'idle', added: 0 },
    [states]
  );

  return { sync, getState };
}

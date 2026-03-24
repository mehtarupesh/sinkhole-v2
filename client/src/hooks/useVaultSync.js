import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllUnits, mergeUnits } from '../utils/db';

const VAULT_CHANNEL = 'sinkhole-vault-sync';

/**
 * Exchanges sinkhole-db units with connected peers over their DataConnections.
 *
 * Protocol (3 messages, no infinite loops):
 *   Initiator → Responder:  { phase: 'offer',    uids: string[] }
 *   Responder → Initiator:  { phase: 'transfer', units: Unit[], want: string[] }
 *   Initiator → Responder:  { phase: 'transfer', units: Unit[] }   ← no want, no reply
 *
 * @param {object[]} connections - All open PeerJS DataConnections.
 * @returns {{ sync(conn): void, getState(conn): { status, added } }}
 */
export function useVaultSync(connections) {
  const [states, setStates] = useState({});
  const listenedRef = useRef(new Set());

  useEffect(() => {
    connections.forEach((conn) => {
      if (listenedRef.current.has(conn)) return;
      listenedRef.current.add(conn);

      conn.on('data', async (data) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : data;
          if (msg?.type !== VAULT_CHANNEL) return;

          if (msg.phase === 'offer') {
            const localUnits = await getAllUnits();
            const peerHas = new Set(msg.uids);
            const toSend = localUnits.filter((u) => u.uid && !peerHas.has(u.uid));
            const myUids = new Set(localUnits.map((u) => u.uid).filter(Boolean));
            const want = msg.uids.filter((uid) => !myUids.has(uid));
            if (conn.open) conn.send({ type: VAULT_CHANNEL, phase: 'transfer', units: toSend, want });

          } else if (msg.phase === 'transfer') {
            const n = await mergeUnits(msg.units ?? []);
            setStates((prev) => ({ ...prev, [conn.peer]: { status: 'done', added: n } }));
            if (msg.want?.length > 0 && conn.open) {
              const localUnits = await getAllUnits();
              const wantSet = new Set(msg.want);
              const toSend = localUnits.filter((u) => wantSet.has(u.uid));
              conn.send({ type: VAULT_CHANNEL, phase: 'transfer', units: toSend });
            }
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
      const uids = units.map((u) => u.uid).filter(Boolean);
      conn.send({ type: VAULT_CHANNEL, phase: 'offer', uids });
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

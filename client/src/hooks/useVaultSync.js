import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllUnits, getCategorization, mergeUnits, mergeCategorization, getAccessOrder, mergeAccessOrder } from '../utils/db';

const VAULT_CHANNEL = 'sinkhole-vault-sync';

function shortId(peer) {
  return peer?.length > 12 ? `${peer.slice(0, 12)}…` : (peer ?? '?');
}

// Effective last-modified timestamp — updatedAt if present, else createdAt.
function ts(unit) {
  return unit.updatedAt ?? unit.createdAt ?? 0;
}

/**
 * Exchanges sinkhole-db units with connected peers over their DataConnections.
 *
 * Protocol (3 messages, no infinite loops):
 *   Initiator → Responder:  { phase: 'offer',    units: [{uid, ts}], tombstones: [{uid, deletedAt}] }
 *   Responder → Initiator:  { phase: 'transfer', units: Unit[], want: string[], categorization, tombstones }
 *   Initiator → Responder:  { phase: 'transfer', units: Unit[], categorization, tombstones }
 *
 * On receiving an offer, tombstones are applied before diffing so deleted units
 * are excluded from want/toSend. Both transfer messages carry tombstones.
 *
 * @param {object[]} connections - All open PeerJS DataConnections.
 * @returns {{ sync(conn): void, getState(conn): { status, added, log } }}
 */
export function useVaultSync(connections) {
  const [states, setStates] = useState({});
  const listenedRef = useRef(new Set());

  const appendLog = useCallback((peer, text) => {
    setStates(prev => {
      const cur = prev[peer] ?? { status: 'idle', added: 0, log: [] };
      return { ...prev, [peer]: { ...cur, log: [...cur.log, { ts: Date.now(), text }] } };
    });
  }, []);

  const setPeerState = useCallback((peer, updates) => {
    setStates(prev => ({
      ...prev,
      [peer]: { ...(prev[peer] ?? { status: 'idle', added: 0, log: [] }), ...updates },
    }));
  }, []);

  useEffect(() => {
    connections.forEach((conn) => {
      if (listenedRef.current.has(conn)) return;
      listenedRef.current.add(conn);
      const sp = shortId(conn.peer);

      conn.on('data', async (data) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : data;
          if (msg?.type !== VAULT_CHANNEL) return;

          if (msg.phase === 'offer') {
            setStates(prev => ({ ...prev, [conn.peer]: { ...(prev[conn.peer] ?? { status: 'idle', added: 0 }), status: 'syncing', detail: 'Comparing vaults…', log: [] } }));

            // Fetch local state before merging so Message 2 carries only the responder's own data.
            const [localUnits, categorization, accessOrder] = await Promise.all([getAllUnits(), getCategorization(), getAccessOrder()]);

            // Merge initiator's categories and access order.
            await Promise.all([mergeCategorization(msg.categorization), mergeAccessOrder(msg.accessOrder)]);

            const peerMap  = new Map((msg.units ?? []).map((u) => [u.uid, u.ts ?? 0]));
            const localMap = new Map(localUnits.filter((u) => u.uid).map((u) => [u.uid, u]));

            const toSend = localUnits.filter((u) => {
              if (!u.uid) return false;
              if (!peerMap.has(u.uid)) return true;
              return ts(u) > (peerMap.get(u.uid) ?? 0);
            });

            const want = (msg.units ?? [])
              .filter((u) => {
                const local = localMap.get(u.uid);
                if (!local) return true;
                return (u.ts ?? 0) > ts(local);
              })
              .map((u) => u.uid);

            appendLog(conn.peer, `← offer from ${sp}: ${peerMap.size} items · sending ${toSend.length}, want ${want.length}`);
            if (conn.open) conn.send({ type: VAULT_CHANNEL, phase: 'transfer', units: toSend, want, categorization, accessOrder });
            if (want.length === 0) {
              setPeerState(conn.peer, { status: 'done', added: 0 });
            } else {
              setPeerState(conn.peer, { detail: `Waiting for ${want.length} item${want.length !== 1 ? 's' : ''}…` });
            }

          } else if (msg.phase === 'transfer') {
            const incomingCount = msg.units?.length ?? 0;
            if (incomingCount > 0) setPeerState(conn.peer, { detail: `Merging ${incomingCount} item${incomingCount !== 1 ? 's' : ''}…` });
            const [idRemap] = await Promise.all([mergeCategorization(msg.categorization), mergeAccessOrder(msg.accessOrder)]);
            const { added, updated } = await mergeUnits(msg.units ?? [], idRemap);

            if (msg.want?.length > 0 && conn.open) {
              const localUnits = await getAllUnits();
              const wantSet = new Set(msg.want);
              const toSend  = localUnits.filter((u) => wantSet.has(u.uid));
              conn.send({ type: VAULT_CHANNEL, phase: 'transfer', units: toSend });
              // Single state update: log + done together so no intermediate render shows "Sending…"
              setStates(prev => {
                const cur = prev[conn.peer] ?? { status: 'idle', added: 0, log: [] };
                const logEntry = { ts: Date.now(), text: `← transfer from ${sp}: ${msg.units.length} items (+${added} new, ~${updated} updated) · sending ${toSend.length} back` };
                return { ...prev, [conn.peer]: { ...cur, status: 'done', added, log: [...cur.log, logEntry] } };
              });
            } else {
              setStates(prev => {
                const cur = prev[conn.peer] ?? { status: 'idle', added: 0, log: [] };
                const logEntry = { ts: Date.now(), text: `← transfer from ${sp}: ${msg.units.length} items (+${added} new, ~${updated} updated) · done` };
                return { ...prev, [conn.peer]: { ...cur, status: 'done', added, log: [...cur.log, logEntry] } };
              });
            }
          }
        } catch (_) {
          setPeerState(conn.peer, { status: 'error' });
        }
      });
    });
  }, [connections, appendLog, setPeerState]);

  const sync = useCallback(async (conn) => {
    if (!conn?.open) return;
    setStates(prev => ({ ...prev, [conn.peer]: { status: 'syncing', added: 0, log: [], detail: 'Reading vault…' } }));
    try {
      const [units, categorization, accessOrder] = await Promise.all([getAllUnits(), getCategorization(), getAccessOrder()]);
      const offerUnits = units.filter((u) => u.uid).map((u) => ({ uid: u.uid, ts: ts(u) }));
      appendLog(conn.peer, `→ offer to ${shortId(conn.peer)}: ${offerUnits.length} items`);
      setPeerState(conn.peer, { detail: `Comparing ${offerUnits.length} item${offerUnits.length !== 1 ? 's' : ''}…` });
      conn.send({ type: VAULT_CHANNEL, phase: 'offer', units: offerUnits, categorization, accessOrder });
    } catch (_) {
      setPeerState(conn.peer, { status: 'error' });
    }
  }, [appendLog, setPeerState]);

  const getState = useCallback(
    (conn) => states[conn?.peer] ?? { status: 'idle', added: 0, log: [] },
    [states]
  );

  return { sync, getState };
}

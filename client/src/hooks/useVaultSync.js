import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllUnits, getCategorization, mergeUnits, mergeCategorization } from '../utils/db';

const VAULT_CHANNEL = 'sinkhole-vault-sync';

function shortId(peer) {
  return peer?.length > 12 ? `${peer.slice(0, 12)}…` : (peer ?? '?');
}

/**
 * Exchanges sinkhole-db units with connected peers over their DataConnections.
 *
 * Protocol (3 messages, no infinite loops):
 *   Initiator → Responder:  { phase: 'offer',    uids: string[] }
 *   Responder → Initiator:  { phase: 'transfer', units: Unit[], want: string[], categorization }
 *   Initiator → Responder:  { phase: 'transfer', units: Unit[], categorization }  ← no want, no reply
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
            setStates(prev => ({ ...prev, [conn.peer]: { ...(prev[conn.peer] ?? { status: 'idle', added: 0 }), status: 'syncing', log: [] } }));
            const [localUnits, categorization] = await Promise.all([getAllUnits(), getCategorization()]);
            const peerHas = new Set(msg.uids);
            const toSend = localUnits.filter((u) => u.uid && !peerHas.has(u.uid));
            const myUids = new Set(localUnits.map((u) => u.uid).filter(Boolean));
            const want = msg.uids.filter((uid) => !myUids.has(uid));
            appendLog(conn.peer, `← offer from ${sp}: ${msg.uids.length} items · sending ${toSend.length} new, want ${want.length}`);
            if (conn.open) conn.send({ type: VAULT_CHANNEL, phase: 'transfer', units: toSend, want, categorization });
            if (want.length === 0) setPeerState(conn.peer, { status: 'done', added: 0 });

          } else if (msg.phase === 'transfer') {
            const n = await mergeUnits(msg.units ?? []);
            await mergeCategorization(msg.categorization);
            if (msg.want?.length > 0 && conn.open) {
              const [localUnits, categorization] = await Promise.all([getAllUnits(), getCategorization()]);
              const wantSet = new Set(msg.want);
              const toSend = localUnits.filter((u) => wantSet.has(u.uid));
              appendLog(conn.peer, `← transfer from ${sp}: ${msg.units.length} items (merged ${n}) · sending ${toSend.length} back`);
              conn.send({ type: VAULT_CHANNEL, phase: 'transfer', units: toSend, categorization });
            } else {
              appendLog(conn.peer, `← transfer from ${sp}: ${msg.units.length} items (merged ${n}) · done`);
            }
            setPeerState(conn.peer, { status: 'done', added: n });
          }
        } catch (_) {
          setPeerState(conn.peer, { status: 'error' });
        }
      });
    });
  }, [connections, appendLog, setPeerState]);

  const sync = useCallback(async (conn) => {
    if (!conn?.open) return;
    setStates(prev => ({ ...prev, [conn.peer]: { status: 'syncing', added: 0, log: [] } }));
    try {
      const units = await getAllUnits();
      const uids = units.map((u) => u.uid).filter(Boolean);
      appendLog(conn.peer, `→ offer to ${shortId(conn.peer)}: ${uids.length} items`);
      conn.send({ type: VAULT_CHANNEL, phase: 'offer', uids });
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

import { useState, useEffect, useCallback } from 'react';
import { getAllUnits, mergeUnits } from '../utils/db';

const VAULT_CHANNEL = 'sinkhole-vault-sync';

/**
 * Exchanges sinkhole-db units with the connected peer over a DataConnection.
 *
 * Protocol (single message type, avoids loops):
 *   Initiator sends:  { type, units, requestBack: true }
 *   Responder sends:  { type, units, requestBack: false }
 *
 * Calling `sync()` on either peer triggers a full bidirectional exchange:
 * the initiator's units land on the responder, which then sends its own units back.
 *
 * @param {object|null} conn - A PeerJS DataConnection, or null.
 * @returns {{ sync: Function, status: string, added: number }}
 *   status: 'idle' | 'syncing' | 'done' | 'error'
 *   added:  number of units received from the peer in the last sync
 */
export function useVaultSync(conn) {
  const [status, setStatus] = useState('idle');
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!conn) return;

    const handler = async (data) => {
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        if (msg?.type !== VAULT_CHANNEL) return;

        const n = await mergeUnits(msg.units ?? []);
        setAdded(n);
        setStatus('done');

        if (msg.requestBack && conn.open) {
          const localUnits = await getAllUnits();
          conn.send({ type: VAULT_CHANNEL, units: localUnits, requestBack: false });
        }
      } catch (_) {
        setStatus('error');
      }
    };

    conn.on('data', handler);
    return () => conn.off('data', handler);
  }, [conn]);

  const sync = useCallback(async () => {
    if (!conn?.open) return;
    setStatus('syncing');
    setAdded(0);
    try {
      const units = await getAllUnits();
      conn.send({ type: VAULT_CHANNEL, units, requestBack: true });
    } catch (_) {
      setStatus('error');
    }
  }, [conn]);

  return { sync, status, added };
}

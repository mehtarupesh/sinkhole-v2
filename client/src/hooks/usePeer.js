import { useState, useCallback, useRef } from 'react';
import Peer from 'peerjs';
import { PEER_OPTIONS } from '../peerConfig';
import { getStableHostId } from '../utils/stableHostId';

/**
 * Manages a PeerJS peer instance and its DataConnections.
 *
 * - `start(id?)` — begin accepting incoming connections as a host.
 * - `stop()` — destroy the peer and clear all state.
 * - `connect(hostId, { onOpen, onError })` — connect outward to another peer.
 * - `disconnect(conn)` — close and remove a specific connection.
 *
 * Agnostic to data format — pair with useSync for synced state.
 */
export function usePeer() {
  const [peer, setPeer] = useState(null);
  const [peerId, setPeerId] = useState('');
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');

  // Holds the live Peer instance independently of React render cycles.
  // Prevents double-creation in React StrictMode and across re-renders.
  const peerRef = useRef(null);

  // Tracks ephemeral Peer instances created for outgoing connections
  // so they can be cleaned up when the connection closes.
  const ephemeralPeers = useRef(new Map());

  const removeConn = useCallback((conn) => {
    setConnections((prev) => prev.filter((c) => c !== conn));
    const ep = ephemeralPeers.current.get(conn);
    if (ep) {
      ephemeralPeers.current.delete(conn);
      ep.destroy();
    }
  }, []);

  const registerConn = useCallback(
    (conn, ephemeralPeer) => {
      if (ephemeralPeer) ephemeralPeers.current.set(conn, ephemeralPeer);
      setConnections((prev) => [...prev, conn]);
      conn.on('close', () => removeConn(conn));
    },
    [removeConn]
  );

  /** Start peer and accept incoming connections. Safe to call multiple times. */
  const start = useCallback(
    (id = getStableHostId()) => {
      if (peerRef.current && !peerRef.current.destroyed) return peerRef.current;
      setError('');
      const p = new Peer(id, PEER_OPTIONS);
      peerRef.current = p;
      p.on('open', () => { setPeer(p); setPeerId(p.id); });
      p.on('connection', (dataConn) => {
        dataConn.on('open', () => registerConn(dataConn));
      });
      p.on('error', (err) => setError(err.message || 'Peer error'));
      return p;
    },
    [registerConn]
  );

  /** Destroy the peer and clear all state. */
  const stop = useCallback(() => {
    peerRef.current?.destroy();
    peerRef.current = null;
    setPeer(null);
    setPeerId('');
    setConnections([]);
    ephemeralPeers.current.clear();
  }, []);

  /** Connect outward to a host peer. Reuses the existing peer if alive. */
  const connect = useCallback(
    (hostId, { onOpen, onError } = {}) => {
      setError('');

      const makeDataConn = (p, isEphemeral) => {
        const dataConn = p.connect(hostId, { reliable: true });
        dataConn.on('open', () => {
          registerConn(dataConn, isEphemeral ? p : null);
          onOpen?.(dataConn);
        });
        dataConn.on('error', () => {
          onError?.('Connection failed');
          if (isEphemeral) p.destroy();
        });
      };

      if (peerRef.current && !peerRef.current.destroyed) {
        makeDataConn(peerRef.current, false);
      } else {
        const p = new Peer(getStableHostId(), PEER_OPTIONS);
        peerRef.current = p;
        p.on('open', () => {
          setPeer(p);
          setPeerId(p.id);
          makeDataConn(p, true);
        });
        p.on('error', (err) => {
          onError?.(err.message || 'Failed to connect');
          p.destroy();
          peerRef.current = null;
        });
      }
    },
    [registerConn]
  );

  /** Close and remove a specific connection. */
  const disconnect = useCallback(
    (conn) => {
      if (conn?.open) conn.close();
      removeConn(conn);
    },
    [removeConn]
  );

  return { peer, peerId, connections, error, start, stop, connect, disconnect };
}

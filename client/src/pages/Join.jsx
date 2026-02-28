import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Peer from 'peerjs';
import { useSync } from '../useSync';
import { PEER_OPTIONS } from '../peerConfig';
import { getStableHostId, isValidPeerId } from '../utils/stableHostId';

export default function Join() {
  const [searchParams] = useSearchParams();
  const rawPeerId = searchParams.get('peerId');
  const hostPeerId = rawPeerId && isValidPeerId(rawPeerId) ? rawPeerId.trim() : null;
  const [conn, setConn] = useState(null);
  const [status, setStatus] = useState('Connecting…');
  const [error, setError] = useState('');

  const [state, push, close] = useSync(conn);

  useEffect(() => {
    if (!hostPeerId) return;
    const peer = new Peer(getStableHostId(), PEER_OPTIONS);

    peer.on('open', () => {
      setStatus('Joining…');
      const dataConn = peer.connect(hostPeerId, { reliable: true });
      dataConn.on('open', () => {
        setConn(dataConn);
        setStatus('');
      });
      dataConn.on('error', (err) => setError(err.message || 'Connection error'));
    });

    peer.on('error', (err) => setError(err.message || 'Peer error'));

    return () => peer.destroy();
  }, [hostPeerId]);

  const updateContent = useCallback(
    (content) => push({ ...state, content }),
    [state, push]
  );

  if (!rawPeerId) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>Join</h2>
        <p style={styles.help}>
          On the other device, open the app and tap <strong>Show QR code</strong>, then scan that QR with this device’s camera to open the link. This page will then connect automatically.
        </p>
      </div>
    );
  }

  if (!hostPeerId) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>Join</h2>
        <p style={styles.help}>Invalid or unsupported link. Use the QR code from the host device to join.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {status && <p style={styles.status}>{status}</p>}
      <div style={styles.mirror}>
        <label style={styles.label}>Mirror ({conn ? 'live' : 'connecting…'})</label>
        <textarea
          style={styles.textarea}
          value={state.content}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Type here — it syncs to the other device"
          disabled={!conn}
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: { fontSize: '1.25rem', fontWeight: 600, margin: 0 },
  help: { margin: 0, color: '#888', fontSize: 14, textAlign: 'center', maxWidth: 320 },
  status: { color: '#888', marginBottom: 16 },
  error: { color: '#f87171' },
  mirror: { width: '100%', maxWidth: 420 },
  label: { display: 'block', fontSize: 12, color: '#888', marginBottom: 6 },
  textarea: {
    width: '100%',
    minHeight: 120,
    padding: 12,
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e5e5e5',
    fontSize: 14,
    resize: 'vertical',
  },
};

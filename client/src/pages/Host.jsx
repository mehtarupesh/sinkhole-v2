import { useState, useEffect, useCallback, useRef } from 'react';
import Peer from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import { useSync } from '../useSync';
import { PEER_OPTIONS } from '../peerConfig';

// Host view: QR code only. No camera, no scanner — the other device scans this QR.
export default function Host() {
  const [peer, setPeer] = useState(null);
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [error, setError] = useState('');
  const [localState, setLocalState] = useState({ content: '' });

  const [state, push, close] = useSync(conn);
  const sentInitial = useRef(false);

  useEffect(() => {
    if (!conn?.open || sentInitial.current) return;
    sentInitial.current = true;
    push(localState);
  }, [conn?.open]);

  const startSync = useCallback(async () => {
    setError('');
    try {
      const id = 'host-' + Math.random().toString(36).slice(2, 10);
      // Base URL: when deployed (e.g. GitHub Pages at /repo-name/) use origin + base path
      const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      let baseUrl = basePath ? `${window.location.origin}${basePath}` : window.location.origin;
      try {
        const { ip, port } = await fetch('/api/local-ip').then((r) => r.json());
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          baseUrl = `http://${ip}:${port}`;
      } catch (_) {}
      const joinUrl = `${baseUrl}/join?peerId=${id}`;
      setPeerId(id);
      setQrUrl(joinUrl);

      const p = new Peer(id, PEER_OPTIONS);

      p.on('open', () => {
        setPeer(p);
      });

      p.on('connection', (dataConn) => {
        dataConn.on('open', () => setConn(dataConn));
      });

      p.on('error', (err) => setError(err.message || 'Peer error'));
    } catch (e) {
      setError(e.message || 'Failed to start');
    }
  }, []);

  // Auto-start on mount so "Show QR code" goes straight to QR (no extra tap).
  useEffect(() => {
    startSync();
  }, [startSync]);

  const updateContent = useCallback(
    (content) => {
      const next = { ...state, content };
      setLocalState(next);
      push(next);
    },
    [state, push]
  );

  const displayState = conn ? state : localState;

  if (qrUrl) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Scan to connect</h1>
        <p style={styles.sub}>Open this URL on your phone — no camera needed here</p>
        <div style={styles.qrWrap}>
          <QRCodeSVG value={qrUrl} size={220} level="M" />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.mirror}>
          <label style={styles.label}>Mirror (live)</label>
          <textarea
            style={styles.textarea}
            value={displayState.content}
            onChange={(e) => updateContent(e.target.value)}
            placeholder="Type here — it syncs to the other device"
          />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <p style={styles.sub}>{error || 'Preparing QR code…'}</p>
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
    gap: 16,
  },
  title: { fontSize: '1.5rem', fontWeight: 600, margin: 0 },
  sub: { margin: 0, color: '#888', fontSize: '0.95rem', textAlign: 'center' },
  error: { color: '#f87171', fontSize: 14, margin: 0 },
  qrWrap: {
    padding: 16,
    background: '#fff',
    borderRadius: 12,
  },
  mirror: { width: '100%', maxWidth: 420, marginTop: 8 },
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

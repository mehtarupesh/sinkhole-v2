import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import { useSync } from '../useSync';
import { PEER_OPTIONS } from '../peerConfig';

// Simple minimal icons (inline SVG)
const QRIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="4" height="4" rx="0.5" />
    <rect x="9" y="14" width="4" height="4" rx="0.5" />
    <path d="M14 17h2v2h-2zM18 17h2v2h-2zM14 21h2v2h-2z" />
  </svg>
);

const CameraIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function MirrorPopup({ conn, onClose }) {
  const [state, push] = useSync(conn);
  const updateContent = useCallback((content) => push({ ...state, content }), [state, push]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div style={styles.popupHeader}>
          <span style={styles.popupTitle}>Live mirror</span>
          <button type="button" style={styles.popupClose} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <label style={styles.mirrorLabel}>Type here — it syncs to the other device</label>
        <textarea
          style={styles.mirrorTextarea}
          value={state?.content ?? ''}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Type here…"
          disabled={!conn?.open}
        />
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [showQrModal, setShowQrModal] = useState(false);
  const [peer, setPeer] = useState(null);
  const [peerId, setPeerId] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  const [mirrorConn, setMirrorConn] = useState(null);
  const initRef = useRef(false);

  const startHost = useCallback(async () => {
    setError('');
    try {
      const id = 'host-' + Math.random().toString(36).slice(2, 10);
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
      p.on('open', () => setPeer(p));
      p.on('connection', (dataConn) => {
        dataConn.on('open', () => {
          setConnections((prev) => [...prev, dataConn]);
        });
        dataConn.on('close', () => {
          setConnections((prev) => prev.filter((c) => c !== dataConn));
        });
      });
      p.on('error', (err) => setError(err.message || 'Peer error'));
    } catch (e) {
      setError(e?.message || 'Failed to start');
    }
  }, []);

  useEffect(() => {
    if (!showQrModal || initRef.current) return;
    initRef.current = true;
    startHost();
    return () => { initRef.current = false; };
  }, [showQrModal, startHost]);

  const closeConnection = useCallback((conn) => {
    if (conn?.open) conn.close();
    setConnections((prev) => prev.filter((c) => c !== conn));
    if (mirrorConn === conn) setMirrorConn(null);
  }, [mirrorConn]);

  const openMirror = useCallback((conn) => setMirrorConn(conn), []);
  const closeMirror = useCallback(() => setMirrorConn(null), []);

  return (
    <div style={styles.container}>
      {/* Center: minimal branding only */}
      <div style={styles.center}>
        <h1 style={styles.title}>Instant Mirror</h1>
        <p style={styles.sub}>One scan. No buttons. Data stays on your Wi‑Fi.</p>
      </div>

      {/* Actions: away from center — top right */}
      <div style={styles.actions}>
        <button
          type="button"
          style={styles.iconBtn}
          onClick={() => setShowQrModal(true)}
          title="Show QR code"
          aria-label="Show QR code"
        >
          <QRIcon />
        </button>
        <button
          type="button"
          style={styles.iconBtn}
          onClick={() => navigate('/scan')}
          title="Scan to join"
          aria-label="Scan to join"
        >
          <CameraIcon />
        </button>
      </div>

      {/* Active connections: away from center — bottom left */}
      {connections.length > 0 && (
        <div style={styles.connectionsWrap}>
          <span style={styles.connectionsTitle}>Connections</span>
          <ul style={styles.connectionsList}>
            {connections.map((conn, i) => (
              <li key={i} style={styles.connectionItem}>
                <button
                  type="button"
                  style={styles.connectionButton}
                  onClick={() => openMirror(conn)}
                  title="Open live mirror"
                >
                  <span style={styles.connectionDot} />
                  <span style={styles.connectionLabel}>Peer {i + 1}</span>
                </button>
                <button
                  type="button"
                  style={styles.closeConnBtn}
                  onClick={(e) => { e.stopPropagation(); closeConnection(conn); }}
                  aria-label="Close connection"
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* QR modal */}
      {showQrModal && (
        <div style={styles.overlay} onClick={() => setShowQrModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Scan to connect</span>
              <button type="button" style={styles.popupClose} onClick={() => setShowQrModal(false)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            {error && <p style={styles.errorText}>{error}</p>}
            {qrUrl ? (
              <div style={styles.qrWrap}>
                <QRCodeSVG value={qrUrl} size={200} level="M" />
              </div>
            ) : (
              <p style={styles.qrPreparing}>Preparing QR code…</p>
            )}
            <p style={styles.modalHint}>Open the link on the other device</p>
          </div>
        </div>
      )}

      {/* Mirror popup */}
      {mirrorConn && <MirrorPopup conn={mirrorConn} onClose={closeMirror} />}
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
    position: 'relative',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: 0,
    color: '#fafafa',
  },
  sub: {
    margin: 0,
    color: '#737373',
    fontSize: '0.9rem',
    maxWidth: 280,
  },
  actions: {
    position: 'absolute',
    top: 24,
    right: 24,
    display: 'flex',
    gap: 10,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#e5e5e5',
    cursor: 'pointer',
    fontSize: 13,
    transition: 'background 0.15s, border-color 0.15s',
  },
  iconLabel: {
    fontWeight: 500,
  },
  connectionsWrap: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    maxWidth: 260,
  },
  connectionsTitle: {
    display: 'block',
    fontSize: 11,
    color: '#737373',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  connectionsList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  connectionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  connectionButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 0,
    background: 'none',
    border: 'none',
    color: '#e5e5e5',
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#22c55e',
  },
  connectionLabel: {
    fontWeight: 500,
  },
  closeConnBtn: {
    padding: 4,
    background: 'none',
    border: 'none',
    color: '#737373',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 320,
    padding: 24,
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#fafafa',
  },
  popupClose: {
    padding: 6,
    background: 'none',
    border: 'none',
    color: '#a3a3a3',
    cursor: 'pointer',
    display: 'flex',
  },
  errorText: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#f87171',
  },
  qrWrap: {
    padding: 16,
    background: '#fff',
    borderRadius: 12,
    display: 'inline-block',
    marginBottom: 12,
  },
  qrPreparing: {
    margin: '16px 0',
    color: '#737373',
    fontSize: 14,
  },
  modalHint: {
    margin: 0,
    fontSize: 12,
    color: '#737373',
  },
  popup: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
  },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  popupTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fafafa',
  },
  mirrorLabel: {
    display: 'block',
    fontSize: 11,
    color: '#737373',
    marginBottom: 6,
  },
  mirrorTextarea: {
    width: '100%',
    minHeight: 120,
    padding: 12,
    background: '#0f0f0f',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e5e5e5',
    fontSize: 14,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
};

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import { useSync } from '../useSync';
import { PEER_OPTIONS } from '../peerConfig';
import { getStableHostId } from '../utils/stableHostId';
import { QRIcon, CameraIcon, CloseIcon, ConnectIcon } from '../components/Icons';

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
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [hostIdInput, setHostIdInput] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const initRef = useRef(false);
  const outgoingPeersRef = useRef(new Map());

  const startHost = useCallback(async () => {
    setError('');
    try {
      const id = getStableHostId();
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

  const connectToHost = useCallback(() => {
    const hostId = hostIdInput.trim();
    if (!hostId) return;
    setConnectError('');
    setConnecting(true);
    const peer = new Peer(getStableHostId(), PEER_OPTIONS);
    peer.on('open', () => {
      const dataConn = peer.connect(hostId, { reliable: true });
      dataConn.on('open', () => {
        outgoingPeersRef.current.set(dataConn, peer);
        setConnections((prev) => [...prev, dataConn]);
        setConnecting(false);
        setHostIdInput('');
        setShowConnectModal(false);
      });
      dataConn.on('close', () => {
        setConnections((prev) => prev.filter((c) => c !== dataConn));
        const p = outgoingPeersRef.current.get(dataConn);
        if (p) {
          outgoingPeersRef.current.delete(dataConn);
          p.destroy();
        }
      });
      dataConn.on('error', () => {
        setConnectError('Connection failed');
        setConnecting(false);
        peer.destroy();
      });
    });
    peer.on('error', (err) => {
      setConnectError(err.message || 'Failed to connect');
      setConnecting(false);
      peer.destroy();
    });
  }, [hostIdInput]);

  const closeConnection = useCallback((conn) => {
    const peer = outgoingPeersRef.current.get(conn);
    if (peer) {
      outgoingPeersRef.current.delete(conn);
      peer.destroy();
    }
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

      {/* Bottom left: all actions in one column */}
      <div style={styles.connectionsWrap}>
        <div style={styles.actionsColumn}>
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
          <div style={styles.connectIconRow}>
            <button
              type="button"
              style={styles.iconBtn}
              onClick={() => { setShowConnectModal(true); setConnectError(''); }}
              title="Connect to peer"
              aria-label="Connect to peer"
            >
              <ConnectIcon />
            </button>
            {connections.length > 0 && (
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
                    <span style={styles.connectionLabel} title={conn.peer}>
                      {conn.peer ? (conn.peer.length > 14 ? `${conn.peer.slice(0, 14)}…` : conn.peer) : `Peer ${i + 1}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    style={styles.closeConnBtn}
                    onClick={(e) => { e.stopPropagation(); closeConnection(conn); }}
                    aria-label="Remove connection"
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </div>

      {/* Connect-to-peer modal */}
      {showConnectModal && (
        <div style={styles.overlay} onClick={() => setShowConnectModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Connect to peer</span>
              <button type="button" style={styles.popupClose} onClick={() => setShowConnectModal(false)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            {connectError && <p style={styles.connectError}>{connectError}</p>}
            <div style={styles.connectRow}>
              <input
                type="text"
                style={styles.hostInput}
                value={hostIdInput}
                onChange={(e) => { setHostIdInput(e.target.value); setConnectError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && connectToHost()}
                placeholder="Host ID"
                disabled={connecting}
                aria-label="Host ID"
              />
              <button
                type="button"
                style={styles.connectBtn}
                onClick={connectToHost}
                disabled={connecting || !hostIdInput.trim()}
              >
                {connecting ? '…' : 'Connect'}
              </button>
            </div>
          </div>
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
  actionsColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
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
    maxWidth: 320,
  },
  connectIconRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    width: '100%',
  },
  connectRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 6,
  },
  hostInput: {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#e5e5e5',
    fontSize: 13,
  },
  connectBtn: {
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#e5e5e5',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  connectError: {
    margin: '0 0 8px',
    fontSize: 12,
    color: '#f87171',
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

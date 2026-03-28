import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { usePeer } from '../hooks/usePeer';
import { useVaultSync } from '../hooks/useVaultSync';
import { getJoinUrl } from '../utils/getJoinUrl';
import { getStableHostId, isValidPeerId } from '../utils/stableHostId';
import { CloseIcon } from '../components/Icons';

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/**
 * Dedicated page for P2P connection and vault sync.
 * Starts a peer on mount; stops it on unmount (navigating back to Landing).
 * Enforces max 1 connection at a time.
 */
export default function Connect() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { connections, start, stop, connect, disconnect } = usePeer();
  const { sync: syncVault, getState: getVaultState } = useVaultSync(connections);

  const [qrUrl, setQrUrl] = useState('');
  const [hostIdInput, setHostIdInput] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const hostId = getStableHostId();

  const copyHostId = useCallback(() => {
    navigator.clipboard.writeText(hostId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [hostId]);

  const conn = connections[0] ?? null;
  const { status: syncStatus, added: syncAdded } = getVaultState(conn);

  // On mobile, go straight to scan (user is the scanner, not the host showing QR).
  // Skip redirect if arriving back from scan with ?peerId= already set.
  useEffect(() => {
    if (isMobile && !searchParams.get('peerId')) {
      navigate('/scan', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start peer and prepare QR on mount; stop on unmount.
  useEffect(() => {
    const id = getStableHostId();
    start(id);
    getJoinUrl(id).then(setQrUrl);
    return () => stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate]);

  // Auto-connect when arriving from Scan page via ?peerId=
  const urlPeerId = searchParams.get('peerId');
  useEffect(() => {
    const hostId = urlPeerId?.trim();
    if (!hostId || !isValidPeerId(hostId)) return;
    setSearchParams({}, { replace: true });
    if (connections.length === 0) { isInitiatorRef.current = true; connect(hostId); }
  }, [urlPeerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync once when connection opens — only the joiner initiates.
  const isConnected = !!conn?.open;
  const autoSyncedRef = useRef(false);
  const isInitiatorRef = useRef(false);
  useEffect(() => {
    if (!isConnected || !conn) {
      autoSyncedRef.current = false;
      return;
    }
    if (autoSyncedRef.current || !isInitiatorRef.current) return;
    autoSyncedRef.current = true;
    syncVault(conn);
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectToHost = useCallback(() => {
    const hostId = hostIdInput.trim();
    if (!hostId || connections.length > 0) return;
    setConnectError('');
    setConnecting(true);
    isInitiatorRef.current = true;
    connect(hostId, {
      onOpen: () => {
        setConnecting(false);
        setHostIdInput('');
      },
      onError: (msg) => {
        setConnectError(msg);
        setConnecting(false);
      },
    });
  }, [hostIdInput, connect, connections.length]);

  const peerLabel = conn?.peer
    ? conn.peer.length > 22 ? `${conn.peer.slice(0, 22)}…` : conn.peer
    : 'Peer';

  return (
    <div className="connect-page">
      <button
        type="button"
        className="connect-page__back btn-icon"
        onClick={() => navigate('/')}
        aria-label="Back to home"
      >
        ← Back
      </button>

      <div className="connect-panel">
        {isConnected ? (
          <>
            <div className="connect-panel__header">
              <span className="connect-panel__peer">Connected · {peerLabel}</span>
              <button
                type="button"
                className="btn-close"
                onClick={() => disconnect(conn)}
                aria-label="Disconnect"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="sync-status">
              {syncStatus === 'syncing' && (
                <span className="sync-status__text sync-status__text--syncing">Syncing…</span>
              )}
              {syncStatus === 'done' && (
                <span className="sync-status__text sync-status__text--done">
                  {syncAdded > 0
                    ? `Synced · ${syncAdded} new item${syncAdded !== 1 ? 's' : ''}`
                    : 'Already up to date'}
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="sync-status__text sync-status__text--error">
                  Sync failed — try reconnecting
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="connect-panel__title-row">
              <h2 className="connect-panel__title">Connect</h2>
              <button
                type="button"
                className="connect-host-id"
                onClick={copyHostId}
                title="Click to copy your device ID"
                aria-label="Copy device ID"
              >
                {hostId}
                <span className="connect-host-id__badge">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="connect-section">
              {qrUrl ? (
                <div className="qr-wrap">
                  <QRCodeSVG value={qrUrl} size={180} level="M" />
                </div>
              ) : (
                <p className="qr-preparing">Preparing…</p>
              )}
              <p className="connect-section__hint">Scan on the other device to connect</p>
            </div>

            <div className="connect-section">
              <button
                type="button"
                className="btn-icon"
                onClick={() => navigate('/scan')}
              >
                Scan QR code
              </button>
            </div>

            <div className="connect-section">
              {connectError && <p className="connect-error">{connectError}</p>}
              <div className="connect-form">
                <input
                  type="text"
                  className="connect-input"
                  value={hostIdInput}
                  onChange={(e) => { setHostIdInput(e.target.value); setConnectError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && connectToHost()}
                  placeholder="Host ID"
                  disabled={connecting}
                  aria-label="Host ID"
                />
                <button
                  type="button"
                  className="connect-btn"
                  onClick={connectToHost}
                  disabled={connecting || !hostIdInput.trim()}
                >
                  {connecting ? '…' : 'Connect'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

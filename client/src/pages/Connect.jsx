import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { usePeer } from '../hooks/usePeer';
import { useVaultSync } from '../hooks/useVaultSync';
import { getJoinUrl } from '../utils/getJoinUrl';
import { getStableHostId, isValidPeerId } from '../utils/stableHostId';
import { CloseIcon } from '../components/Icons';
import { generateOtp } from '../utils/otp';
import { getKnownPeers, saveKnownPeer } from '../utils/db';

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
  const [otpInput, setOtpInput] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [otp, setOtp] = useState(() => generateOtp(getStableHostId()));
  const [secsLeft, setSecsLeft] = useState(() => Math.ceil((30000 - (Date.now() % 30000)) / 1000));
  const [knownPeers, setKnownPeers] = useState([]);

  const hostId = getStableHostId();
  const conn = connections[0] ?? null;
  const { status: syncStatus, added: syncAdded, detail: syncDetail } = getVaultState(conn);
  const isConnected = !!conn?.open;

  const isInitiatorRef = useRef(false);
  const autoSyncedRef = useRef(false);
  const otpForConnRef = useRef('');

  const copyHostId = useCallback(() => {
    navigator.clipboard.writeText(hostId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [hostId]);

  // Load known peers on mount.
  useEffect(() => {
    getKnownPeers().then(setKnownPeers);
  }, []);

  // Save peer and refresh list when sync completes.
  useEffect(() => {
    if (syncStatus === 'done' && conn?.peer) {
      saveKnownPeer(conn.peer).then(() => getKnownPeers().then(setKnownPeers));
    }
  }, [syncStatus, conn?.peer]);

  // Rotate OTP every 30 s aligned to window boundary. Stops when connected.
  useEffect(() => {
    if (isConnected) return;
    const updateOtp = () => {
      setOtp(generateOtp(hostId));
      setSecsLeft(30);
    };

    const updateSecs = () => setSecsLeft(Math.ceil((30000 - (Date.now() % 30000)) / 1000));
    const msToNext = 30000 - (Date.now() % 30000);
    let rotateIntervalId;
    const alignTimeoutId = setTimeout(() => {
      updateOtp();
      rotateIntervalId = setInterval(updateOtp, 30000);
    }, msToNext);
    const secIntervalId = setInterval(updateSecs, 1000);
    return () => {
      clearTimeout(alignTimeoutId);
      clearInterval(rotateIntervalId);
      clearInterval(secIntervalId);
    };
  }, [isConnected, hostId]);

  // Keep QR URL in sync with OTP.
  useEffect(() => {
    if (isConnected) return;
    getJoinUrl(hostId, otp).then(setQrUrl);
  }, [otp, isConnected, hostId]);

  // On mobile, go straight to scan (user is the scanner, not the host showing QR).
  // Skip redirect if arriving back from scan with ?peerId= already set.
  useEffect(() => {
    if (isMobile && !searchParams.get('peerId')) {
      navigate('/scan', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start peer on mount; stop on unmount.
  useEffect(() => {
    start(hostId);
    return () => stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate]);

  // Auto-connect when arriving from Scan page via ?peerId=&otp=
  const urlPeerId = searchParams.get('peerId');
  const urlOtp = searchParams.get('otp');
  useEffect(() => {
    const targetId = urlPeerId?.trim();
    if (!targetId || !isValidPeerId(targetId)) return;
    setSearchParams({}, { replace: true });
    if (connections.length === 0) {
      otpForConnRef.current = urlOtp || '';
      isInitiatorRef.current = true;
      connect(targetId);
    }
  }, [urlPeerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync once when connection opens — only the initiator fires.
  useEffect(() => {
    if (!isConnected || !conn) {
      autoSyncedRef.current = false;
      return;
    }
    if (autoSyncedRef.current || !isInitiatorRef.current) return;
    autoSyncedRef.current = true;
    syncVault(conn, otpForConnRef.current);
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectToHost = useCallback(() => {
    const targetId = hostIdInput.trim();
    const code = otpInput.trim();
    if (!targetId || code.length !== 4 || connections.length > 0) return;
    setConnectError('');
    setConnecting(true);
    otpForConnRef.current = code;
    isInitiatorRef.current = true;
    connect(targetId, {
      onOpen: () => {
        setConnecting(false);
        setHostIdInput('');
        setOtpInput('');
      },
      onError: (msg) => {
        setConnectError(msg);
        setConnecting(false);
      },
    });
  }, [hostIdInput, otpInput, connect, connections.length]);

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
                <span className="sync-status__text sync-status__text--syncing">{syncDetail || 'Syncing…'}</span>
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
              <div className="connect-otp">
                <span className="connect-otp__code">{otp}</span>
                <span className="connect-otp__hint">resets in {secsLeft}s</span>
              </div>
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
              <datalist id="known-peers-list">
                {knownPeers.map((p) => <option key={p.hostId} value={p.hostId} />)}
              </datalist>
              <div className="connect-form connect-form--col">
                <div className="connect-form__row">
                  <input
                    type="text"
                    className="connect-input"
                    list="known-peers-list"
                    value={hostIdInput}
                    onChange={(e) => { setHostIdInput(e.target.value); setConnectError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && connectToHost()}
                    placeholder="Host ID"
                    disabled={connecting}
                    aria-label="Host ID"
                  />
                  <input
                    type="text"
                    className="connect-input connect-input--otp"
                    value={otpInput}
                    onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setConnectError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && connectToHost()}
                    placeholder="Code"
                    disabled={connecting}
                    aria-label="Device code"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
                <button
                  type="button"
                  className="connect-btn"
                  onClick={connectToHost}
                  disabled={connecting || !hostIdInput.trim() || otpInput.length !== 4}
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

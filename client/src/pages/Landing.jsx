import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { usePeer } from '../hooks/usePeer';
import { useClipboardPaste } from '../hooks/useClipboardPaste';
import { useDrop } from '../hooks/useDrop';
import { useVaultSync } from '../hooks/useVaultSync';
import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import { getJoinUrl } from '../utils/getJoinUrl';
import { getStableHostId, isValidPeerId } from '../utils/stableHostId';
import { SignalStatusIcon, CameraIcon, CloseIcon, ConnectIcon, PlusIcon, InboxIcon } from '../components/Icons';
import MirrorPopup from '../components/MirrorPopup';
import AddUnitModal from '../components/AddUnitModal';
import UnitsOverlay from '../components/UnitsOverlay';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { peer, connections, error, start, stop, connect, disconnect } = usePeer();
  const { sync: syncVault, getState: getVaultState } = useVaultSync(connections);

  const [qrUrl, setQrUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [mirrorConn, setMirrorConn] = useState(null);
  // null = closed, object = open (may contain initial values for pre-population)
  const [addUnitInitial, setAddUnitInitial] = useState(null);
  const [showUnitsOverlay, setShowUnitsOverlay] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [hostIdInput, setHostIdInput] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const isAnyModalOpen = addUnitInitial !== null || showUnitsOverlay || showQrModal || showConnectModal;

  const openAddUnit = useCallback((initial = {}) => {
    setAddUnitInitial(initial);
  }, []);

  const closeAddUnit = useCallback(() => setAddUnitInitial(null), []);

  // Cmd/Ctrl+V anywhere on the page opens the add modal with clipboard content
  useClipboardPaste(openAddUnit, { disabled: isAnyModalOpen });

  // Drop files or text onto the page to open the add modal
  const isDragging = useDrop(openAddUnit, { disabled: isAnyModalOpen });

  // Start hosting when the QR modal opens; skip if peer already running.
  useEffect(() => {
    if (!showQrModal || peer) return;
    const id = getStableHostId();
    getJoinUrl(id).then(setQrUrl);
    start(id);
  }, [showQrModal, peer, start]);

  // Open AddUnit modal when arriving from Share Target API (?pendingShare=1).
  const hasPendingShare = searchParams.has('pendingShare');
  useEffect(() => {
    if (!hasPendingShare) return;
    setSearchParams({}, { replace: true });
    readPendingShare().then((share) => {
      if (share) {
        clearPendingShare();
        openAddUnit(share);
      }
    });
  }, [hasPendingShare]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect when arriving with ?peerId= (e.g. from Scan or QR link).
  const urlPeerId = searchParams.get('peerId');
  useEffect(() => {
    const hostId = urlPeerId?.trim();
    if (!hostId || !isValidPeerId(hostId)) return;
    setSearchParams({}, { replace: true });
    connect(hostId);
  }, [urlPeerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectToHost = useCallback(() => {
    const hostId = hostIdInput.trim();
    if (!hostId) return;
    setConnectError('');
    setConnecting(true);
    connect(hostId, {
      onOpen: () => {
        setConnecting(false);
        setHostIdInput('');
        setShowConnectModal(false);
      },
      onError: (msg) => {
        setConnectError(msg);
        setConnecting(false);
      },
    });
  }, [hostIdInput, connect]);

  const stopHost = useCallback(() => {
    stop();
    setQrUrl('');
    setShowQrModal(false);
  }, [stop]);

  const handleCloseConnection = useCallback(
    (conn) => {
      disconnect(conn);
      if (mirrorConn === conn) setMirrorConn(null);
    },
    [disconnect, mirrorConn]
  );

  const isHostActive = !!peer;

  return (
    <div className={`landing${isDragging ? ' landing--dragging' : ''}`}>
      {isDragging && <div className="drop-hint">Drop to add</div>}

      <div className="landing__center">
        <h1 className="landing__title">Instant Mirror</h1>
        <p className="landing__sub">One scan. No buttons. Data stays on your Wi‑Fi.</p>
      </div>

      <div className="landing__actions-wrap">
        <div className="landing__actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => openAddUnit()}
            title="Add"
            aria-label="Add"
          >
            <PlusIcon />
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => setShowUnitsOverlay(true)}
            title="Saved"
            aria-label="Saved"
          >
            <InboxIcon />
          </button>

          <button
            type="button"
            className={`btn-icon${isHostActive ? ' btn-icon--active' : ''}`}
            onClick={() => (isHostActive ? stopHost() : setShowQrModal(true))}
            title={isHostActive ? 'Stop hosting' : 'Show QR code'}
            aria-label={isHostActive ? 'Stop hosting' : 'Show QR code'}
          >
            <SignalStatusIcon connected={isHostActive} />
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => navigate('/scan')}
            title="Scan to join"
            aria-label="Scan to join"
          >
            <CameraIcon />
          </button>

          <div className="landing__conn-row">
            <button
              type="button"
              className="btn-icon"
              onClick={() => { setShowConnectModal(true); setConnectError(''); }}
              title="Connect to peer"
              aria-label="Connect to peer"
            >
              <ConnectIcon />
            </button>

            {connections.length > 0 && (
              <ul className="connections-list">
                {connections.map((conn, i) => (
                  <li key={i} className="connection-item">
                    <button
                      type="button"
                      className="connection-btn"
                      onClick={() => setMirrorConn(conn)}
                      title="Open live mirror"
                    >
                      <span className="connection-dot" />
                      <span className="connection-label" title={conn.peer}>
                        {conn.peer
                          ? conn.peer.length > 14 ? `${conn.peer.slice(0, 14)}…` : conn.peer
                          : `Peer ${i + 1}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-conn-close"
                      onClick={(e) => { e.stopPropagation(); handleCloseConnection(conn); }}
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
        <div className="overlay" onClick={() => setShowConnectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <span className="modal__title">Connect to peer</span>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowConnectModal(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
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
        </div>
      )}

      {/* QR modal */}
      {showQrModal && (
        <div className="overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <span className="modal__title">Scan to connect</span>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowQrModal(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            {error && <p className="modal__error">{error}</p>}
            {qrUrl ? (
              <div className="qr-wrap">
                <QRCodeSVG value={qrUrl} size={200} level="M" />
              </div>
            ) : (
              <p className="qr-preparing">Preparing QR code…</p>
            )}
            <p className="modal__hint">Open the link on the other device</p>
          </div>
        </div>
      )}

      {mirrorConn && (
        <MirrorPopup
          conn={mirrorConn}
          onClose={() => setMirrorConn(null)}
          onSyncVault={() => syncVault(mirrorConn)}
          vaultSyncState={getVaultState(mirrorConn)}
        />
      )}

      {addUnitInitial !== null && (
        <AddUnitModal
          onClose={closeAddUnit}
          initialType={addUnitInitial.type}
          initialContent={addUnitInitial.content}
          initialFileName={addUnitInitial.fileName}
          initialMimeType={addUnitInitial.mimeType}
        />
      )}

      {showUnitsOverlay && <UnitsOverlay onClose={() => setShowUnitsOverlay(false)} />}
    </div>
  );
}

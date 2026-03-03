import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { usePeer } from '../hooks/usePeer';
import { useSync } from '../hooks/useSync';
import { getStableHostId } from '../utils/stableHostId';
import { getJoinUrl } from '../utils/getJoinUrl';

// Host view: shows QR code and a live mirror textarea.
// Auto-starts on mount; the other device scans the QR to join.
export default function Host() {
  const { connections, error, start } = usePeer();
  const [qrUrl, setQrUrl] = useState('');
  const [localContent, setLocalContent] = useState('');

  const conn = connections[0] ?? null;
  const [state, push] = useSync(conn, { content: '' });

  // Push local content to newly opened connection
  const sentInitial = useRef(false);
  useEffect(() => {
    if (!conn?.open || sentInitial.current) return;
    sentInitial.current = true;
    push({ content: localContent });
  }, [conn?.open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = getStableHostId();
    getJoinUrl(id).then(setQrUrl);
    start(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateContent = useCallback(
    (content) => {
      setLocalContent(content);
      push({ ...state, content });
    },
    [state, push]
  );

  const displayContent = conn ? state.content : localContent;

  if (!qrUrl) {
    return (
      <div className="host">
        <p className="host__sub">{error || 'Preparing QR code…'}</p>
      </div>
    );
  }

  return (
    <div className="host">
      <h1 className="host__title">Scan to connect</h1>
      <p className="host__sub">Open this URL on your phone — no camera needed here</p>
      <div className="qr-wrap">
        <QRCodeSVG value={qrUrl} size={220} level="M" />
      </div>
      {error && <p className="host__error">{error}</p>}
      <div className="host__mirror">
        <label className="host__mirror-label">Mirror (live)</label>
        <textarea
          className="host__mirror-textarea"
          value={displayContent}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Type here — it syncs to the other device"
        />
      </div>
    </div>
  );
}

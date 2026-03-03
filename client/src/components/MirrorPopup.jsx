import { useCallback } from 'react';
import { useSync } from '../hooks/useSync';
import { CloseIcon } from './Icons';

/**
 * Floating popup for live text mirroring over a DataConnection.
 * Uses useSync internally so the caller only needs to pass the connection.
 */
export default function MirrorPopup({ conn, onClose }) {
  const [state, push] = useSync(conn, { content: '' });

  const updateContent = useCallback(
    (content) => push({ ...state, content }),
    [state, push]
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup__header">
          <span className="popup__title">Live mirror</span>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <label className="mirror__label">Type here — it syncs to the other device</label>
        <textarea
          className="mirror__textarea"
          value={state?.content ?? ''}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Type here…"
          disabled={!conn?.open}
        />
      </div>
    </div>
  );
}

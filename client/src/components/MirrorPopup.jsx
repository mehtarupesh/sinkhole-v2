import { useCallback } from 'react';
import { useSync } from '../hooks/useSync';
import { CloseIcon } from './Icons';

function syncLabel(status, added) {
  if (status === 'syncing') return 'Syncing…';
  if (status === 'error') return 'Sync failed';
  if (status === 'done') return added > 0 ? `Synced · ${added} added` : 'Already in sync';
  return 'Sync vault';
}

/**
 * Floating popup for live text mirroring over a DataConnection.
 * Vault sync is managed by the parent (Landing) so listeners are always active
 * regardless of whether this popup is open — both peers can receive at any time.
 */
export default function MirrorPopup({ conn, onClose, onSyncVault, vaultSyncState }) {
  const [state, push] = useSync(conn, { content: '' });
  const { status, added } = vaultSyncState ?? { status: 'idle', added: 0 };

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
        <div className="mirror-sync">
          <button
            type="button"
            className="mirror-sync__btn"
            onClick={onSyncVault}
            disabled={!conn?.open || status === 'syncing'}
          >
            {syncLabel(status, added)}
          </button>
        </div>
      </div>
    </div>
  );
}

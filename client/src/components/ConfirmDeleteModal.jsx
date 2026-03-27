import { CloseIcon } from './Icons';

function downloadBackup(units) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const data = { version: 3, exportedAt: Date.now(), units };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sinkhole-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Confirmation dialog for destructive deletes.
 * title       — e.g. "Delete 3 items?"
 * exportUnits — Unit[] to offer as a backup download (omit to hide the option)
 * onConfirm   — called when user confirms deletion
 * onCancel    — called when user cancels (or clicks backdrop)
 */
export default function ConfirmDeleteModal({ title, exportUnits, onConfirm, onCancel }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button type="button" className="btn-close" onClick={onCancel} aria-label="Cancel">
            <CloseIcon />
          </button>
        </div>

        <p className="modal__hint">This cannot be undone.</p>

        {exportUnits?.length > 0 && (
          <button
            type="button"
            className="btn-primary confirm-delete__export-btn"
            onClick={() => downloadBackup(exportUnits)}
          >
            Export backup first
          </button>
        )}

        <div className="confirm-delete__footer">
          <button type="button" className="btn-primary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClipboardPaste } from '../hooks/useClipboardPaste';
import { useDrop } from '../hooks/useDrop';
import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import { PlusIcon, InboxIcon, ConnectIcon } from '../components/Icons';
import AddUnitModal from '../components/AddUnitModal';
import UnitsOverlay from '../components/UnitsOverlay';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [addUnitInitial, setAddUnitInitial] = useState(null);
  const [showUnitsOverlay, setShowUnitsOverlay] = useState(false);

  const isAnyModalOpen = addUnitInitial !== null || showUnitsOverlay;

  const openAddUnit = useCallback((initial = {}) => setAddUnitInitial(initial), []);
  const closeAddUnit = useCallback(() => setAddUnitInitial(null), []);

  // Cmd/Ctrl+V anywhere on the page opens the add modal with clipboard content
  useClipboardPaste(openAddUnit, { disabled: isAnyModalOpen });

  // Drop files or text onto the page to open the add modal
  const isDragging = useDrop(openAddUnit, { disabled: isAnyModalOpen });

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
            className="btn-icon"
            onClick={() => navigate('/connect')}
            title="Connect"
            aria-label="Connect"
          >
            <ConnectIcon />
          </button>
        </div>
      </div>

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

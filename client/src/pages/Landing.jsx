import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClipboardPaste } from '../hooks/useClipboardPaste';
import { useDrop } from '../hooks/useDrop';
import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import { PlusIcon, InboxIcon, ConnectIcon, GearIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';
import { getAllUnits, deleteUnit } from '../utils/db';
import { buildCarousels } from '../utils/carouselGroups';
import AddUnitModal from '../components/AddUnitModal';
import UnitsOverlay from '../components/UnitsOverlay';
import PrototypeModal from '../components/PrototypeModal';
import SettingsModal from '../components/SettingsModal';
import Carousel from '../components/Carousel';
import UnitDetail from '../components/UnitDetail';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [addUnitInitial, setAddUnitInitial] = useState(null);
  const [showUnitsOverlay, setShowUnitsOverlay] = useState(false);
  const [showPrototypeModal, setShowPrototypeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [units, setUnits] = useState([]);
  // selectedCtx: { units: Unit[], index: number } | null
  const [selectedCtx, setSelectedCtx] = useState(null);

  const isAnyModalOpen = addUnitInitial !== null || showUnitsOverlay || selectedCtx !== null;

  const reloadUnits = useCallback(() => {
    getAllUnits().then(setUnits);
  }, []);

  useEffect(() => { reloadUnits(); }, [reloadUnits]);

  const openAddUnit = useCallback((initial = {}) => setAddUnitInitial(initial), []);
  const closeAddUnit = useCallback(() => {
    setAddUnitInitial(null);
    reloadUnits();
  }, [reloadUnits]);

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

  const carousels = useMemo(() => buildCarousels(units), [units]);
  const hasUnits = units.length > 0;

  // ── Unit detail navigation ─────────────────────────────────────────────────

  const currentUnit = selectedCtx ? selectedCtx.units[selectedCtx.index] : null;
  const hasPrev = selectedCtx ? selectedCtx.index > 0 : false;
  const hasNext = selectedCtx ? selectedCtx.index < selectedCtx.units.length - 1 : false;

  const openUnit = useCallback((unit, ctxUnits, index) => {
    setSelectedCtx({ units: ctxUnits, index });
  }, []);

  const closeDetail = useCallback(() => setSelectedCtx(null), []);

  const goPrev = useCallback(() => {
    setSelectedCtx((ctx) => (ctx && ctx.index > 0 ? { ...ctx, index: ctx.index - 1 } : ctx));
  }, []);

  const goNext = useCallback(() => {
    setSelectedCtx((ctx) => (ctx && ctx.index < ctx.units.length - 1 ? { ...ctx, index: ctx.index + 1 } : ctx));
  }, []);

  // Keyboard: Escape closes, ArrowLeft/Right navigates
  useEffect(() => {
    if (!selectedCtx) return;
    const handler = (e) => {
      if (e.key === 'Escape') closeDetail();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCtx, closeDetail, goPrev, goNext]);

  // Touch swipe: horizontal delta > 50px navigates
  const touchStartX = useRef(null);
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta > 50) goPrev();
    else if (delta < -50) goNext();
  }, [goPrev, goNext]);

  const handleUnitSaved = useCallback((updated) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedCtx(null);
  }, []);

  const handleUnitDelete = useCallback(async (id) => {
    await deleteUnit(id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setSelectedCtx(null);
  }, []);

  return (
    <div className={`landing${isDragging ? ' landing--dragging' : ''}${hasUnits ? ' landing--has-units' : ''}`}>
      {isDragging && <div className="drop-hint">Drop to add</div>}

      <div className="landing__center">
        <h1 className="landing__title">1Burrow</h1>
        <p className="landing__sub">Stash now | Forage later</p>
      </div>

      {carousels.length > 0 && (
        <div className="landing__carousels">
          {carousels.map((c) => (
            <Carousel
              key={c.id}
              title={c.title}
              units={c.units}
              onUnitClick={openUnit}
            />
          ))}
        </div>
      )}

      <div className="landing__actions-wrap">
        <div className="landing__actions">
          <button type="button" className="btn-icon" onClick={() => openAddUnit()} title="Add" aria-label="Add">
            <PlusIcon />
          </button>
          <button type="button" className="btn-icon" onClick={() => setShowUnitsOverlay(true)} title="Saved" aria-label="Saved">
            <InboxIcon />
          </button>
          <button type="button" className="btn-icon" onClick={() => navigate('/connect')} title="Connect" aria-label="Connect">
            <ConnectIcon />
          </button>
        </div>
        <div className="landing__actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn-icon" onClick={() => setShowSettingsModal(true)} title="Settings" aria-label="Settings">
            <GearIcon />
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

      {selectedCtx && currentUnit && (
        <div className="overlay units-overlay" onClick={closeDetail}>
          <div
            className="unit-detail-wrap"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="units-panel">
              <UnitDetail
                key={currentUnit.id}
                unit={currentUnit}
                onBack={closeDetail}
                onSaved={handleUnitSaved}
                onDelete={handleUnitDelete}
              />
            </div>
            <div className="unit-detail-nav" data-testid="unit-detail-nav">
              <button
                type="button"
                className="btn-icon"
                onClick={goPrev}
                disabled={!hasPrev}
                aria-label="Previous"
              >
                <ChevronLeftIcon />
              </button>
              <span className="unit-detail-nav__count">
                {selectedCtx.index + 1} / {selectedCtx.units.length}
              </span>
              <button
                type="button"
                className="btn-icon"
                onClick={goNext}
                disabled={!hasNext}
                aria-label="Next"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnitsOverlay && <UnitsOverlay onClose={() => { setShowUnitsOverlay(false); reloadUnits(); }} />}
      {showPrototypeModal && <PrototypeModal onClose={() => setShowPrototypeModal(false)} />}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
}

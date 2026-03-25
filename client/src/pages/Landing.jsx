import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClipboardPaste } from '../hooks/useClipboardPaste';
import { useDrop } from '../hooks/useDrop';
import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import { SearchIcon, ConnectIcon, GearIcon, OneBIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../components/Icons';
import { getAllUnits, deleteUnit, getSetting, getCategorization, setCategorization } from '../utils/db';
import { buildCarousels } from '../utils/carouselGroups';
import { categorizeUnits } from '../utils/categorize';
import AddUnitModal from '../components/AddUnitModal';
import UnitsOverlay from '../components/UnitsOverlay';
import PrototypeModal from '../components/PrototypeModal';
import SettingsModal from '../components/SettingsModal';
import Carousel from '../components/Carousel';
import UnitDetail from '../components/UnitDetail';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [addUnitInitial, setAddUnitInitial]     = useState(null);
  const [showUnitsOverlay, setShowUnitsOverlay] = useState(false);
  const [showPrototypeModal, setShowPrototypeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal]   = useState(false);
  const [units, setUnits]             = useState([]);
  // undefined = still loading from DB, null = loaded but none saved, array = loaded groups
  const [storedGroups, setStoredGroups] = useState(undefined);
  const [categorizing, setCategorizing] = useState(false);
  const [toast, setToast]               = useState(null);
  // selectedCtx: { units: Unit[], index: number } | null
  const [selectedCtx, setSelectedCtx]   = useState(null);

  const isAnyModalOpen = addUnitInitial !== null || showUnitsOverlay || selectedCtx !== null;

  // Push unit-detail overlay above the virtual keyboard on iOS
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Keep a ref so runCategorize always reads current units without needing them as a dep
  const unitsRef        = useRef([]);
  unitsRef.current      = units;
  const isCategorizing  = useRef(false);

  const reloadUnits = useCallback(() => {
    getAllUnits().then(setUnits);
  }, []);

  // ── Add unit ─────────────────────────────────────────────────────────────────
  // (defined early so handleCategoryAssign can reference it)

  const handleCategoryAssign = useCallback((uid, categoryId) => {
    setStoredGroups((prev) => {
      if (!prev || !uid) return prev;
      const updated = prev.map((g) => ({
        ...g,
        uids: g.id === categoryId
          ? [...g.uids.filter((u) => u !== uid), uid]
          : g.uids.filter((u) => u !== uid),
      }));
      setCategorization(updated); // async, fire-and-forget
      return updated;
    });
  }, []);

  // ── Categorize ──────────────────────────────────────────────────────────────

  // Core categorize logic — takes units explicitly so it can be called at mount
  // with freshly-loaded data before state has settled.
  const runCategorize = useCallback(async (us) => {
    if (isCategorizing.current) return;
    isCategorizing.current = true;
    setCategorizing(true);
    try {
      const apiKey = await getSetting('gemini_key');
      if (!apiKey) throw new Error('No Gemini API key. Add one in Settings ⚙');
      const carousels = await categorizeUnits(us, apiKey);
      // Store only LLM groups (no Recent / needs-context — those are always computed fresh)
      const groups = carousels
        .filter((c) => c.id !== 'recent' && c.id !== 'needs-context')
        .map((c) => ({ id: c.id, title: c.title, uids: c.units.map((u) => u.uid) }));
      await setCategorization(groups);
      setStoredGroups(groups);
    } catch (e) {
      setToast(e.message ?? 'Categorization failed.');
    } finally {
      setCategorizing(false);
      isCategorizing.current = false;
    }
  }, []); // stable — units always passed as arg

  const handleCategorize = useCallback(() => {
    runCategorize(unitsRef.current);
  }, [runCategorize]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getAllUnits(), getCategorization()]).then(([loadedUnits, stored]) => {
      setUnits(loadedUnits);
      const groups = stored ?? null;
      setStoredGroups(groups);
      // Auto-categorize if no stored groups and there's something to categorize
      if (!groups && loadedUnits.length > 0) {
        runCategorize(loadedUnits);
      }
    });
  }, [runCategorize]);

  // ── Toast auto-dismiss ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Add unit ────────────────────────────────────────────────────────────────

  const openAddUnit = useCallback((initial = {}) => setAddUnitInitial(initial), []);
  const closeAddUnit = useCallback(() => setAddUnitInitial(null), []);
  const handleAddUnitSaved = useCallback((uid, categoryId) => {
    reloadUnits();
    if (uid && categoryId) handleCategoryAssign(uid, categoryId);
  }, [reloadUnits, handleCategoryAssign]);

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

  const carousels = useMemo(
    () => buildCarousels(units, storedGroups ?? null),
    [units, storedGroups]
  );
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

const handleUnitSaved = useCallback((updated, categoryId) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (updated.uid) handleCategoryAssign(updated.uid, categoryId);
    setSelectedCtx(null);
  }, [handleCategoryAssign]);

  const handleUnitDelete = useCallback(async (id) => {
    await deleteUnit(id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setSelectedCtx(null);
  }, []);

  return (
    <div className={`landing${isDragging ? ' landing--dragging' : ''}${hasUnits ? ' landing--has-units' : ''}`}>
      {isDragging && <div className="drop-hint">Drop to add</div>}

      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button type="button" className="toast__close" onClick={() => setToast(null)} aria-label="Dismiss">
            <CloseIcon />
          </button>
        </div>
      )}

      <div className="landing__center">
        <h1 className="landing__title">
          <span className="landing__title-one">1</span>
          <span className="landing__title-b">b</span>urrow
        </h1>
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
              onAddClick={c.id === 'recent' ? () => openAddUnit() : undefined}
            />
          ))}
        </div>
      )}

      <div className="landing__actions-wrap">
        <div className="landing__actions">
        <button type="button" className="btn-icon" onClick={() => navigate('/connect')} title="Connect" aria-label="Connect">
            <ConnectIcon />
          </button>
<button type="button" className="btn-icon" onClick={() => setShowUnitsOverlay(true)} title="Saved" aria-label="Saved">
            <SearchIcon />
          </button>
          <button
            type="button"
            className={`btn-icon btn-categorize${categorizing ? ' btn-categorize--loading' : ''}`}
            onClick={handleCategorize}
            disabled={categorizing || !hasUnits}
            title="Categorize"
            aria-label="Categorize"
          >
            <OneBIcon />
          </button>
          <button type="button" className="btn-icon" onClick={() => setShowSettingsModal(true)} title="Settings" aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </div>

      {addUnitInitial !== null && (
        <AddUnitModal
          onClose={closeAddUnit}
          onSaved={handleAddUnitSaved}
          storedGroups={storedGroups ?? []}
          initialType={addUnitInitial.type}
          initialContent={addUnitInitial.content}
          initialFileName={addUnitInitial.fileName}
          initialMimeType={addUnitInitial.mimeType}
        />
      )}

      {selectedCtx && currentUnit && (
        <div
          className="overlay units-overlay"
          onClick={closeDetail}
          style={keyboardOffset > 0 ? { paddingBottom: keyboardOffset + 24 } : undefined}
        >
          <div
            className="unit-detail-wrap"
            onClick={(e) => e.stopPropagation()}

          >
            <div className="units-panel">
              <UnitDetail
                key={currentUnit.id}
                unit={currentUnit}
                onBack={closeDetail}
                onSaved={handleUnitSaved}
                onDelete={handleUnitDelete}
                storedGroups={storedGroups ?? []}
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

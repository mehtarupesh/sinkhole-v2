import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClipboardPaste } from '../hooks/useClipboardPaste';
import { useDrop } from '../hooks/useDrop';
import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import { SearchIcon, ConnectIcon, GearIcon, OneBIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, TrashIcon, ShareIcon, MoveFolderIcon, RenameIcon, AiChatIcon } from '../components/Icons';
import { getAllUnits, deleteUnit, getSetting, getCategorization, setCategorization } from '../utils/db';
import { buildCarousels, withMiscGroup, MISC_ID } from '../utils/carouselGroups';
import { categorizeUnits } from '../utils/categorize';
import AddUnitModal from '../components/AddUnitModal';
import UnitsOverlay from '../components/UnitsOverlay';
import PrototypeModal from '../components/PrototypeModal';
import SettingsModal from '../components/SettingsModal';
import Carousel from '../components/Carousel';
import CategoryCloud from '../components/CategoryCloud';
import UnitDetail from '../components/UnitDetail';
import SelectionBar from '../components/SelectionBar';
import { useSelection } from '../hooks/useSelection';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [addUnitInitial, setAddUnitInitial]     = useState(null);
  const [showUnitsOverlay, setShowUnitsOverlay] = useState(false);
  const [unitsOverlayCategory, setUnitsOverlayCategory] = useState('');
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

  // ── Selection (cards + categories) ──────────────────────────────────────────
  const cardSel = useSelection();
  const catSel  = useSelection();
  const isSelecting = cardSel.isSelecting || catSel.isSelecting;

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

      if (groups) {
        const liveUids = new Set(loadedUnits.map((u) => u.uid));
        const cleaned = groups
          .map((g) => ({ ...g, uids: g.uids.filter((uid) => liveUids.has(uid)) }))
          .filter((g) => g.uids.length > 0);
        if (cleaned.length !== groups.length || cleaned.some((g, i) => g.uids.length !== groups[i].uids.length)) {
          setCategorization(cleaned);
        }
        setStoredGroups(cleaned);
      } else {
        setStoredGroups(groups);
      }
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
  const handleAddUnitSaved = useCallback((uid, categoryId, newCategory) => {
    reloadUnits();
    if (newCategory) {
      // Create the AI-suggested category then assign the unit to it
      setStoredGroups((prev) => {
        const groups = [...(prev ?? []), { ...newCategory, uids: [] }];
        setCategorization(groups); // fire-and-forget
        return groups;
      });
    }
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

  const recentCarousel = useMemo(() => carousels.find((c) => c.id === 'recent') ?? null, [carousels]);

  // displayGroups = storedGroups + virtual Misc group (never persisted).
  const displayGroups = useMemo(
    () => storedGroups ? withMiscGroup(units, storedGroups) : [],
    [units, storedGroups]
  );

  const openUnitsOverlayWithCategory = useCallback((categoryId) => {
    setUnitsOverlayCategory(categoryId);
    setShowUnitsOverlay(true);
  }, []);

  // ── Unit detail navigation ─────────────────────────────────────────────────

  const currentUnit = selectedCtx ? selectedCtx.units[selectedCtx.index] : null;
  const hasPrev = selectedCtx ? selectedCtx.index > 0 : false;
  const hasNext = selectedCtx ? selectedCtx.index < selectedCtx.units.length - 1 : false;

  const openUnit = useCallback((unit, ctxUnits, index) => {
    setSelectedCtx({ units: ctxUnits, index });
  }, []);

  const closeDetail = useCallback(() => setSelectedCtx(null), []);

  // ── Selection handlers (defined after openUnit to avoid TDZ) ────────────────

  // Long press on a carousel card: clear category selection, enter card selection
  const handleCardLongPress = useCallback((unit) => {
    catSel.clear();
    cardSel.enterWith(unit.id);
  }, [cardSel, catSel]);

  // Long press on a category pill: clear card selection, enter category selection
  const handleCategoryLongPress = useCallback((id) => {
    cardSel.clear();
    catSel.enterWith(id);
  }, [cardSel, catSel]);

  // Tap a card: toggle when selecting, open detail otherwise
  const handleCarouselUnitClick = useCallback((unit, ctxUnits, i) => {
    if (cardSel.isSelecting) { cardSel.toggle(unit.id); return; }
    openUnit(unit, ctxUnits, i);
  }, [cardSel, openUnit]);

  // Tap a category pill: toggle when selecting, open overlay otherwise
  const handleCategoryClick = useCallback((id) => {
    if (catSel.isSelecting) { catSel.toggle(id); return; }
    openUnitsOverlayWithCategory(id);
  }, [catSel, openUnitsOverlayWithCategory]);

  const clearAllSelection = useCallback(() => {
    cardSel.clear();
    catSel.clear();
  }, [cardSel, catSel]);

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
    const deletedUnit = units.find((u) => u.id === id);
    await deleteUnit(id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    if (deletedUnit?.uid) {
      setStoredGroups((prev) => {
        if (!prev) return prev;
        const cleaned = prev
          .map((g) => ({ ...g, uids: g.uids.filter((uid) => uid !== deletedUnit.uid) }))
          .filter((g) => g.uids.length > 0);
        setCategorization(cleaned);
        return cleaned;
      });
    }
    setSelectedCtx(null);
  }, [units]);

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

      {recentCarousel && (
        <div className="landing__carousels">
          <Carousel
            key="recent"
            title={recentCarousel.title}
            units={recentCarousel.units}
            onUnitClick={handleCarouselUnitClick}
            selected={cardSel.selected}
            onCardLongPress={handleCardLongPress}
          />
        </div>
      )}

      {storedGroups && displayGroups.length > 0 && (
        <CategoryCloud
          storedGroups={displayGroups}
          onCategoryClick={handleCategoryClick}
          selected={catSel.selected}
          onCategoryLongPress={handleCategoryLongPress}
        />
      )}

      {isSelecting ? (
        <SelectionBar
          count={cardSel.isSelecting ? cardSel.selected.size : catSel.selected.size}
          total={cardSel.isSelecting ? units.length : displayGroups.length}
          onSelectAll={() => {
            if (cardSel.isSelecting) cardSel.selectAll(units.map((u) => u.id));
            else catSel.selectAll(displayGroups.map((g) => g.id));
          }}
          onClear={clearAllSelection}
          actions={cardSel.isSelecting ? [
            {
              icon: <TrashIcon />,
              label: 'Delete',
              onClick: () => setToast(`Delete ${cardSel.selected.size} item${cardSel.selected.size !== 1 ? 's' : ''} — coming soon`),
            },
            {
              icon: <ShareIcon />,
              label: 'Share',
              onClick: () => setToast(`Share ${cardSel.selected.size} item${cardSel.selected.size !== 1 ? 's' : ''} — coming soon`),
            },
            {
              icon: <MoveFolderIcon />,
              label: 'Move to Category',
              onClick: () => setToast('Move to Category — coming soon'),
            },
          ] : [
            {
              icon: <TrashIcon />,
              label: 'Delete',
              onClick: () => setToast(`Delete ${catSel.selected.size} categor${catSel.selected.size !== 1 ? 'ies' : 'y'} — coming soon`),
            },
            {
              icon: <ShareIcon />,
              label: 'Share',
              onClick: () => setToast(`Share ${catSel.selected.size} categor${catSel.selected.size !== 1 ? 'ies' : 'y'} — coming soon`),
            },
            {
              icon: <RenameIcon />,
              label: 'Rename',
              onClick: () => {
                if (catSel.selected.size !== 1) { setToast('Select exactly 1 category to rename'); return; }
                if (catSel.selected.has(MISC_ID)) { setToast('Misc cannot be renamed'); return; }
                setToast('Rename — coming soon');
              },
            },
            {
              icon: <AiChatIcon />,
              label: 'AI Chat',
              onClick: () => {
                if (catSel.selected.size !== 1) { setToast('Select exactly 1 category for AI Chat'); return; }
                setToast('AI Chat — coming soon');
              },
            },
          ]}
        />
      ) : (
        <div className="landing__actions-wrap">
          <div className="landing__actions">
            <button type="button" className="btn-icon" onClick={() => openAddUnit()} title="Add" aria-label="Add">
              <PlusIcon />
            </button>
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
      )}

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

      {showUnitsOverlay && (
        <UnitsOverlay
          initialCategory={unitsOverlayCategory}
          onClose={() => { setShowUnitsOverlay(false); setUnitsOverlayCategory(''); reloadUnits(); }}
        />
      )}
      {showPrototypeModal && <PrototypeModal onClose={() => setShowPrototypeModal(false)} />}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClipboardPaste } from '../hooks/useClipboardPaste';
import { useDrop } from '../hooks/useDrop';
import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import { SearchIcon, ConnectIcon, GearIcon, CloseIcon, PlusIcon, TrashIcon, MoveFolderIcon, RenameIcon, OneBIcon, BroomIcon } from '../components/Icons';
import { getAllUnits, updateUnit, deleteTrashUnit, getCategorization, setCategorization, ensureTrashCategory, getAccessOrder, getTombstones, setSetting, touchUnit, pruneAccessOrder, pruneTombstones } from '../utils/db';
import { getCleanupCandidates } from '../utils/cleanupCandidates';
import { runMigrations } from '../utils/migrations';
import { buildRecentCarousel, withMiscGroup, MISC_ID, TRASH_ID, pruneEmptyCategories, addCategoryIfNew } from '../utils/carouselGroups';
import AddUnitModal from '../components/AddUnitModal';
import MoveToCategoryModal from '../components/MoveToCategoryModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import RenameCategoryModal from '../components/RenameCategoryModal';
import ForageModal from '../components/ForageModal';
import UnitsOverlay from '../components/UnitsOverlay';
import SettingsModal from '../components/SettingsModal';
import Carousel from '../components/Carousel';
import CategoryCloud from '../components/CategoryCloud';
import UnitDetail from '../components/UnitDetail';
import SelectionBar from '../components/SelectionBar';
import CleanupModal from '../components/CleanupModal';
import CategoryView from '../components/CategoryView';
import { useSelection } from '../hooks/useSelection';

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [addUnitInitial, setAddUnitInitial]     = useState(null);
  const [showUnitsOverlay, setShowUnitsOverlay] = useState(false);
  const [unitsOverlayCategory, setUnitsOverlayCategory] = useState('');
  const [showSettingsModal, setShowSettingsModal]   = useState(false);
  const [showForageModal, setShowForageModal]       = useState(false);
  const [units, setUnits]             = useState([]);
  // undefined = still loading from DB, null = loaded but none saved, array = loaded groups
  const [storedGroups, setStoredGroups] = useState(undefined);
  const [accessOrder, setAccessOrder]     = useState([]);
  const [toast, setToast]               = useState(null);
  // selectedCtx: { units: Unit[], index: number } | null
  const [selectedCtx, setSelectedCtx]   = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { title, units, onConfirm }
  const [pendingRename, setPendingRename] = useState(null); // { id, currentTitle } | null

  const [moveCtx, setMoveCtx] = useState(null); // { units: Unit[] } | null
  const [cardForageCtx, setCardForageCtx] = useState(null); // { units: Unit[], category } | null
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [categoryViewCtx, setCategoryViewCtx] = useState(null); // { category } | null

  const isAnyModalOpen = addUnitInitial !== null || showUnitsOverlay || selectedCtx !== null || showForageModal || moveCtx !== null || cardForageCtx !== null || showCleanupModal || categoryViewCtx !== null;

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

  const reloadUnits = useCallback(() => {
    getAllUnits().then(setUnits);
  }, []);

  // ── Add unit ─────────────────────────────────────────────────────────────────

  const handleCategoryRename = useCallback((id, newTitle) => {
    if (newTitle.toLowerCase() === 'trash' || newTitle.toLowerCase() === 'unclassified') { setToast(newTitle + ' name is reserved'); return; }
    setStoredGroups((prev) => {
      if (!prev) return prev;
      const updated = prev.map((g) => (g.id === id ? { ...g, title: newTitle, updatedAt: Date.now() } : g));
      setCategorization(updated);
      return updated;
    });
    catSel.clear();
    setPendingRename(null);
  }, [catSel]);

  const handleBulkMove = useCallback(async (categoryId, newCategory) => {
    if (!moveCtx) return;
    const resolvedCategoryId = categoryId === MISC_ID ? null : categoryId;
    for (const u of moveCtx.units) {
      await updateUnit(u.id, { categoryId: resolvedCategoryId });
    }
    if (newCategory) {
      setStoredGroups((prev) => {
        const groups = addCategoryIfNew(prev, newCategory);
        setCategorization(groups);
        return groups;
      });
    }
    reloadUnits();
    cardSel.clear();
    setMoveCtx(null);
  }, [moveCtx, cardSel, reloadUnits]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    runMigrations()
      .then(() => Promise.all([getAllUnits(), ensureTrashCategory(), getAccessOrder(), getTombstones()]))
      .then(([loadedUnits, groups, order, tombstones]) => {
        const non_empty_groups = pruneEmptyCategories(groups, loadedUnits);
        const prunedOrder = pruneAccessOrder(order, loadedUnits);
        const prunedTombstones = pruneTombstones(tombstones, loadedUnits);
        if (prunedOrder.length !== order.length) setSetting('accessOrder', prunedOrder);
        if (prunedTombstones.length !== tombstones.length) setSetting('tombstones', prunedTombstones);
        if (non_empty_groups.length !== groups.length) setCategorization(non_empty_groups);
        setUnits(loadedUnits);
        setStoredGroups(non_empty_groups);
        setAccessOrder(prunedOrder);
      });
  }, []);

  // ── Toast auto-dismiss ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Add unit ────────────────────────────────────────────────────────────────

  const openAddUnit = useCallback((initial = {}) => setAddUnitInitial(initial), []);
  const closeAddUnit = useCallback(() => setAddUnitInitial(null), []);
  const handleAddUnitSaved = useCallback((newCategory) => {
    reloadUnits();
    if (newCategory && newCategory.id !== TRASH_ID) {
      setStoredGroups((prev) => {
        const groups = addCategoryIfNew(prev, newCategory);
        setCategorization(groups);
        return groups;
      });
    }
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

  const nonTrashUnits = useMemo(() => units.filter((u) => u.categoryId !== TRASH_ID), [units]);

  const cleanupCandidates = useMemo(
    () => getCleanupCandidates(units, accessOrder),
    [units, accessOrder]
  );

  const hasUnits = nonTrashUnits.length > 0;

  const recentCarousel = useMemo(
    () => buildRecentCarousel(nonTrashUnits),
    [nonTrashUnits]
  );

  // displayGroups = storedGroups + virtual Misc group (never persisted).
  const displayGroups = useMemo(
    () => storedGroups ? withMiscGroup(units, storedGroups) : [],
    [units, storedGroups]
  );

  // Groups available for user selection (excludes reserved Trash).
  const selectableGroups = useMemo(
    () => (storedGroups ?? []).filter((g) => g.id !== TRASH_ID),
    [storedGroups]
  );

  // Groups for CategorySelector: displayGroups (carry uids for recency sorting) minus Trash and Misc.
  const selectorGroups = useMemo(
    () => displayGroups.filter((g) => g.id !== TRASH_ID && g.id !== MISC_ID),
    [displayGroups]
  );

  const forageCategory = useMemo(() => {
    if (!showForageModal || catSel.selected.size !== 1) return null;
    const id = [...catSel.selected][0];
    return displayGroups.find((g) => g.id === id) ?? null;
  }, [showForageModal, catSel.selected, displayGroups]);

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

  // Tap a category pill: toggle when selecting, open CategoryView otherwise
  const handleCategoryClick = useCallback((id) => {
    if (catSel.isSelecting) { catSel.toggle(id); return; }
    const cat = displayGroups.find((g) => g.id === id);
    if (cat) setCategoryViewCtx({ category: cat });
  }, [catSel, displayGroups]);

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
      if (e.key === 'Escape') { closeDetail(); return; }
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCtx, closeDetail, goPrev, goNext]);

  const handleUnitSaved = useCallback((updated, newCategory) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (newCategory && newCategory.id !== TRASH_ID) {
      setStoredGroups((prev) => {
        const groups = addCategoryIfNew(prev, newCategory);
        setCategorization(groups);
        return groups;
      });
    }
    setSelectedCtx(null);
  }, []);

  const handleUnitDelete = useCallback(async (id) => {
    const trashed = await updateUnit(id, { categoryId: TRASH_ID });
    setUnits((prev) => prev.map((u) => (u.id === id ? trashed : u)));
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

      {recentCarousel && (
        <div className="landing__carousels">
          <Carousel
            key="recent"
            title={recentCarousel.title}
            units={recentCarousel.units}
            onUnitClick={handleCarouselUnitClick}
            selected={cardSel.selected}
            onCardLongPress={handleCardLongPress}
            groups={storedGroups}
          />
        </div>
      )}

      {storedGroups && displayGroups.length > 0 && (
        <CategoryCloud
          storedGroups={displayGroups}
          onCategoryClick={handleCategoryClick}
          selected={catSel.selected}
          onCategoryLongPress={handleCategoryLongPress}
          accessOrder={accessOrder}
        />
      )}

      {cleanupCandidates.length > 0 && !isSelecting && (
        <button
          type="button"
          className="cleanup-strip"
          onClick={() => setShowCleanupModal(true)}
          aria-label="Clean up stale items"
        >
          <span className="cleanup-strip__inner">
            <BroomIcon size={15} />
            <span className="cleanup-strip__msg">
              <span className="cleanup-strip__count">{cleanupCandidates.length}</span>
              {' '}item{cleanupCandidates.length !== 1 ? 's' : ''} collecting dust
            </span>
            <span className="cleanup-strip__sep">·</span>
            <span className="cleanup-strip__cta">Clean up →</span>
          </span>
        </button>
      )}

      {isSelecting && !isAnyModalOpen ? (
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
              onClick: () => {
                const toDelete = units.filter((u) => cardSel.selected.has(u.id));
                const n = toDelete.length;
                setPendingDelete({
                  title: `Delete ${n} item${n !== 1 ? 's' : ''}?`,
                  units: toDelete,
                  onConfirm: async () => {
                    for (const u of toDelete) {
                      await updateUnit(u.id, { categoryId: TRASH_ID });
                    }
                    reloadUnits();
                    cardSel.clear();
                    setPendingDelete(null);
                  },
                });
              },
            },
            {
              icon: <MoveFolderIcon />,
              label: 'Move to Category',
              onClick: () => setMoveCtx({ units: units.filter((u) => cardSel.selected.has(u.id)) }),
            },
            // {
            //   icon: <OneBIcon />,
            //   label: 'Forage',
            //   onClick: () => {
            //     const selectedUnits = units.filter((u) => cardSel.selected.has(u.id));
            //     const catIds = new Set(selectedUnits.map((u) => u.categoryId));
            //     const sharedGroup = catIds.size === 1 ? storedGroups?.find((g) => g.id === [...catIds][0]) : null;
            //     const category = sharedGroup
            //       ? { id: sharedGroup.id, title: sharedGroup.title, uids: selectedUnits.map((u) => u.uid) }
            //       : { id: 'misc', title: 'Selection', uids: selectedUnits.map((u) => u.uid) };
            //     setCardForageCtx({ units: selectedUnits, category });
            //   },
            // },
          ] : [
            {
              icon: <TrashIcon />,
              label: 'Delete',
              onClick: () => {
                const selCats = displayGroups.filter((g) => catSel.selected.has(g.id));

                // Only Trash selected → permanent hard delete
                if (catSel.selected.size === 1 && catSel.selected.has(TRASH_ID)) {
                  const toDelete = units.filter((u) => u.categoryId === TRASH_ID);
                  const nu = toDelete.length;
                  setPendingDelete({
                    title: `Permanently delete ${nu} item${nu !== 1 ? 's' : ''} from Trash?`,
                    units: toDelete,
                    onConfirm: async () => {
                      for (const u of toDelete) await deleteTrashUnit(u);
                      reloadUnits();
                      catSel.clear();
                      setPendingDelete(null);
                    },
                  });
                  return;
                }

                const selUids = new Set(selCats.flatMap((g) => g.uids));
                const toDelete = units.filter((u) => u.uid && selUids.has(u.uid));
                const nc = catSel.selected.size;
                const nu = toDelete.length;
                setPendingDelete({
                  title: `Delete ${nc} categor${nc !== 1 ? 'ies' : 'y'} and ${nu} item${nu !== 1 ? 's' : ''}?`,
                  units: toDelete,
                  onConfirm: async () => {
                    for (const u of toDelete) {
                      await updateUnit(u.id, { categoryId: TRASH_ID });
                    }
                    setStoredGroups((prev) => {
                      if (!prev) return prev;
                      const cleaned = prev.filter((g) => !catSel.selected.has(g.id) || g.id === TRASH_ID);
                      setCategorization(cleaned);
                      return cleaned;
                    });
                    reloadUnits();
                    catSel.clear();
                    setPendingDelete(null);
                  },
                });
              },
            },
            {
              icon: <RenameIcon />,
              label: 'Rename',
              onClick: () => {
                if (catSel.selected.size !== 1) { setToast('Select exactly 1 category to rename'); return; }
                if (catSel.selected.has(MISC_ID) || catSel.selected.has(TRASH_ID)) { setToast('This category cannot be renamed'); return; }
                const id = [...catSel.selected][0];
                const group = storedGroups?.find((g) => g.id === id);
                if (group) setPendingRename({ id, currentTitle: group.title });
              },
            },
            // {
            //   icon: <OneBIcon />,
            //   label: 'Forage',
            //   onClick: () => {
            //     if (catSel.selected.size !== 1) { setToast('Select exactly 1 category to Forage'); return; }
            //     setShowForageModal(true);
            //   },
            // },
          ]}
        />
      ) : (
        <div className="landing__actions-wrap">
          <div className="landing__actions">
            <button type="button" className="btn-icon" onClick={() => openAddUnit({})} title="Add" aria-label="Add">
              <PlusIcon />
            </button>
            {/* <button type="button" className="btn-icon" onClick={() => navigate('/connect')} title="Connect" aria-label="Connect">
              <ConnectIcon />
            </button> */}
            <button type="button" className="btn-icon" onClick={() => setShowUnitsOverlay(true)} title="Saved" aria-label="Saved">
              <SearchIcon />
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
          storedGroups={selectorGroups}
          accessOrder={accessOrder}
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
                storedGroups={selectorGroups}
                accessOrder={accessOrder}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onPrev={goPrev}
                onNext={goNext}
                navIndex={selectedCtx.index}
                navTotal={selectedCtx.units.length}
              />
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
      {pendingDelete && (
        <ConfirmDeleteModal
          title={pendingDelete.title}
          exportUnits={pendingDelete.units}
          onConfirm={pendingDelete.onConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingRename && (
        <RenameCategoryModal
          currentTitle={pendingRename.currentTitle}
          onConfirm={(newTitle) => handleCategoryRename(pendingRename.id, newTitle)}
          onCancel={() => setPendingRename(null)}
        />
      )}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      {moveCtx && (
        <MoveToCategoryModal
          count={moveCtx.units.length}
          groups={selectableGroups}
          onMove={handleBulkMove}
          onClose={() => setMoveCtx(null)}
        />
      )}

      {forageCategory && (
        <ForageModal
          category={forageCategory}
          allUnits={units}
          onClose={() => { setShowForageModal(false); clearAllSelection(); }}
          onSaveUnit={() => reloadUnits()}
        />
      )}
      {cardForageCtx && (
        <ForageModal
          category={cardForageCtx.category}
          allUnits={cardForageCtx.units}
          onClose={() => { setCardForageCtx(null); cardSel.clear(); }}
          onSaveUnit={() => reloadUnits()}
        />
      )}
      {showCleanupModal && (
        <CleanupModal
          candidates={cleanupCandidates}
          storedGroups={storedGroups}
          onTrash={async (unit) => { await updateUnit(unit.id, { categoryId: TRASH_ID }); reloadUnits(); }}
          onKeep={async (unit) => { await touchUnit(unit.uid); setAccessOrder(await getAccessOrder()); }}
          onClose={() => setShowCleanupModal(false)}
        />
      )}
      {categoryViewCtx && (
        <CategoryView
          category={displayGroups.find((g) => g.id === categoryViewCtx.category.id) ?? categoryViewCtx.category}
          allUnits={units}
          storedGroups={selectorGroups}
          accessOrder={accessOrder}
          onClose={async () => { setCategoryViewCtx(null); setAccessOrder(await getAccessOrder()); }}
          onUnitSaved={(updated, newCategory) => {
            reloadUnits();
            if (newCategory && newCategory.id !== TRASH_ID) {
              setStoredGroups((prev) => {
                const groups = addCategoryIfNew(prev, newCategory);
                setCategorization(groups);
                return groups;
              });
            }
          }}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon, SearchIcon, TrashIcon, ShareIcon, MoveFolderIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { getAllUnits, deleteUnit, getCategorization, setCategorization } from '../utils/db';
import MoveToCategoryModal from './MoveToCategoryModal';
import { withMiscGroup, MISC_ID } from '../utils/carouselGroups';
import { CarouselCard } from './Carousel';
import UnitDetail from './UnitDetail';
import CategoryField from './CategoryField';
import { useSelection } from '../hooks/useSelection';
import SelectionBar from './SelectionBar';

export default function UnitsOverlay({ onClose, initialCategory = '' }) {
  const [units, setUnits] = useState([]);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedCtx, setSelectedCtx] = useState(null); // { units, index }
  const [toast, setToast] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { title, units, onConfirm }
  const inputRef = useRef(null);
  const swipeStart = useRef(null);

  const { selected, isSelecting, toggle, enterWith, selectAll, clear } = useSelection();
  const [moveCtx, setMoveCtx] = useState(null); // { units: Unit[] } | null

  useEffect(() => {
    getAllUnits().then((all) => setUnits(all.slice().reverse()));
    getCategorization().then((g) => setGroups(g || []));
  }, []);

  useEffect(() => {
    if (!initialCategory) inputRef.current?.focus();
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (isSelecting)    { clear(); return; }
      if (selectedCtx)    { setSelectedCtx(null); return; }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, selectedCtx, isSelecting, clear]);

  useEffect(() => {
    if (!selectedCtx) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft')  setSelectedCtx((c) => c && c.index > 0 ? { ...c, index: c.index - 1 } : c);
      if (e.key === 'ArrowRight') setSelectedCtx((c) => c && c.index < c.units.length - 1 ? { ...c, index: c.index + 1 } : c);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCtx]);

  const handleDelete = useCallback(async (id) => {
    await deleteUnit(id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setSelectedCtx(null);
  }, []);

  const handleSaved = useCallback((updated, categoryId, newCategory) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (updated.uid) {
      setGroups((prev) => {
        const base = newCategory ? [...prev, { ...newCategory, uids: [] }] : prev;
        const next = base.map((g) => ({
          ...g,
          uids: g.id === categoryId
            ? [...g.uids.filter((u) => u !== updated.uid), updated.uid]
            : g.uids.filter((u) => u !== updated.uid),
        }));
        setCategorization(next);
        return next;
      });
    }
    setSelectedCtx(null);
  }, []);

  const uidToCategory = useMemo(() => {
    const map = {};
    groups.forEach((g) => g.uids.forEach((uid) => { map[uid] = g.id; }));
    return map;
  }, [groups]);

  const allGroups = useMemo(() => withMiscGroup(units, groups), [units, groups]);

  const q = query.toLowerCase();
  const filtered = units.filter((u) => {
    const searchableContent = u.type === 'image' ? null : u.content;
    const cat = uidToCategory[u.uid];
    return (
      (!q || u.quote?.toLowerCase().includes(q) || u.fileName?.toLowerCase().includes(q) || searchableContent?.toLowerCase().includes(q)) &&
      (!selectedCategory || (selectedCategory === MISC_ID ? !cat : cat === selectedCategory))
    );
  });

  const handleBulkMove = useCallback((categoryId, newCategory) => {
    if (!moveCtx) return;
    const movedUids = new Set(moveCtx.units.map((u) => u.uid).filter(Boolean));
    setGroups((prev) => {
      const base = newCategory ? [...prev, { ...newCategory, uids: [] }] : prev;
      const next = base.map((g) => ({
        ...g,
        uids: categoryId === MISC_ID
          ? g.uids.filter((uid) => !movedUids.has(uid))
          : g.id === categoryId
            ? [...g.uids.filter((uid) => !movedUids.has(uid)), ...movedUids]
            : g.uids.filter((uid) => !movedUids.has(uid)),
      })).filter((g) => g.uids.length > 0);
      setCategorization(next);
      return next;
    });
    clear();
    setMoveCtx(null);
  }, [moveCtx, clear]);

  const unitActions = [
    {
      icon: <TrashIcon />,
      label: 'Delete',
      onClick: () => {
        const toDelete = units.filter((u) => selected.has(u.id));
        const n = toDelete.length;
        setPendingDelete({
          title: `Delete ${n} item${n !== 1 ? 's' : ''}?`,
          units: toDelete,
          onConfirm: async () => {
            for (const u of toDelete) await deleteUnit(u.id);
            const deletedIds = new Set(toDelete.map((u) => u.id));
            const deletedUids = new Set(toDelete.map((u) => u.uid).filter(Boolean));
            setUnits((prev) => prev.filter((u) => !deletedIds.has(u.id)));
            if (deletedUids.size > 0) {
              setGroups((prev) => {
                const cleaned = prev
                  .map((g) => ({ ...g, uids: g.uids.filter((uid) => !deletedUids.has(uid)) }))
                  .filter((g) => g.uids.length > 0);
                setCategorization(cleaned);
                return cleaned;
              });
            }
            clear();
            setPendingDelete(null);
          },
        });
      },
    },
    {
      icon: <ShareIcon />,
      label: 'Share',
      onClick: () => setToast(`Share ${selected.size} item${selected.size !== 1 ? 's' : ''} — coming soon`),
    },
    {
      icon: <MoveFolderIcon />,
      label: 'Move to Category',
      onClick: () => setMoveCtx({ units: filtered.filter((u) => selected.has(u.id)) }),
    },
  ];

  const currentUnit = selectedCtx ? selectedCtx.units[selectedCtx.index] : null;
  const hasPrev = selectedCtx ? selectedCtx.index > 0 : false;
  const hasNext = selectedCtx ? selectedCtx.index < selectedCtx.units.length - 1 : false;

  const handleTouchStart = (e) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!swipeStart.current) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
    swipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) onClose();
  };

  return (
    <>
    <div
      className="search-overlay"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button type="button" className="toast__close" onClick={() => setToast(null)} aria-label="Dismiss">
            <CloseIcon />
          </button>
        </div>
      )}

      <div className="search-header">
        <span className="search-header__icon">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="search-close-btn" onClick={onClose} aria-label="Close">
          Done
        </button>
      </div>

      <CategoryField groups={allGroups} value={selectedCategory} onChange={setSelectedCategory} />

      <div className="search-grid-wrap">
        {filtered.length === 0 ? (
          <p className="search-empty">{query ? 'No matches' : 'Nothing saved yet'}</p>
        ) : (
          <>
          <p className="search-count">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
          <div className="search-grid">
            {filtered.map((unit, i) => (
              <CarouselCard
                key={unit.id}
                unit={unit}
                selected={selected.has(unit.id)}
                onClick={() => isSelecting ? toggle(unit.id) : setSelectedCtx({ units: filtered, index: i })}
                onLongPress={() => enterWith(unit.id)}
              />
            ))}
          </div>
          </>
        )}
      </div>

      {isSelecting && (
        <SelectionBar
          count={selected.size}
          total={filtered.length}
          onSelectAll={() => selectAll(filtered.map((u) => u.id))}
          onClear={clear}
          actions={unitActions}
        />
      )}
    </div>

    {pendingDelete && (
      <ConfirmDeleteModal
        title={pendingDelete.title}
        exportUnits={pendingDelete.units}
        onConfirm={pendingDelete.onConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    )}

    {selectedCtx && currentUnit && (
      <div className="overlay units-overlay" onClick={() => setSelectedCtx(null)}>
        <div className="unit-detail-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="units-panel">
            <UnitDetail
              key={currentUnit.id}
              unit={currentUnit}
              onBack={() => setSelectedCtx(null)}
              onSaved={handleSaved}
              onDelete={handleDelete}
              storedGroups={groups}
            />
          </div>
          <div className="unit-detail-nav" data-testid="unit-detail-nav">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setSelectedCtx((c) => c && c.index > 0 ? { ...c, index: c.index - 1 } : c)}
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
              onClick={() => setSelectedCtx((c) => c && c.index < c.units.length - 1 ? { ...c, index: c.index + 1 } : c)}
              disabled={!hasNext}
              aria-label="Next"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>
    )}
    {moveCtx && (
      <MoveToCategoryModal
        count={moveCtx.units.length}
        groups={groups}
        onMove={handleBulkMove}
        onClose={() => setMoveCtx(null)}
      />
    )}
    </>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon, SearchIcon, TrashIcon, MoveFolderIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { getAllUnits, updateUnit, deleteUnit, getCategorization, setCategorization } from '../utils/db';
import MoveToCategoryModal from './MoveToCategoryModal';
import { withMiscGroup, MISC_ID } from '../utils/carouselGroups';
import { groupByTime } from '../utils/timeGroups';
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
  }, [units]);


  const handleSaved = useCallback((updated, newCategory) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (newCategory) {
      setGroups((prev) => {
        const next = [...prev, { id: newCategory.id, title: newCategory.title }];
        setCategorization(next);
        return next;
      });
    }
    setSelectedCtx(null);
  }, []);

  const allGroups = useMemo(() => withMiscGroup(units, groups), [units, groups]);

  const q = query.toLowerCase();

  // Units matching only the text query — used to compute which category chips to show
  const filteredByQuery = useMemo(() => {
    if (!q) return units;
    return units.filter((u) => {
      const searchableContent = u.type === 'image' ? null : u.content;
      return (
        u.quote?.toLowerCase().includes(q) ||
        u.fileName?.toLowerCase().includes(q) ||
        searchableContent?.toLowerCase().includes(q)
      );
    });
  }, [units, q]);

  // Further narrow by selected category
  const filtered = useMemo(() => {
    if (!selectedCategory) return filteredByQuery;
    const knownIds = new Set(groups.map((g) => g.id));
    return filteredByQuery.filter((u) => {
      const inMisc = !u.categoryId || !knownIds.has(u.categoryId);
      return selectedCategory === MISC_ID ? inMisc : u.categoryId === selectedCategory;
    });
  }, [filteredByQuery, selectedCategory, groups]);

  // Category IDs present in query results — null when no query (show all)
  const activeGroupIds = useMemo(() => {
    if (!q) return null;
    const knownIds = new Set(groups.map((g) => g.id));
    const ids = new Set();
    for (const u of filteredByQuery) {
      ids.add((u.categoryId && knownIds.has(u.categoryId)) ? u.categoryId : MISC_ID);
    }
    return ids;
  }, [filteredByQuery, q, groups]);

  const visibleGroups = useMemo(() => {
    if (!activeGroupIds) return allGroups;
    return allGroups.filter((g) => activeGroupIds.has(g.id));
  }, [allGroups, activeGroupIds]);

  // Clear selected category if it has no results for the current query
  useEffect(() => {
    if (activeGroupIds && selectedCategory && !activeGroupIds.has(selectedCategory)) {
      setSelectedCategory('');
    }
  }, [activeGroupIds, selectedCategory]);

  const handleBulkMove = useCallback(async (categoryId, newCategory) => {
    if (!moveCtx) return;
    const resolvedCategoryId = categoryId === MISC_ID ? null : categoryId;
    for (const u of moveCtx.units) {
      await updateUnit(u.id, { categoryId: resolvedCategoryId });
    }
    setUnits((prev) => prev.map((u) => {
      const moved = moveCtx.units.find((m) => m.id === u.id);
      return moved ? { ...u, categoryId: resolvedCategoryId } : u;
    }));
    if (newCategory) {
      setGroups((prev) => {
        const next = [...prev, { id: newCategory.id, title: newCategory.title }];
        setCategorization(next);
        return next;
      });
    }
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
            const deletedIds = new Set(toDelete.map((u) => u.id));
            for (const u of toDelete) {
              await deleteUnit(u.id);
            }
            setUnits((prev) => prev.filter((u) => !deletedIds.has(u.id)));
            clear();
            setPendingDelete(null);
          },
        });
      },
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

      <CategoryField groups={visibleGroups} value={selectedCategory} onChange={setSelectedCategory} />

      <div className="search-grid-wrap">
        {filtered.length === 0 ? (
          <p className="search-empty">{query ? 'No matches' : 'Nothing saved yet'}</p>
        ) : (
          <>
          <p className="search-count">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
          {(q ? [{ label: null, units: filtered }] : groupByTime(filtered)).map(({ label, units: groupUnits }) => (
            <div key={label ?? '_all'} className="search-time-group">
              {label && <h3 className="search-time-label">{label}</h3>}
              <div className="search-grid">
                {groupUnits.map((unit) => {
                  const i = filtered.indexOf(unit);
                  return (
                    <CarouselCard
                      key={unit.id}
                      unit={unit}
                      selected={selected.has(unit.id)}
                      onClick={() => isSelecting ? toggle(unit.id) : setSelectedCtx({ units: filtered, index: i })}
                      onLongPress={() => enterWith(unit.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
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

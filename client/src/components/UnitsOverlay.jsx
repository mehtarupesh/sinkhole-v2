import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon, SearchIcon, TrashIcon, ShareIcon, MoveFolderIcon } from './Icons';
import { getAllUnits, deleteUnit, getCategorization } from '../utils/db';
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
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [toast, setToast] = useState(null);
  const inputRef = useRef(null);
  const swipeStart = useRef(null);

  const { selected, isSelecting, toggle, enterWith, selectAll, clear } = useSelection();

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
      if (selectedUnit)   { setSelectedUnit(null); return; }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, selectedUnit, isSelecting, clear]);

  const handleDelete = useCallback(async (id) => {
    await deleteUnit(id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setSelectedUnit(null);
  }, []);

  const handleSaved = useCallback((updated) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedUnit(null);
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

  // Action stubs — toasts only until real logic is wired
  const unitActions = [
    {
      icon: <TrashIcon />,
      label: 'Delete',
      onClick: () => setToast(`Delete ${selected.size} item${selected.size !== 1 ? 's' : ''} — coming soon`),
    },
    {
      icon: <ShareIcon />,
      label: 'Share',
      onClick: () => setToast(`Share ${selected.size} item${selected.size !== 1 ? 's' : ''} — coming soon`),
    },
    {
      icon: <MoveFolderIcon />,
      label: 'Move to Category',
      onClick: () => setToast('Move to Category — coming soon'),
    },
  ];

  if (selectedUnit) {
    return (
      <div className="search-overlay">
        <div className="search-detail-wrap">
          <UnitDetail
            unit={selectedUnit}
            onBack={() => setSelectedUnit(null)}
            onSaved={handleSaved}
            onDelete={handleDelete}
            storedGroups={groups}
          />
        </div>
      </div>
    );
  }

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
            {filtered.map((unit) => (
              <CarouselCard
                key={unit.id}
                unit={unit}
                selected={selected.has(unit.id)}
                onClick={() => isSelecting ? toggle(unit.id) : setSelectedUnit(unit)}
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
  );
}

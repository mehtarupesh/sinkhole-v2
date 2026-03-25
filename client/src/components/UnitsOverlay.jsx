import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon, SearchIcon } from './Icons';
import { getAllUnits, deleteUnit, getCategorization } from '../utils/db';
import { CarouselCard } from './Carousel';
import UnitDetail from './UnitDetail';
import CategoryField from './CategoryField';

export default function UnitsOverlay({ onClose }) {
  const [units, setUnits] = useState([]);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    getAllUnits().then((all) => setUnits(all.slice().reverse()));
    getCategorization().then((g) => setGroups(g || []));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedUnit) { setSelectedUnit(null); } else { onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, selectedUnit]);

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

  const q = query.toLowerCase();
  const filtered = units.filter((u) => {
    const searchableContent = u.type === 'image' ? null : u.content;
    return (
      u.quote &&
      (!q || u.quote.toLowerCase().includes(q) || u.fileName?.toLowerCase().includes(q) || searchableContent?.toLowerCase().includes(q)) &&
      (!selectedCategory || uidToCategory[u.uid] === selectedCategory)
    );
  });

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

  return (
    <div className="search-overlay">
      <div className="search-grid-wrap">
        {filtered.length === 0 ? (
          <p className="search-empty">{query ? 'No matches' : 'Nothing saved yet'}</p>
        ) : (
          <div className="search-grid">
            {filtered.map((unit) => (
              <CarouselCard
                key={unit.id}
                unit={unit}
                onClick={() => setSelectedUnit(unit)}
              />
            ))}
          </div>
        )}
      </div>

      <CategoryField groups={groups} value={selectedCategory} onChange={setSelectedCategory} />

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
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

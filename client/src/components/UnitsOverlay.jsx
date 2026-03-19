import { useState, useEffect, useCallback, useRef } from 'react';
import { CloseIcon, SearchIcon } from './Icons';
import { getAllUnits, deleteUnit } from '../utils/db';
import { CarouselCard } from './Carousel';
import UnitDetail from './UnitDetail';

export default function UnitsOverlay({ onClose }) {
  const [units, setUnits] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    getAllUnits().then((all) => setUnits(all.slice().reverse()));
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

  const q = query.toLowerCase();
  const filtered = units.filter((u) =>
    !q ||
    u.content?.toLowerCase().includes(q) ||
    u.fileName?.toLowerCase().includes(q) ||
    u.quote?.toLowerCase().includes(q)
  );

  if (selectedUnit) {
    return (
      <div className="search-overlay">
        <div className="search-detail-wrap">
          <UnitDetail
            unit={selectedUnit}
            onBack={() => setSelectedUnit(null)}
            onSaved={handleSaved}
            onDelete={handleDelete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="search-overlay">
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
    </div>
  );
}

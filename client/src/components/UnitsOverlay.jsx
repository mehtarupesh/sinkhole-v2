import { useState, useEffect, useCallback } from 'react';
import { CloseIcon } from './Icons';
import { getAllUnits, deleteUnit } from '../utils/db';
import UnitDetail from './UnitDetail';

const TYPE_LABELS = { snippet: 'text', password: 'pw', image: 'img' };

function UnitCard({ unit, onClick, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    await onDelete(unit.id);
  };

  return (
    <button type="button" className="unit-card" onClick={onClick} aria-label={`Open unit ${unit.id}`}>
      <div className="unit-card__header">
        <span className="unit-card__type">{TYPE_LABELS[unit.type] ?? unit.type}</span>
        <span className="unit-card__date">{new Date(unit.createdAt).toLocaleDateString()}</span>
        <span
          role="button"
          tabIndex={0}
          className={`btn-conn-close unit-card__delete${confirming ? ' unit-card__delete--confirm' : ''}`}
          onClick={handleDelete}
          onKeyDown={(e) => e.key === 'Enter' && handleDelete(e)}
          onBlur={() => setConfirming(false)}
          aria-label="Delete unit"
          title={confirming ? 'Click again to confirm' : 'Delete'}
        >
          {confirming ? '?' : <CloseIcon />}
        </span>
      </div>

      <div className="unit-card__body">
        {unit.type === 'snippet' && (
          <p className="unit-card__text">{unit.content}</p>
        )}
        {unit.type === 'password' && (
          <p className="unit-card__text unit-card__text--muted">{'•'.repeat(Math.min(unit.content.length, 16))}</p>
        )}
        {unit.type === 'image' && unit.mimeType?.startsWith('image/') && (
          <img src={unit.content} alt={unit.fileName} className="unit-card__img" />
        )}
        {unit.type === 'image' && !unit.mimeType?.startsWith('image/') && (
          <p className="unit-card__text unit-card__text--muted">{unit.fileName}</p>
        )}
      </div>

      {unit.quote && (
        <p className="unit-card__quote">
          <span className="add-unit__quote-mark">"</span>
          {unit.quote}
        </p>
      )}
    </button>
  );
}

export default function UnitsOverlay({ onClose }) {
  const [units, setUnits] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);

  useEffect(() => {
    getAllUnits().then((all) => setUnits(all.slice().reverse()));
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

  return (
    <div className="overlay units-overlay" onClick={selectedUnit ? undefined : onClose}>
      <div className="units-panel" onClick={(e) => e.stopPropagation()}>
        {selectedUnit ? (
          <UnitDetail
            unit={selectedUnit}
            onBack={() => setSelectedUnit(null)}
            onSaved={handleSaved}
            onDelete={handleDelete}
          />
        ) : (
          <>
            <div className="modal__header">
              <span className="modal__title">
                Saved
                <span className="modal__count" data-testid="units-count">{units.length}</span>
              </span>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <input
              type="search"
              className="units-search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />

            <div className="units-list">
              {filtered.length === 0 && (
                <p className="units-empty">{query ? 'No matches' : 'Nothing saved yet'}</p>
              )}
              {filtered.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  onClick={() => setSelectedUnit(unit)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

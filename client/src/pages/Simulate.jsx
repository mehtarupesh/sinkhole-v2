import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllUnits, getSetting } from '../utils/db';
import { categorizeUnits } from '../utils/categorize';
import Carousel from '../components/Carousel';
import UnitDetail from '../components/UnitDetail';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';

// ── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ value, min, max, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef(null);

  // Keep draft in sync when value changes externally (e.g. parent resets count)
  useEffect(() => { setDraft(String(value)); }, [value]);

  function commit(raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    // Reset to actual value (covers empty / out-of-range input)
    setDraft(String(value));
  }

  return (
    <div className="sim-stepper">
      <button
        type="button"
        className="btn-icon"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="One fewer entry"
      >
        <ChevronLeftIcon />
      </button>

      <span className="sim-stepper__label">
        <input
          ref={inputRef}
          className="sim-stepper__input"
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label="Entry count"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commit(draft); inputRef.current?.blur(); }
            if (e.key === 'Escape') { setDraft(String(value)); inputRef.current?.blur(); }
          }}
          onFocus={(e) => e.target.select()}
        />
        <span className="sim-stepper__of">of</span>
        <span className="sim-stepper__total">{max}</span>
      </span>

      <button
        type="button"
        className="btn-icon"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="One more entry"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Simulate() {
  const navigate = useNavigate();

  const [allUnits, setAllUnits]   = useState([]);
  const [count, setCount]         = useState(0);
  const [carousels, setCarousels] = useState([]);
  const [status, setStatus]       = useState('idle'); // idle | loading | done | error
  const [error, setError]         = useState('');
  const [selectedCtx, setSelectedCtx] = useState(null);

  // Load units once, sorted chronologically
  useEffect(() => {
    getAllUnits().then((units) => {
      const sorted = [...units].sort((a, b) => a.createdAt - b.createdAt);
      setAllUnits(sorted);
      setCount(sorted.length);
    });
  }, []);

  const visibleUnits = allUnits.slice(0, count);

  // ── Categorize ──────────────────────────────────────────────────────────────

  const handleCategorize = useCallback(async () => {
    setStatus('loading');
    setError('');
    setCarousels([]);
    try {
      const apiKey = await getSetting('gemini_key');
      if (!apiKey) throw new Error('No Gemini API key found. Add one in Settings (⚙).');
      const result = await categorizeUnits(visibleUnits, apiKey);
      setCarousels(result);
      setStatus('done');
    } catch (e) {
      setError(e.message ?? 'Categorization failed.');
      setStatus('error');
    }
  }, [visibleUnits]);

  // ── Unit detail (read-only in simulator) ───────────────────────────────────

  const openUnit     = useCallback((unit, ctxUnits, index) => setSelectedCtx({ units: ctxUnits, index }), []);
  const closeDetail  = useCallback(() => setSelectedCtx(null), []);
  const currentUnit  = selectedCtx ? selectedCtx.units[selectedCtx.index] : null;
  const hasPrev      = selectedCtx ? selectedCtx.index > 0 : false;
  const hasNext      = selectedCtx ? selectedCtx.index < selectedCtx.units.length - 1 : false;
  const goPrev       = useCallback(() => setSelectedCtx((c) => c && c.index > 0 ? { ...c, index: c.index - 1 } : c), []);
  const goNext       = useCallback(() => setSelectedCtx((c) => c && c.index < c.units.length - 1 ? { ...c, index: c.index + 1 } : c), []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="landing landing--has-units">

      {/* Header */}
      <div className="sim-header">
        <button type="button" className="btn-icon" onClick={() => navigate('/')} aria-label="Back">
          <ChevronLeftIcon />
        </button>
        <h1 className="sim-header__title">Carousel Simulator</h1>
      </div>

      {/* Controls */}
      {allUnits.length > 0 ? (
        <div className="sim-controls">
          <Stepper
            value={count}
            min={1}
            max={allUnits.length}
            onChange={(n) => { setCount(n); setCarousels([]); setStatus('idle'); }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleCategorize}
            disabled={status === 'loading' || count === 0}
          >
            {status === 'loading' ? 'Categorizing…' : 'Categorize'}
          </button>
        </div>
      ) : (
        <p className="sim-empty">No entries in your vault yet.</p>
      )}

      {/* Error */}
      {error && <p className="sim-error">{error}</p>}

      {/* Carousels */}
      {carousels.length > 0 && (
        <div className="landing__carousels">
          {carousels.map((c) => (
            <Carousel key={c.id} title={c.title} units={c.units} onUnitClick={openUnit} />
          ))}
        </div>
      )}

      {/* Idle hint */}
      {status === 'idle' && carousels.length === 0 && count > 0 && (
        <p className="sim-hint">
          {count} entr{count === 1 ? 'y' : 'ies'} selected — hit Categorize to generate carousels.
        </p>
      )}

      {/* Unit detail overlay (read-only — edits/deletes close the overlay) */}
      {selectedCtx && currentUnit && (
        <div className="overlay units-overlay" onClick={closeDetail}>
          <div className="unit-detail-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="units-panel">
              <UnitDetail
                key={currentUnit.id}
                unit={currentUnit}
                onBack={closeDetail}
                onSaved={closeDetail}
                onDelete={closeDetail}
              />
            </div>
            <div className="unit-detail-nav">
              <button type="button" className="btn-icon" onClick={goPrev} disabled={!hasPrev} aria-label="Previous">
                <ChevronLeftIcon />
              </button>
              <span className="unit-detail-nav__count">
                {selectedCtx.index + 1} / {selectedCtx.units.length}
              </span>
              <button type="button" className="btn-icon" onClick={goNext} disabled={!hasNext} aria-label="Next">
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

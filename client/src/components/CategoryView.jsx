/**
 * CategoryView — full-screen view for a single category.
 *
 * Shows a synthesis header (1-shot AI answer, auto-runs on open) with
 * swappable quick-prompts and a custom question input, followed by the
 * category's units in a time-grouped grid.
 *
 * Props:
 *   category     { id, title, uids }
 *   allUnits     Unit[]               all units in the app
 *   storedGroups { id, title }[]      for UnitDetail's category picker
 *   onClose      fn
 *   onUnitSaved  fn(updated, newCategory?)   reload trigger for Landing
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { CarouselCard } from './Carousel';
import { groupByTime } from '../utils/timeGroups';
import { forageUnits } from '../utils/forage';
import { getSetting, updateUnit } from '../utils/db';
import { TRASH_ID } from '../utils/carouselGroups';
import SimpleMarkdown from './SimpleMarkdown';
import UnitDetail from './UnitDetail';
import ExploreModal from './ExploreModal';
import './CategoryView.css';

const SYNTHESIS_CHIPS = [
  { key: 'summarize',  label: 'Summarize',     prompt: 'Summarize this collection in 2-3 sentences. Be brief and direct.' },
  { key: 'actions',   label: 'Action items',   prompt: 'List action items only. Maximum 5 bullet points, each one line.' },
  { key: 'keypoints', label: 'Key points',     prompt: 'What are the 3-4 most important points? One line per point.' },
  { key: 'questions', label: 'Open questions', prompt: 'What questions are unresolved or worth following up? Max 4 bullets.' },
];

// ── Client-side stats (no AI, instant) ──────────────────────────────────────

function computeStats(units) {
  if (!units.length) return null;
  const now = Date.now();

  // Last added
  const latest = Math.max(...units.map((u) => u.createdAt ?? 0));
  const diffDays = Math.floor((now - latest) / 86_400_000);
  const lastAdded = diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : `${diffDays}d ago`;

  // Most active day of week
  const dayCounts = {};
  for (const u of units) {
    const day = new Date(u.createdAt ?? 0).toLocaleDateString('en', { weekday: 'long' });
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
  // Only surface it if that day has ≥35% of items (a real pattern)
  const activeDay = topDay && topDay[1] / units.length >= 0.35 ? topDay[0] : null;

  // Items added this month (calendar month)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = units.filter((u) => (u.createdAt ?? 0) >= monthStart).length;
  const monthStat = thisMonth > 0 ? `${thisMonth} item${thisMonth !== 1 ? 's' : ''} this month` : null;

  return { lastAdded, activeDay, monthStat };
}

export default function CategoryView({ category, allUnits, storedGroups, onClose, onUnitSaved }) {
  const units = useMemo(
    () => allUnits.filter((u) => category.uids.includes(u.uid)),
    [allUnits, category.uids]
  );

  // Synthesis state
  const [activeChip, setActiveChip]         = useState('summarize');
  const [customQ, setCustomQ]               = useState('');
  const [synthesis, setSynthesis]           = useState('');
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [shareContent, setShareContent]     = useState(false);
  const [synthesisError, setSynthesisError] = useState('');

  // Unit detail state
  const [selectedCtx, setSelectedCtx]       = useState(null); // { units, index }

  // Explore modal
  const [showExplore, setShowExplore]       = useState(false);

  const swipeStart = useRef(null);

  const hasShareableContent = useMemo(
    () => units.some((u) => u.type !== 'password' && u.content),
    [units]
  );

  const currentQuestion = customQ.trim() ||
    SYNTHESIS_CHIPS.find((c) => c.key === activeChip)?.prompt ||
    SYNTHESIS_CHIPS[0].prompt;

  const stats = useMemo(() => computeStats(units), [units]);

  // ── Synthesis ────────────────────────────────────────────────────────────────

  const runSynthesis = useCallback(async (question, sc = shareContent) => {
    if (!units.length) return;
    setSynthesisLoading(true);
    setSynthesis('');
    setSynthesisError('');
    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await forageUnits({ units, question, shareContent: sc, apiKey });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.text ?? '';
        setSynthesis(text);
      }
    } catch (e) {
      setSynthesisError(e.message ?? 'Synthesis failed.');
    } finally {
      setSynthesisLoading(false);
    }
  }, [units, shareContent]);

  const handleChipClick = useCallback((key) => {
    setActiveChip(key);
    setCustomQ('');
    const chip = SYNTHESIS_CHIPS.find((c) => c.key === key);
    runSynthesis(chip.prompt);
  }, [runSynthesis]);

  const handleCustomRun = useCallback(() => {
    if (!customQ.trim()) return;
    setActiveChip('');
    runSynthesis(customQ.trim());
  }, [customQ, runSynthesis]);

  // ── Unit navigation ──────────────────────────────────────────────────────────

  // Flat list in visual (time-grouped) order — used for prev/next navigation
  const visuallyOrdered = useMemo(
    () => groupByTime(units).flatMap(({ units: g }) => g),
    [units]
  );

  const currentUnit = selectedCtx ? selectedCtx.units[selectedCtx.index] : null;
  const hasPrev = selectedCtx && selectedCtx.index > 0;
  const hasNext = selectedCtx && selectedCtx.index < selectedCtx.units.length - 1;

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (showExplore) return;
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedCtx)   { setSelectedCtx(null); return; }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, selectedCtx, showExplore]);

  useEffect(() => {
    if (!selectedCtx) return;
    const handler = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft')  setSelectedCtx((c) => c && c.index > 0 ? { ...c, index: c.index - 1 } : c);
      if (e.key === 'ArrowRight') setSelectedCtx((c) => c && c.index < c.units.length - 1 ? { ...c, index: c.index + 1 } : c);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCtx]);

  // ── Touch swipe to close ─────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────────

  const timeGroups = useMemo(() => groupByTime(units), [units]);

  return (
    <>
      <div
        className="search-overlay category-view"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="category-view__header">
          <button className="btn-icon category-view__back" onClick={onClose} aria-label="Back">
            <ChevronLeftIcon />
          </button>
          <div className="category-view__title-wrap">
            <span className="category-view__title">{category.title}</span>
            <span className="category-view__count">{units.length}</span>
          </div>
          <button
            className="category-view__explore-btn"
            onClick={() => setShowExplore(true)}
            type="button"
          >
            Forage ✦
          </button>
        </div>

        {/* Synthesis section */}
        <div className="category-view__synthesis">
          {/* Personal stats — instant, no AI */}
          {stats && (
            <div className="category-view__stats">
              <span className="category-view__stat">Last added {stats.lastAdded}</span>
              {stats.activeDay && (
                <span className="category-view__stat">Active on {stats.activeDay}s</span>
              )}
              {stats.monthStat && (
                <span className="category-view__stat">{stats.monthStat}</span>
              )}
            </div>
          )}

          {/* Quick-prompt chips */}
          <div className="category-view__chips">
            {SYNTHESIS_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`forage__quick-chip${activeChip === c.key && !customQ ? ' forage__quick-chip--active' : ''}`}
                onClick={() => handleChipClick(c.key)}
                disabled={synthesisLoading}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Custom question row */}
          <div className="category-view__custom-row">
            <input
              className="category-view__custom-input"
              placeholder="Custom question…"
              value={customQ}
              onChange={(e) => setCustomQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCustomRun(); }}
              disabled={synthesisLoading}
            />
            {customQ.trim() && (
              <button
                className="category-view__run-btn"
                type="button"
                onClick={handleCustomRun}
                disabled={synthesisLoading}
                aria-label="Run"
              >
                {synthesisLoading ? '…' : '✦'}
              </button>
            )}
          </div>

          {/* Response */}
          {(synthesis || synthesisLoading || synthesisError) && (
            <div className="category-view__response">
              {synthesisLoading && !synthesis ? (
                <div className="forage__response-loading">
                  <span className="note-field__spinner" />
                  <span>Synthesizing…</span>
                </div>
              ) : synthesisError ? (
                <p className="modal__error" style={{ margin: 0 }}>{synthesisError}</p>
              ) : (
                <>
                  <SimpleMarkdown text={synthesis} className="forage__markdown" />
                  {synthesisLoading && <span className="forage__cursor" aria-hidden="true">▋</span>}
                </>
              )}
            </div>
          )}

          {/* Share content toggle — subtle, below response */}
          {hasShareableContent && (synthesis || synthesisError) && (
            <button
              className={`category-view__share-toggle${shareContent ? ' category-view__share-toggle--on' : ''}`}
              type="button"
              onClick={() => {
                const next = !shareContent;
                setShareContent(next);
                runSynthesis(currentQuestion, next);
              }}
              disabled={synthesisLoading}
            >
              ✦ {shareContent ? 'Content included · tap to use metadata only' : 'Metadata only · tap to include content'}
            </button>
          )}
        </div>

        {/* Units grid */}
        <div className="search-grid-wrap">
          {units.length === 0 ? (
            <p className="search-empty">No items</p>
          ) : (
            timeGroups.map(({ label, units: groupUnits }) => (
              <div key={label} className="search-time-group">
                {label && <h3 className="search-time-label">{label}</h3>}
                <div className="search-grid">
                  {groupUnits.map((unit) => {
                    const i = visuallyOrdered.indexOf(unit);
                    return (
                      <CarouselCard
                        key={unit.id}
                        unit={unit}
                        selected={false}
                        onClick={() => setSelectedCtx({ units: visuallyOrdered, index: i >= 0 ? i : 0 })}
                        onLongPress={() => setSelectedCtx({ units: visuallyOrdered, index: i >= 0 ? i : 0 })}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Unit detail overlay */}
      {selectedCtx && currentUnit && (
        <div className="overlay units-overlay" onClick={() => setSelectedCtx(null)}>
          <div className="unit-detail-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="units-panel">
              <UnitDetail
                key={currentUnit.id}
                unit={currentUnit}
                onBack={() => setSelectedCtx(null)}
                onSaved={(updated, newCategory) => {
                  onUnitSaved?.(updated, newCategory);
                  setSelectedCtx(null);
                }}
                onDelete={async (id) => {
                  await updateUnit(id, { categoryId: TRASH_ID });
                  onUnitSaved?.();
                  setSelectedCtx(null);
                }}
                storedGroups={storedGroups}
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

      {/* Explore modal */}
      {showExplore && (
        <ExploreModal
          category={category}
          allUnits={units}
          synthesis={synthesis}
          onClose={() => setShowExplore(false)}
          onSaveUnit={onUnitSaved}
        />
      )}
    </>
  );
}

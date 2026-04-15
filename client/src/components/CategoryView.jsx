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
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon, MoveFolderIcon, CopyIcon, CheckIcon, RenameIcon } from './Icons';
import { CarouselCard } from './Carousel';
import { groupByTime } from '../utils/timeGroups';
import { synthesizeFromUnits } from '../utils/forage';
import { getSetting, updateUnit, setCategorization, getSynthesisCache, setSynthesisCacheEntry, deleteSynthesisCacheEntry } from '../utils/db';
import { TRASH_ID, addCategoryIfNew } from '../utils/carouselGroups';
import SimpleMarkdown from './SimpleMarkdown';
import NoteTray from './NoteTray';
import UnitDetail from './UnitDetail';
import ExploreModal from './ExploreModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import MoveToCategoryModal from './MoveToCategoryModal';
import SelectionBar from './SelectionBar';
import { useSelection } from '../hooks/useSelection';
import './CategoryView.css';

const DEFAULT_SYNTHESIS_PROMPT =
  'Summarize Action Items and Key Points';

// ── Client-side stats (no AI, instant) ──────────────────────────────────────

function computeStats(units) {
  if (!units.length) return null;
  const now = Date.now();

  // Last added
  const latest = Math.max(...units.map((u) => u.createdAt ?? 0));
  const diffDays = Math.floor((now - latest) / 86_400_000);
  const lastAdded = diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : `${diffDays}d ago`;

  // Items added this month (calendar month)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = units.filter((u) => (u.createdAt ?? 0) >= monthStart).length;
  const monthStat = thisMonth > 0 ? `${thisMonth} item${thisMonth !== 1 ? 's' : ''} this month` : null;

  return { lastAdded, monthStat };
}

export default function CategoryView({ category, allUnits, storedGroups, onClose, onUnitSaved }) {
  const units = useMemo(
    () => allUnits.filter((u) => category.uids.includes(u.uid)),
    [allUnits, category.uids]
  );

  // Synthesis state
  const [customQ, setCustomQ]               = useState('');
  const [synthesis, setSynthesis]           = useState('');
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [shareContent, setShareContent]     = useState(false);
  const [synthesisError, setSynthesisError] = useState('');
  const [cacheUnitCount, setCacheUnitCount] = useState(null);
  const [confirmClearSynthesis, setConfirmClearSynthesis] = useState(false);
  const [isEditingSynthesis, setIsEditingSynthesis] = useState(false);
  const [synthesisCopied, setSynthesisCopied] = useState(false);
  const synthesisCopyTimerRef = useRef(null);
  const synthesisTextareaRef = useRef(null);

  // Unit detail state
  const [selectedCtx, setSelectedCtx]       = useState(null); // { units, index }

  // Explore modal
  const [showExplore, setShowExplore]       = useState(false);

  // Selection / action bar
  const { selected, isSelecting, toggle, enterWith, selectAll, clear } = useSelection();
  const [pendingDelete, setPendingDelete]   = useState(null); // { title, units, onConfirm }
  const [moveCtx, setMoveCtx]               = useState(null); // { units: Unit[] } | null

  const swipeStart = useRef(null);

  // ── Load cache on open, auto-run if no cache and enough items ────────────────

  useEffect(() => {
    let cancelled = false;
    async function loadCache() {
      const cache = await getSynthesisCache();
      const entry = cache[category.id];
      if (cancelled) return;
      if (entry) {
        setSynthesis(entry.answer);
        setCustomQ(entry.question);
        setCacheUnitCount(entry.unitCount);
      } else {
        setCustomQ(DEFAULT_SYNTHESIS_PROMPT);
      }
    }
    loadCache();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  const hasShareableContent = useMemo(
    () => units.some((u) => u.content && !u.encrypted),
    [units]
  );

  const currentQuestion = customQ.trim() || DEFAULT_SYNTHESIS_PROMPT;

  const stats = useMemo(() => computeStats(units), [units]);
  const newItemsSinceSynthesis = cacheUnitCount !== null ? units.length - cacheUnitCount : 0;

  // ── Synthesis ────────────────────────────────────────────────────────────────

  const runSynthesis = useCallback(async (question, sc = shareContent) => {
    if (!units.length) return;
    setSynthesisLoading(true);
    setSynthesis('');
    setSynthesisError('');
    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await synthesizeFromUnits({ units, question, shareContent: sc, apiKey });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.text ?? '';
        setSynthesis(text);
      }
      const unitCount = units.length;
      await setSynthesisCacheEntry(category.id, { question, answer: text, computedAt: Date.now(), unitCount });
      setCacheUnitCount(unitCount);
    } catch (e) {
      setSynthesisError(e.message ?? 'Synthesis failed.');
    } finally {
      setSynthesisLoading(false);
    }
  }, [units, shareContent, category.id]);


  const handleCustomRun = useCallback(() => {
    if (!customQ.trim()) return;
    runSynthesis(customQ.trim());
  }, [customQ, runSynthesis]);

  const handleClearSynthesis = useCallback(async () => {
    if (!confirmClearSynthesis) { setConfirmClearSynthesis(true); return; }
    await deleteSynthesisCacheEntry(category.id);
    setSynthesis('');
    // setCustomQ('');
    setCacheUnitCount(null);
    setSynthesisError('');
    setConfirmClearSynthesis(false);
  }, [confirmClearSynthesis, category.id]);

  const handleSynthesisCopy = useCallback(async () => {
    if (!synthesis) return;
    try {
      await navigator.clipboard.writeText(synthesis);
      clearTimeout(synthesisCopyTimerRef.current);
      setSynthesisCopied(true);
      synthesisCopyTimerRef.current = setTimeout(() => setSynthesisCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [synthesis]);

  const handleSynthesisSave = useCallback(async (text) => {
    setSynthesis(text);
    setIsEditingSynthesis(false);
    await setSynthesisCacheEntry(category.id, {
      question: customQ.trim() || DEFAULT_SYNTHESIS_PROMPT,
      answer: text,
      computedAt: Date.now(),
      unitCount: units.length,
    });
  }, [category.id, customQ, units.length]);

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
      if (isSelecting)   { clear(); return; }
      if (selectedCtx)   { setSelectedCtx(null); return; }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, selectedCtx, showExplore, isSelecting, clear]);

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

  // ── Bulk actions ─────────────────────────────────────────────────────────────

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
            for (const u of toDelete) {
              await updateUnit(u.id, { categoryId: TRASH_ID });
            }
            onUnitSaved?.();
            clear();
            setPendingDelete(null);
          },
        });
      },
    },
    {
      icon: <MoveFolderIcon />,
      label: 'Move to Category',
      onClick: () => setMoveCtx({ units: units.filter((u) => selected.has(u.id)) }),
    },
  ];

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
            <div className="category-view__title-row">
              <span className="category-view__title">{category.title}</span>
              <span className="category-view__count">{units.length}</span>
            </div>
            {stats && (
              <div className="category-view__stats">
                <span className="category-view__stat">Last added {stats.lastAdded}</span>
                {stats.monthStat && (
                  <span className="category-view__stat">{stats.monthStat}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Synthesis section */}
        <div className="category-view__synthesis">
          {/* Custom question row */}
          <div className="category-view__custom-row">
            <NoteTray
              className="category-view__note-tray"
              value={customQ}
              onChange={setCustomQ}
              onSubmit={handleCustomRun}
              onTranscribed={(text) => runSynthesis(text)}
              disabled={synthesisLoading}
              placeholder="Custom question…"
              defaultMode="text-hero"
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

          {newItemsSinceSynthesis > 0 && (
            <p className="category-view__stale-hint">
              ✦ {newItemsSinceSynthesis} new item{newItemsSinceSynthesis !== 1 ? 's' : ''} since last synthesis
            </p>
          )}

          {/* Response */}
          {(synthesis || synthesisLoading || synthesisError) && (
            <div className="category-view__response">
              {!synthesisLoading && (
                <div className="category-view__response-actions">
                  <button
                    type="button"
                    className={`category-view__response-clear unit-detail__delete${confirmClearSynthesis ? ' unit-detail__delete--confirm' : ''}`}
                    onClick={handleClearSynthesis}
                    onBlur={() => setConfirmClearSynthesis(false)}
                    aria-label="Clear synthesis"
                  >
                    {confirmClearSynthesis ? 'Confirm?' : <TrashIcon />}
                  </button>
                  {!isEditingSynthesis && synthesis && (
                    <>
                      <button
                        type="button"
                        className="add-unit__copy-btn"
                        onClick={() => setIsEditingSynthesis(true)}
                        aria-label="Edit synthesis"
                      >
                        <RenameIcon size={13} />
                      </button>
                      <button
                        type="button"
                        className={`add-unit__copy-btn${synthesisCopied ? ' add-unit__copy-btn--copied' : ''}`}
                        onClick={handleSynthesisCopy}
                        aria-label="Copy synthesis"
                      >
                        {synthesisCopied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                      </button>
                    </>
                  )}
                </div>
              )}
              {synthesisLoading && !synthesis ? (
                <div className="forage__response-loading">
                  <span className="note-field__spinner" />
                  <span>Synthesizing…</span>
                </div>
              ) : synthesisError ? (
                <p className="modal__error" style={{ margin: 0 }}>{synthesisError}</p>
              ) : isEditingSynthesis ? (
                <textarea
                  ref={synthesisTextareaRef}
                  className="category-view__synthesis-textarea"
                  value={synthesis}
                  onChange={(e) => {
                    setSynthesis(e.target.value);
                    const el = synthesisTextareaRef.current;
                    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
                  }}
                  onFocus={(e) => {
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                  onBlur={(e) => handleSynthesisSave(e.target.value)}
                  autoFocus
                />
              ) : (
                <>
                  <SimpleMarkdown text={synthesis} className="forage__markdown" />
                  {synthesisLoading && <span className="forage__cursor" aria-hidden="true">▋</span>}
                </>
              )}
            </div>
          )}

          {/* Chat button — always visible below response, never buried in scroll */}
          {synthesis && !synthesisLoading && !isEditingSynthesis && (
            <div className="category-view__chat-bar">
              <button
                type="button"
                className="category-view__chat-btn"
                onClick={() => setShowExplore(true)}
              >
                Chat ✦
              </button>
            </div>
          )}

          {/* Share content toggle — subtle, below response */}
          {/* {hasShareableContent && (synthesis || synthesisError) && (
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
          )} */}
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
                        selected={selected.has(unit.id)}
                        onClick={() => isSelecting ? toggle(unit.id) : setSelectedCtx({ units: visuallyOrdered, index: i >= 0 ? i : 0 })}
                        onLongPress={() => enterWith(unit.id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {isSelecting && (
          <SelectionBar
            count={selected.size}
            total={units.length}
            onSelectAll={() => selectAll(units.map((u) => u.id))}
            onClear={clear}
            actions={unitActions}
          />
        )}
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

      {pendingDelete && (
        <ConfirmDeleteModal
          title={pendingDelete.title}
          exportUnits={pendingDelete.units}
          onConfirm={pendingDelete.onConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {moveCtx && (
        <MoveToCategoryModal
          count={moveCtx.units.length}
          groups={storedGroups.filter((g) => g.id !== TRASH_ID)}
          onMove={async (categoryId, newCategory) => {
            const resolvedId = categoryId === 'misc' ? null : categoryId;
            for (const u of moveCtx.units) {
              await updateUnit(u.id, { categoryId: resolvedId });
            }
            if (newCategory) {
              setCategorization(addCategoryIfNew(storedGroups, newCategory));
            }
            onUnitSaved?.();
            clear();
            setMoveCtx(null);
          }}
          onClose={() => setMoveCtx(null)}
        />
      )}
    </>
  );
}
